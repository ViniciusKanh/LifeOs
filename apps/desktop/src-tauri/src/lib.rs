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

use tauri::{ipc::CapabilityBuilder, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
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
    let Some(window) = app.get_webview_window("main") else { return };
    if let Some(target) = urls.iter().find_map(deep_link_target) {
        let _ = window.navigate(target);
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn run() {
    tauri::Builder::default()
        // Uma única instância: abrir de novo traz a janela existente para frente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // Registra o esquema lifeos:// (o instalador grava no Windows).
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // Atualização da parte nativa (GitHub Releases, assinatura verificada).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Lembra posição, tamanho e maximização da janela entre execuções.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![open_google_login])
        .setup(|app| {
            app.add_capability(remote_capability())?;
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
    fn url_remota_valida() {
        assert_eq!(remote_origin().scheme(), "https");
    }
}
