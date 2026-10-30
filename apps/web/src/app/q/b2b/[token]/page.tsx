import { redirect } from "next/navigation";
import { requireScreen } from "@/lib/auth/dal";

/**
 * Enlace del QR de un vehículo de flotilla (ADR 0050). Al escanearlo con la
 * cámara del teléfono se abre aquí: lleva a la OS a cuenta B2B, que identifica
 * la cuenta y el vehículo en el centro activo.
 */
export default async function B2bQrLinkPage({ params }: PageProps<"/q/b2b/[token]">) {
  await requireScreen("orderNew");
  const { token } = await params;
  redirect(`/ordenes/nueva?modo=b2b&qr=${encodeURIComponent(token)}`);
}
