fn main() {
    // URL do LifeOS publicado (pode ser trocada no build: LIFEOS_REMOTE_URL=...).
    println!("cargo:rerun-if-env-changed=LIFEOS_REMOTE_URL");
    tauri_build::build()
}
