import { EVIDENCE_JPEG_QUALITY, executionCopy, targetImageSize } from "@meguiars/domain";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export interface PreparedPhoto {
  uri: string;
  data: ArrayBuffer;
  width: number;
  height: number;
  sizeBytes: number;
}

export type PhotoResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; message: string };

/** base64 → bytes (Hermes trae `atob`; sin dependencias extra). */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Toma (cámara) o elige (galería) una foto y la deja lista para subir:
 * lado mayor ≤ 1600 px y JPEG al 70 % — mismas reglas que la web.
 */
export async function capturePhoto(source: "camera" | "library"): Promise<PhotoResult> {
  try {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, canceled: false, message: executionCopy.cameraDenied };
    const options: ImagePickerOptionsLite = { mediaTypes: ["images"], quality: 1, exif: false };
    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return { ok: false, canceled: true };

    const size = targetImageSize(asset.width, asset.height);
    const context = ImageManipulator.manipulate(asset.uri);
    if (size.resized) context.resize({ width: size.width, height: size.height });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      compress: EVIDENCE_JPEG_QUALITY,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!saved.base64) return { ok: false, canceled: false, message: executionCopy.photoType };
    const data = base64ToArrayBuffer(saved.base64);
    return {
      ok: true,
      photo: { uri: saved.uri, data, width: saved.width, height: saved.height, sizeBytes: data.byteLength },
    };
  } catch (error) {
    return { ok: false, canceled: false, message: error instanceof Error ? error.message : String(error) };
  }
}

type ImagePickerOptionsLite = Pick<ImagePicker.ImagePickerOptions, "mediaTypes" | "quality" | "exif">;
