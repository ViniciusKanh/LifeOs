import { compressImageToDataUri } from "./image";

/**
 * Utilitários de upload compartilhados (Diário e anexos de Tarefas).
 *
 * Limite de ~3 MB por arquivo: os uploads viajam como data URI (base64)
 * até a função serverless, cujo corpo máximo é 4,5 MB — o base64 ocupa
 * ~33% a mais que o arquivo. Imagens são comprimidas antes (ver image.ts),
 * então o limite só pesa de verdade em vídeos e PDFs.
 */
export const MAX_RAW_UPLOAD_BYTES = 3 * 1024 * 1024;

export type UploadKind = "image" | "video" | "document";

export function uploadKindOf(file: File): UploadKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "document";
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Prepara um arquivo para upload: imagem é comprimida; vídeo/PDF são lidos
 * como estão, respeitando o teto de tamanho. Lança Error com mensagem em
 * PT-BR pronta para exibir ao usuário.
 */
export async function prepareUpload(
  file: File,
  allowed: UploadKind[]
): Promise<{ dataUri: string; kind: UploadKind; fileName: string }> {
  const kind = uploadKindOf(file);
  if (!kind || !allowed.includes(kind)) {
    throw new Error(`"${file.name}" não é um formato aceito aqui.`);
  }
  if (kind === "image") {
    return { dataUri: await compressImageToDataUri(file), kind, fileName: file.name };
  }
  if (file.size > MAX_RAW_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" tem ${formatBytes(file.size)} — o limite é de 3 MB por arquivo.`);
  }
  let dataUri = await readAsDataUri(file);
  // Alguns navegadores não informam o MIME de PDFs/MOV — normaliza pro formato que o backend valida.
  if (kind === "document" && !dataUri.startsWith("data:application/pdf")) {
    dataUri = dataUri.replace(/^data:[^;]*;/, "data:application/pdf;");
  }
  return { dataUri, kind, fileName: file.name };
}

/** Abre um data URI (ex.: PDF) numa nova aba via blob — navegadores bloqueiam navegar direto pra data: URLs. */
export function openDataUriInNewTab(dataUri: string) {
  const [header, b64] = dataUri.split(",");
  const mime = /^data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
