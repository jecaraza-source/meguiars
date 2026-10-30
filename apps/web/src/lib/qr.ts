import "server-only";
import QRCode from "qrcode";

/** Borde blanco del QR en módulos (no es un estilo de UI). */
const QUIET_ZONE_MODULES = 1;

/** QR en SVG (se genera en el servidor; corrección de errores media para calcomanías). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: QUIET_ZONE_MODULES });
}
