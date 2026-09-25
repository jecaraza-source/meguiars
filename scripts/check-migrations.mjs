#!/usr/bin/env node
// Reglas de las migraciones versionadas (supabase/migrations):
//  1. nombre `YYYYMMDDHHMMSS_descripcion.sql` (minúsculas, dígitos y _);
//  2. versiones únicas;
//  3. una migración que ya está en la rama base no se modifica, renombra ni borra
//     (ya pudo aplicarse en staging/producción: el cambio va en una migración nueva);
//  4. una migración nueva tiene versión mayor que la última de la base
//     (así se aplica en el mismo orden en todos los ambientes).
//
// Uso:
//   node scripts/check-migrations.mjs              # reglas 1 y 2
//   node scripts/check-migrations.mjs origin/main  # reglas 1–4 contra esa ref
// En CI el checkout de un PR es el merge con la base, así que el diff contra la
// base contiene sólo los cambios del PR. Localmente, trae antes lo último de main.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = "supabase/migrations";
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

const version = (name) => NAME.exec(name)?.[1] ?? null;

/**
 * @param {{ head: string[], base?: string[] | null, changed?: string[] }} input
 *   head: migraciones del cambio; base: las de la rama base (null = sin comparar);
 *   changed: migraciones de la base modificadas, renombradas o borradas.
 * @returns {string[]} errores (vacío = válido)
 */
export function validateMigrations({ head, base = null, changed = [] }) {
  const errors = [];
  const seen = new Map();
  for (const name of head) {
    const v = version(name);
    if (!v) {
      errors.push(`${name}: el nombre debe ser YYYYMMDDHHMMSS_descripcion.sql`);
      continue;
    }
    if (seen.has(v)) errors.push(`${name}: versión ${v} repetida (también en ${seen.get(v)})`);
    else seen.set(v, name);
  }
  if (!base) return errors;

  const baseSet = new Set(base);
  for (const name of changed) {
    if (baseSet.has(name)) {
      errors.push(`${name}: ya existe en la rama base; no se edita, crea una migración nueva`);
    }
  }
  const latest = base.map(version).filter(Boolean).sort().at(-1) ?? null;
  for (const name of head) {
    const v = version(name);
    if (v && latest && !baseSet.has(name) && v <= latest) {
      errors.push(`${name}: la versión debe ser mayor que la última de la base (${latest})`);
    }
  }
  return errors;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

function main() {
  const ref = process.argv[2];
  const head = readdirSync(MIGRATIONS_DIR).filter((f) => !f.startsWith("."));
  let base = null;
  let changed = [];
  if (ref) {
    base = git(["ls-tree", "--name-only", `${ref}:${MIGRATIONS_DIR}`]);
    changed = git(["diff", "--name-only", "--diff-filter=DMRT", ref, "--", MIGRATIONS_DIR]).map((f) =>
      basename(f),
    );
  }
  const errors = validateMigrations({ head, base, changed });
  if (errors.length) {
    console.error("Migraciones inválidas:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`Migraciones OK (${head.length}${ref ? `, comparadas con ${ref}` : ""})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
