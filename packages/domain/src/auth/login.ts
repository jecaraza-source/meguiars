import { formatPhone, normalizeEmail, normalizePhone } from "../clients/normalize";

/**
 * Con qué entra una persona: correo o celular. El celular se guarda en E.164
 * (+52…), igual que clientes y WhatsApp; 10 dígitos se toman como México.
 */
export type LoginIdentifier = { email: string } | { phone: string };

/** Correo si trae «@»; si no, celular. `null` si no es ninguno válido. */
export function parseLoginIdentifier(value: string | null | undefined): LoginIdentifier | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    return email ? { email } : null;
  }
  const phone = normalizePhone(raw);
  return phone ? { phone } : null;
}

/**
 * Cómo se muestra la cuenta: el correo o, si entra con celular, el celular con
 * formato (+52 55 1234 5678). Supabase guarda el celular sin «+».
 */
export function accountLabel(user: { email?: string | null; phone?: string | null }): string {
  if (user.email) return user.email;
  const phone = user.phone
    ? normalizePhone(user.phone.startsWith("+") ? user.phone : `+${user.phone}`)
    : null;
  return phone ? formatPhone(phone) : "";
}
