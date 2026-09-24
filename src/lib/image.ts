/** Tope para que la foto quepa en un documento de Firestore (1 MiB) con margen. */
const MAX_DATA_URL = 700_000;

export interface CompressedImage {
  data: string;
  width: number;
  height: number;
}

/** Reduce y recomprime la foto en el navegador (respeta la orientación de la cámara). */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let maxSide = 1600;
    let quality = 0.75;
    for (;;) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_DATA_URL || maxSide <= 640) return { data, width, height };
      if (quality > 0.55) quality -= 0.1;
      else maxSide = Math.round(maxSide * 0.8);
    }
  } finally {
    bitmap.close();
  }
}
