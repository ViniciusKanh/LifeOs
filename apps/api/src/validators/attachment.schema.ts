import { z } from "zod";

/**
 * Regras compartilhadas de upload (Diário e anexos de tarefa).
 *
 * Os arquivos chegam como data URI (base64) — mesmo padrão já usado no
 * avatar e nas fotos do Diário. O teto de ~4,3 milhões de caracteres
 * existe por causa do limite de corpo da função serverless na Vercel
 * (4,5 MB): base64 ocupa ~33% a mais, então o arquivo original pode ter
 * no máximo ~3 MB. Imagens são comprimidas no cliente e ficam bem abaixo.
 */
export const MAX_UPLOAD_DATA_URI_CHARS = 4_300_000;

export const IMAGE_DATA_URI = z
  .string()
  .max(MAX_UPLOAD_DATA_URI_CHARS, "Imagem muito grande — escolha uma foto menor.")
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Formato de imagem inválido.");

export const VIDEO_DATA_URI = z
  .string()
  .max(MAX_UPLOAD_DATA_URI_CHARS, "Vídeo muito grande — o limite é de ~3 MB por arquivo.")
  .regex(/^data:video\/(mp4|webm|quicktime|ogg);base64,/, "Formato de vídeo inválido (use MP4, WebM ou MOV).");

export const PDF_DATA_URI = z
  .string()
  .max(MAX_UPLOAD_DATA_URI_CHARS, "PDF muito grande — o limite é de ~3 MB por arquivo.")
  .regex(/^data:application\/pdf;base64,/, "Formato inválido — envie um PDF.");

export const fileNameSchema = z.string().trim().max(200).optional().nullable();

/** Extrai o MIME type real do cabeçalho do data URI (nunca confia no que o cliente declarar à parte). */
export function mimeFromDataUri(dataUri: string): string | null {
  const match = /^data:([^;]+);base64,/.exec(dataUri);
  return match ? match[1] : null;
}

/** Tamanho aproximado (bytes) do arquivo original a partir do base64. */
export function bytesFromDataUri(dataUri: string): number {
  const comma = dataUri.indexOf(",");
  const b64 = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Anexo de tarefa: imagem (comprimida no cliente) ou PDF. */
export const taskAttachmentCreateSchema = z.object({
  dataUri: z.union([IMAGE_DATA_URI, PDF_DATA_URI], {
    errorMap: () => ({ message: "Envie uma imagem (PNG, JPG, WebP, GIF) ou um PDF de até ~3 MB." }),
  }),
  fileName: fileNameSchema,
  caption: z.string().trim().max(300).optional().nullable(),
});

export const taskAttachmentUpdateSchema = z.object({
  caption: z.string().trim().max(300).optional().nullable(),
});
