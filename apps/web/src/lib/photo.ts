import { EVIDENCE_JPEG_QUALITY, targetImageSize } from "@meguiars/domain";

export interface PreparedPhoto {
  file: File;
  width: number;
  height: number;
}

/**
 * Redimensiona (lado mayor ≤ 1600 px, respetando la orientación EXIF) y
 * comprime a JPEG en el navegador antes de subir. Sólo cliente. Si el
 * navegador no puede decodificar la imagen se devuelve el archivo original y
 * el servidor aplica los límites de tipo y tamaño.
 */
export async function preparePhoto(original: File): Promise<PreparedPhoto> {
  try {
    const bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
    const size = targetImageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", EVIDENCE_JPEG_QUALITY),
    );
    if (!blob) throw new Error("toBlob");
    // Una foto ya pequeña y más ligera que su versión JPEG se sube tal cual.
    if (!size.resized && original.size <= blob.size && original.type === "image/jpeg") {
      return { file: original, width: size.width, height: size.height };
    }
    const name = original.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { file: new File([blob], name, { type: "image/jpeg" }), width: size.width, height: size.height };
  } catch {
    return { file: original, width: 0, height: 0 };
  }
}
