import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas del pipeline: ningún secreto versionado y el job `ci-ok` (el único
 * check requerido en la protección de main) depende de todos los demás.
 */
const root = join(__dirname, "..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((f) => f && !f.endsWith("package-lock.json") && !/\.(png|jpe?g|gif|ico|ttf|woff2?)$/.test(f));

const SECRET_PATTERNS = [
  { name: "llave secreta de Supabase", pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "token de acceso de Supabase", pattern: /\bsbp_[a-f0-9]{40}\b/ },
  { name: "JWT (anon/service_role heredadas)", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { name: "llave privada", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "token de GitHub", pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  {
    name: "secreto asignado en texto plano",
    pattern:
      /\b(?:SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|EXPO_TOKEN|VERCEL_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/,
  },
];

describe("sin secretos en el repositorio", () => {
  it("hay archivos versionados que revisar", () => {
    expect(tracked.length).toBeGreaterThan(50);
  });

  it.each(SECRET_PATTERNS)("sin $name", ({ pattern }) => {
    const offenders = tracked.filter((file) => pattern.test(readFileSync(join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});

/** Ids de job de un workflow (claves con dos espacios bajo `jobs:`). */
function jobsOf(workflow) {
  const body = workflow.split(/^jobs:\s*$/m)[1] ?? "";
  return [...body.matchAll(/^ {2}([a-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
}

const workflows = readdirSync(join(root, ".github/workflows")).map((f) => `.github/workflows/${f}`);

describe("workflows", () => {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

  it("ci-ok espera a todos los jobs y falla si alguno no pasó", () => {
    const jobs = jobsOf(ci).filter((j) => j !== "ci-ok");
    expect(jobs.length).toBeGreaterThanOrEqual(4);
    const gate = ci.split(/^ {2}ci-ok:\s*$/m)[1] ?? "";
    const needs =
      /needs:\s*\[([^\]]*)\]/
        .exec(gate)?.[1]
        .split(",")
        .map((s) => s.trim()) ?? [];
    expect(needs.sort()).toEqual(jobs.sort());
    expect(gate).toMatch(/if:\s*always\(\)/);
  });

  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-db.yml",
    ".github/workflows/mobile-build.yml",
  ])("%s declara permisos mínimos y lee secretos sólo con secrets.*", (file) => {
    const text = readFileSync(join(root, file), "utf8");
    expect(text).toMatch(/^permissions:\s*\n\s+contents: read/m);
    // Toda variable sensible viene de `${{ secrets.X }}` (definidos en GitHub, no en el repo).
    for (const m of text.matchAll(/(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|EXPO_TOKEN):\s*(.+)/g)) {
      expect(m[2]).toMatch(/^\$\{\{\s*secrets\.[A-Z_]+\s*\}\}$/);
    }
  });
});

describe("build web reproducible", () => {
  it("Vercel instala con npm ci desde la raíz del workspace y fija Node a la versión de .nvmrc", () => {
    const vercel = JSON.parse(readFileSync(join(root, "apps/web/vercel.json"), "utf8"));
    expect(vercel.installCommand).toBe("cd ../.. && npm ci");
    const web = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
    expect(web.engines.node).toBe(`${nvmrc}.x`);
  });
});
