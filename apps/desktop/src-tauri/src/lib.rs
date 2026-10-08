//! LifeOS Desktop (Tauri 2). O frontend é o mesmo React de apps/web,
//! empacotado localmente; o Rust só expõe o mínimo necessário (sessão no
//! cofre do sistema) e plugins com permissões explícitas em capabilities/.

mod session;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // Uma única instância: abrir de novo apenas traz a janela existente para frente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // Lembra posição, tamanho e maximização da janela entre execuções.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            session::session_token_get,
            session::session_token_set,
            session::session_token_clear
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o LifeOS Desktop");
}
