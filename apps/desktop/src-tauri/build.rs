fn main() {
    // URL do LifeOS publicado (pode ser trocada no build: LIFEOS_REMOTE_URL=...).
    println!("cargo:rerun-if-env-changed=LIFEOS_REMOTE_URL");
    // Comandos próprios do app ficam sob ACL: só quem recebe a permissão
    // (o LifeOS remoto, em lib.rs) pode chamá-los.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["open_google_login"])),
    )
    .expect("falha no build do Tauri")
}
