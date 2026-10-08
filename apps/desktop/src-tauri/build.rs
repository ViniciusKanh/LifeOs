fn main() {
    // Declara os comandos do app para que o Tauri gere permissões
    // (allow-session-token-*) e só as capabilities listadas possam chamá-los.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["session_token_get", "session_token_set", "session_token_clear"]),
        ),
    )
    .expect("falha ao preparar o build do LifeOS Desktop");
}
