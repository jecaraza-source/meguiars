import { EXPENSE_RECEIPT_MIME_TYPES, expensesCopy, type ExpenseReceiptMimeType } from "@meguiars/domain";
import * as DocumentPicker from "expo-document-picker";
import { capturePhoto } from "./photo";

export interface PickedReceipt {
  data: ArrayBuffer;
  contentType: ExpenseReceiptMimeType;
  sizeBytes: number;
  fileName: string;
}

export type ReceiptResult =
  | { ok: true; receipt: PickedReceipt }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; message: string };

/**
 * Comprobante de un egreso: foto (cámara o galería, redimensionada a JPEG como
 * las evidencias) o documento (PDF o imagen). Mismos tipos y tope que la web.
 */
export async function pickReceipt(source: "camera" | "library" | "document"): Promise<ReceiptResult> {
  if (source !== "document") {
    const photo = await capturePhoto(source);
    if (!photo.ok) return photo;
    return {
      ok: true,
      receipt: {
        data: photo.photo.data,
        contentType: "image/jpeg",
        sizeBytes: photo.photo.sizeBytes,
        fileName: `comprobante-${Date.now()}.jpg`,
      },
    };
  }
  try {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [...EXPENSE_RECEIPT_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return { ok: false, canceled: true };
    const type = asset.mimeType ?? "";
    if (!(EXPENSE_RECEIPT_MIME_TYPES as readonly string[]).includes(type))
      return { ok: false, canceled: false, message: expensesCopy.receiptType };
    const data = await (await fetch(asset.uri)).arrayBuffer();
    return {
      ok: true,
      receipt: {
        data,
        contentType: type as ExpenseReceiptMimeType,
        sizeBytes: data.byteLength,
        fileName: asset.name,
      },
    };
  } catch (error) {
    return { ok: false, canceled: false, message: error instanceof Error ? error.message : String(error) };
  }
}
