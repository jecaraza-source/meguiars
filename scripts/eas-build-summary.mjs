// Resume la salida de `eas build --wait --json`: estado, página en expo.dev y
// enlace del archivo (APK/AAB/IPA) de cada build. Lo imprime en el log y en el
// resumen del run de GitHub Actions ($GITHUB_STEP_SUMMARY). Sale con error si
// algún build no terminó bien.
// Uso: node scripts/eas-build-summary.mjs builds.json
import { appendFileSync, readFileSync } from "node:fs";

const app = JSON.parse(readFileSync(new URL("../apps/mobile/app.json", import.meta.url), "utf8")).expo;
const raw = readFileSync(process.argv[2] ?? "builds.json", "utf8");
const builds = JSON.parse(raw.slice(raw.indexOf("[")));
const page = (id) => `https://expo.dev/accounts/${app.owner}/projects/${app.slug}/builds/${id}`;

const rows = builds.map((b) => ({
  platform: b.platform,
  profile: b.buildProfile,
  status: b.status,
  version: `${b.appVersion ?? "?"} (${b.appBuildVersion ?? "?"})`,
  page: page(b.id),
  file: b.artifacts?.buildUrl ?? null,
}));

for (const r of rows) {
  console.log(`${r.platform} ${r.profile} ${r.version}: ${r.status}`);
  console.log(`  página: ${r.page}`);
  if (r.file) console.log(`  archivo: ${r.file}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### Builds móviles (EAS)",
    "",
    "| Plataforma | Perfil | Versión | Estado | Instalar / descargar |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.platform} | ${r.profile} | ${r.version} | ${r.status} | [página](${r.page})${r.file ? ` · [archivo](${r.file})` : ""} |`,
    ),
    "",
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

process.exit(rows.length > 0 && rows.every((r) => r.status === "FINISHED") ? 0 : 1);
