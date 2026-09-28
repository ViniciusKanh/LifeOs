/**
 * Compressão de imagem 100% client-side — usada pelas fotos do Diário
 * (Fase 4). Redimensiona pro maior lado não passar de `maxDimension` e
 * exporta como JPEG comprimido, então o upload nunca fica gigante
 * independente do tamanho da foto original (mesma ideia do recorte de
 * avatar em ImageCropModal.tsx, sem o recorte quadrado).
 */
export async function compressImageToDataUri(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {}
): Promise<string> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.82;

  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      el.src = imgUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem.");
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}
