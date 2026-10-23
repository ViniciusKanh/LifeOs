//! LifeOS Desktop (Tauri 2) — aplicativo nativo do Windows integrado à Vercel.
//!
//! A janela abre uma tela local de abertura (`boot/`) que confere a conexão e
//! então carrega o LifeOS publicado na Vercel. Assim, todo deploy da Web chega
//! ao Desktop na hora; o instalador só muda quando a parte nativa muda (e aí o
//! Tauri Updater cuida disso, com aviso na própria interface). Segurança:
//! - o site remoto recebe apenas as permissões listadas em `remote_capability`,
//!   e só no domínio publicado;
//! - a navegação fica presa ao LifeOS: links externos abrem no navegador padrão;
//! - login com Google: abre no navegador do sistema (o Google bloqueia OAuth em
//!   webviews) e volta por deep link `lifeos://auth?code=...`, com PKCE;
//! - nenhum segredo (Turso, Gemini, SMTP) existe no app — tudo segue na API.
//!
//! Etapa 4 (integração com o Windows): ícone na bandeja com menu, fechar (X)
//! esconde na bandeja, atalho global Ctrl+Shift+Espaço para a captura rápida e
//! notificações nativas pedidas pela interface (comando `desktop_notify`).
//! A interface recebe as ações nativas como eventos DOM (`lifeos:desktop` e
//! `lifeos:open-palette`) disparados por scripts fixos — nada vindo de fora
//! é interpolado no JavaScript executado.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    ipc::CapabilityBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use url::Url;

/// LifeOS publicado. Pode ser trocado no build com a variável LIFEOS_REMOTE_URL.
const REMOTE_URL: &str = match option_env!("LIFEOS_REMOTE_URL") {
    Some(url) => url,
    None => "https://lifeos-sigma-five.vercel.app",
};

fn remote_origin() -> Url {
    Url::parse(REMOTE_URL).expect("LIFEOS_REMOTE_URL inválida")
}

/// Navegação permitida dentro da janela: a tela local e o domínio do LifeOS.
fn is_allowed_navigation(url: &Url) -> bool {
    let local = matches!(url.scheme(), "tauri") || url.host_str() == Some("tauri.localhost");
    local || same_origin(url, &remote_origin()) || url.scheme() == "about"
}

/// Permissões nativas do LifeOS remoto — mínimo necessário, só no domínio publicado.
/// O updater só instala pacotes assinados com a chave pública do tauri.conf.json,
/// então a interface pode verificar/baixar/instalar sem risco de versão adulterada.
fn remote_capability() -> CapabilityBuilder {
    CapabilityBuilder::new("lifeos-remote")
        .remote(format!("{}/*", REMOTE_URL.trim_end_matches('/')))
        .window("main")
        .permission("core:app:allow-version")
        .permission("updater:allow-check")
        .permission("updater:allow-download-and-install")
        .permission("process:allow-restart")
        .permission("allow-open-google-login")
        .permission("allow-desktop-notify")
}

fn same_origin(url: &Url, remote: &Url) -> bool {
    url.scheme() == remote.scheme() && url.host_str() == remote.host_str() && url.port_or_known_default() == remote.port_or_known_default()
}

/// Só aceita o início do login com Google do próprio LifeOS (com desafio PKCE).
fn is_google_login_start(url: &Url) -> bool {
    same_origin(url, &remote_origin())
        && url.path().ends_with("/auth/google/start")
        && url.query_pairs().any(|(k, v)| k == "desktop" && v.len() == 43)
}

/// Abre o login com Google no navegador padrão. Não aceita URL arbitrária:
/// a interface remota não consegue usar este comando para abrir outro site.
#[tauri::command]
fn open_google_login(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "URL inválida".to_string())?;
    if !is_google_login_start(&parsed) {
        return Err("URL de login não permitida".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}

/// Limites da notificação nativa (o Windows corta textos longos de qualquer forma).
const NOTIFY_TITLE_MAX: usize = 80;
const NOTIFY_BODY_MAX: usize = 300;

/// Remove caracteres de controle e limita o tamanho (em caracteres, não bytes).
fn sanitize_notification_text(text: &str, max: usize) -> String {
    text.chars().filter(|c| !c.is_control() || *c == '\n').take(max).collect::<String>().trim().to_string()
}

/// Notificação nativa do Windows pedida pela interface (lembretes de missões e da Taverna).
#[tauri::command]
fn desktop_notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let title = sanitize_notification_text(&title, NOTIFY_TITLE_MAX);
    let body = sanitize_notification_text(&body, NOTIFY_BODY_MAX);
    if title.is_empty() {
        return Err("Título obrigatório".into());
    }
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

/// Ações que o app nativo envia à interface (evento DOM `lifeos:desktop`).
#[derive(Clone, Copy, Debug, PartialEq)]
enum DesktopAction {
    Tavern,
    CheckUpdates,
}

impl DesktopAction {
    fn as_str(self) -> &'static str {
        match self {
            DesktopAction::Tavern => "tavern",
            DesktopAction::CheckUpdates => "check-updates",
        }
    }
}

/// Script fixo que abre a paleta de comandos em modo captura.
const OPEN_CAPTURE_SCRIPT: &str = r#"window.dispatchEvent(new CustomEvent("lifeos:open-palette", { detail: { mode: "capture" } }));"#;

/// Script fixo da ação nativa — `action` vem só do enum acima, nunca de entrada externa.
fn desktop_action_script(action: DesktopAction) -> String {
    format!(r#"window.dispatchEvent(new CustomEvent("lifeos:desktop", {{ detail: {{ action: "{}" }} }}));"#, action.as_str())
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn show_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    let window = main_window(app)?;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}

/// Só executa scripts quando a janela está no LifeOS publicado (não na tela de abertura).
fn is_on_remote(window: &WebviewWindow) -> bool {
    window.url().map(|u| same_origin(&u, &remote_origin())).unwrap_or(false)
}

/// Abre a captura rápida (atalho global e menu da bandeja).
fn open_quick_capture(app: &AppHandle) {
    if let Some(window) = show_main_window(app) {
        if is_on_remote(&window) {
            let _ = window.eval(OPEN_CAPTURE_SCRIPT);
        }
    }
}

fn send_desktop_action(app: &AppHandle, action: DesktopAction) {
    let Some(window) = show_main_window(app) else { return };
    if is_on_remote(&window) {
        let _ = window.eval(desktop_action_script(action));
    } else if action == DesktopAction::Tavern {
        // Ainda na tela de abertura: vai direto para a página da Taverna.
        if let Ok(target) = remote_origin().join("/taverna") {
            let _ = window.navigate(target);
        }
    }
}

/// Encerra de verdade (o X só esconde na bandeja), salvando posição/tamanho antes.
fn quit_app(app: &AppHandle) {
    let _ = app.save_window_state(StateFlags::all());
    app.exit(0);
}

/// Avisa uma única vez por execução que o LifeOS continua rodando na bandeja.
static TRAY_HINT_SHOWN: AtomicBool = AtomicBool::new(false);

fn hide_to_tray(window: &tauri::Window) {
    let _ = window.app_handle().save_window_state(StateFlags::all());
    let _ = window.hide();
    if !TRAY_HINT_SHOWN.swap(true, Ordering::Relaxed) {
        let _ = window
            .app_handle()
            .notification()
            .builder()
            .title("LifeOS continua aberto")
            .body("Ele ficou na bandeja do sistema. Use Ctrl+Shift+Espaço para a captura rápida ou \"Sair\" no ícone para encerrar.")
            .show();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let open = MenuItem::with_id(handle, "open", "Abrir LifeOS", true, None::<&str>)?;
    let capture = MenuItem::with_id(handle, "capture", "Captura rápida (Ctrl+Shift+Espaço)", true, None::<&str>)?;
    let tavern = MenuItem::with_id(handle, "tavern", "Taverna (fim do dia)", true, None::<&str>)?;
    let updates = MenuItem::with_id(handle, "check-updates", "Verificar atualizações", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", "Sair", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(handle)?;
    let separator2 = PredefinedMenuItem::separator(handle)?;
    let menu = Menu::with_items(handle, &[&open, &separator, &capture, &tavern, &updates, &separator2, &quit])?;

    let mut tray = TrayIconBuilder::with_id("lifeos-tray")
        .tooltip("LifeOS")
        .menu(&menu)
        // Clique esquerdo mostra a janela; o menu fica no clique direito.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                show_main_window(app);
            }
            "capture" => open_quick_capture(app),
            "tavern" => send_desktop_action(app, DesktopAction::Tavern),
            "check-updates" => send_desktop_action(app, DesktopAction::CheckUpdates),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Atalho global da captura rápida. Se outro programa já usa a combinação,
/// o app abre normalmente (só sem o atalho) e o erro vai para o log.
fn register_capture_shortcut(app: &tauri::App) {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
    let result = app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            open_quick_capture(app);
        }
    });
    if let Err(err) = result {
        eprintln!("[atalho] Ctrl+Shift+Espaço indisponível: {err}");
    }
}

/// `lifeos://auth?code=...` → página do LifeOS que troca o código pela sessão.
fn deep_link_target(link: &Url) -> Option<Url> {
    if link.scheme() != "lifeos" || link.host_str() != Some("auth") {
        return None;
    }
    let code = link.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned())?;
    let valid = (20..=128).contains(&code.len()) && code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !valid {
        return None;
    }
    let mut target = remote_origin().join("/auth/desktop").ok()?;
    target.query_pairs_mut().append_pair("code", &code);
    Some(target)
}

fn handle_deep_links(app: &AppHandle, urls: Vec<Url>) {
    let Some(window) = show_main_window(app) else { return };
    if let Some(target) = urls.iter().find_map(deep_link_target) {
        let _ = window.navigate(target);
    }
}

pub fn run() {
    tauri::Builder::default()
        // Uma única instância: abrir de novo traz a janela existente para frente.
        // (inclusive quando ela está escondida na bandeja).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        // Registra o esquema lifeos:// (o instalador grava no Windows).
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // Atualização da parte nativa (GitHub Releases, assinatura verificada).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Lembra posição, tamanho e maximização da janela entre execuções.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![open_google_login, desktop_notify])
        // Fechar (X) esconde na bandeja; "Sair" no menu da bandeja encerra.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    hide_to_tray(window);
                }
            }
        })
        .setup(|app| {
            app.add_capability(remote_capability())?;
            build_tray(app)?;
            register_capture_shortcut(app);
            // Em desenvolvimento o esquema não vem do instalador: registra na hora
            // (falha aqui não impede o app de abrir — só o retorno do login).
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            if let Err(err) = app.deep_link().register_all() {
                eprintln!("[deep-link] registro de desenvolvimento falhou: {err}");
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| handle_deep_links(&handle, event.urls()));
            // A tela de abertura lê a URL daqui (fonte única: REMOTE_URL).
            let boot_config = format!("window.__LIFEOS_REMOTE_URL__ = {};", serde_json::to_string(REMOTE_URL)?);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("LifeOS")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .center()
                .initialization_script(&boot_config)
                // Sem isso o WebView2 entrega o arrastar ao Tauri (arquivos soltos na
                // janela) e o drag-and-drop HTML5 do site para de funcionar — era o que
                // travava o arrastar dos cards do Kanban de Missões no Desktop.
                .disable_drag_drop_handler()
                .on_navigation(|url| {
                    if is_allowed_navigation(url) {
                        return true;
                    }
                    // Links externos (artigos, Google Books, etc.) vão para o navegador do sistema.
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o LifeOS Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navegacao_fica_no_lifeos() {
        let ok = |s: &str| is_allowed_navigation(&Url::parse(s).unwrap());
        assert!(ok(&format!("{REMOTE_URL}/dashboard")));
        assert!(ok("http://tauri.localhost/index.html"));
        assert!(ok("tauri://localhost/index.html"));
        assert!(!ok("https://exemplo.com/"));
        assert!(!ok(&format!("{}.evil.com/", REMOTE_URL)));
        assert!(!ok(&REMOTE_URL.replace("https://", "http://")));
    }

    #[test]
    fn login_google_so_do_lifeos() {
        let ch = "a".repeat(43);
        let ok = |s: String| is_google_login_start(&Url::parse(&s).unwrap());
        assert!(ok(format!("{REMOTE_URL}/api/auth/google/start?desktop={ch}")));
        assert!(!ok(format!("https://evil.com/api/auth/google/start?desktop={ch}")));
        assert!(!ok(format!("{REMOTE_URL}/api/auth/google/start")));
        assert!(!ok(format!("{REMOTE_URL}/qualquer?desktop={ch}")));
    }

    #[test]
    fn deep_link_vira_pagina_do_lifeos() {
        let code = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF12";
        let t = deep_link_target(&Url::parse(&format!("lifeos://auth?code={code}")).unwrap()).unwrap();
        assert_eq!(t.as_str(), format!("{REMOTE_URL}/auth/desktop?code={code}"));
        assert!(deep_link_target(&Url::parse("lifeos://auth?code=curto").unwrap()).is_none());
        assert!(deep_link_target(&Url::parse("lifeos://outra?code=abcDEF123_-abcDEF123_-").unwrap()).is_none());
        assert!(deep_link_target(&Url::parse("lifeos://auth?code=abc%22%3E%3Cscript%3Eabcdefghijkl").unwrap()).is_none());
    }

    #[test]
    fn notificacao_sanitizada() {
        assert_eq!(sanitize_notification_text("  Olá\u{0007} mundo  ", 80), "Olá mundo");
        assert_eq!(sanitize_notification_text(&"é".repeat(500), NOTIFY_BODY_MAX).chars().count(), NOTIFY_BODY_MAX);
    }

    #[test]
    fn scripts_de_acao_sao_fixos() {
        assert!(desktop_action_script(DesktopAction::Tavern).contains(r#"action: "tavern""#));
        assert!(desktop_action_script(DesktopAction::CheckUpdates).contains(r#"action: "check-updates""#));
        assert!(OPEN_CAPTURE_SCRIPT.contains("lifeos:open-palette"));
    }

    #[test]
    fn url_remota_valida() {
        assert_eq!(remote_origin().scheme(), "https");
    }
}
