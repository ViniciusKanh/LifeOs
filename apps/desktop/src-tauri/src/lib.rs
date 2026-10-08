//! LifeOS Desktop (Tauri 2) — aplicativo nativo do Windows integrado à Vercel.
//!
//! A janela abre uma tela local de abertura (`boot/`) que confere a conexão e
//! então carrega o LifeOS publicado na Vercel. Assim, todo deploy da Web chega
//! ao Desktop na hora; o instalador só muda quando a parte nativa muda (e aí o
//! Tauri Updater cuida disso, com aviso na própria interface). Segurança:
//! - o site remoto recebe apenas as permissões listadas em `remote_capability`,
//!   e só no domínio publicado;
//! - a navegação fica presa ao LifeOS: links externos abrem no navegador padrão;
//! - nenhum segredo (Turso, Gemini, SMTP) existe no app — tudo segue na API.

use tauri::{ipc::CapabilityBuilder, Manager, WebviewUrl, WebviewWindowBuilder};
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
    let remote = remote_origin();
    let local = matches!(url.scheme(), "tauri") || url.host_str() == Some("tauri.localhost");
    let same_remote = url.scheme() == remote.scheme() && url.host_str() == remote.host_str() && url.port_or_known_default() == remote.port_or_known_default();
    local || same_remote || url.scheme() == "about"
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
        .plugin(tauri_plugin_opener::init())
        // Atualização da parte nativa (GitHub Releases, assinatura verificada).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Lembra posição, tamanho e maximização da janela entre execuções.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            app.add_capability(remote_capability())?;
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
    fn url_remota_valida() {
        assert_eq!(remote_origin().scheme(), "https");
    }
}
