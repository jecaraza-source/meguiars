// Verifica que apps/mobile/eas.json tenga lo necesario para enviar a la tienda
// desde CI sin preguntas (submit.production): iOS → ascAppId; Android → track.
// Las llaves (App Store Connect y cuenta de servicio de Google) viven en EAS.
// Uso: node scripts/check-store-submit.mjs ios|android|all
import { readFileSync } from "node:fs";

const platform = process.argv[2] ?? "all";
const submit = JSON.parse(readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8")).submit
  ?.production;
const errors = [];
if (platform === "ios" || platform === "all") {
  if (!/^\d+$/.test(String(submit?.ios?.ascAppId ?? "")))
    errors.push(
      "Falta submit.production.ios.ascAppId en apps/mobile/eas.json (App Store Connect → la app → Información de la app → Apple ID).",
    );
}
if (platform === "android" || platform === "all") {
  if (!["internal", "alpha", "beta", "production"].includes(submit?.android?.track ?? ""))
    errors.push(
      "Falta submit.production.android.track en apps/mobile/eas.json (internal, alpha, beta o production).",
    );
}
if (!["ios", "android", "all"].includes(platform)) errors.push(`Plataforma desconocida: ${platform}`);
for (const e of errors) console.log(`::error::${e}`);
process.exit(errors.length ? 1 : 0);
