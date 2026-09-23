#!/usr/bin/env bash
# Aplica las migraciones en un Postgres limpio, corre las pruebas SQL (RLS/KPIs) y valida el seed.
# Uso:
#   DATABASE_URL=postgres://... npm run test:db   # base existente y VACÍA (CI)
#   npm run test:db                               # levanta un Postgres temporal con pg_ctl
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() { :; }
if [[ -z "${DATABASE_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [[ -x "$PG_BIN/pg_ctl" ]] || { echo "No encontré pg_ctl; define DATABASE_URL o PG_BIN" >&2; exit 1; }
  TMP="$(mktemp -d)"
  if [[ "$(id -u)" == "0" ]]; then chown -R postgres "$TMP"; RUN=(runuser -u postgres --); else RUN=(); fi
  "${RUN[@]}" "$PG_BIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
  "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p 54329 -k $TMP -c listen_addresses=''" -w start >/dev/null
  cleanup() { "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -m fast stop >/dev/null; rm -rf "$TMP"; }
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
fi
trap cleanup EXIT

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migración: $f"
  "${PSQL[@]}" -f "$f"
done
for f in supabase/tests/*.test.sql; do
  echo "prueba: $f"
  "${PSQL[@]}" -t -f "$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^ *$/d'
done
echo "seed: supabase/seed.sql"
"${PSQL[@]}" -f supabase/seed.sql
[[ "$("${PSQL[@]}" -tAc 'select count(*) from public.detail_centers')" == "2" ]] || { echo "El seed no cargó 2 centros" >&2; exit 1; }
echo "Pruebas de base de datos OK"
