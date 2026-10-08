/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** "desktop" no build do Tauri (vite --mode desktop); ausente na Web. */
  readonly VITE_PLATFORM?: "desktop";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
