/** Formas de pago de un formulario de cobro: tenders.<n>.method / amount / reference. */
export function tendersOf(form: FormData) {
  const rows = new Map<number, Record<string, string>>();
  for (const [key, value] of form.entries()) {
    const m = /^tenders\.(\d+)\.(method|amount|reference)$/.exec(key);
    if (!m || typeof value !== "string") continue;
    const row = rows.get(Number(m[1])) ?? {};
    row[m[2]!] = value;
    rows.set(Number(m[1]), row);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}
