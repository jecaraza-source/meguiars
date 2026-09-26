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
  "${RUN[@]}" "$PG_BIN/initdb" -D "$TMP/data" -U postgres -A trust -E UTF8 --no-locale >/dev/null
  "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p 54329 -k $TMP -c listen_addresses=''" -w start >/dev/null
  cleanup() { "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -m fast stop >/dev/null; rm -rf "$TMP"; }
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
fi
trap cleanup EXIT

export PGCLIENTENCODING=UTF8
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
show() { sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^ *$/d'; }
"${PSQL[@]}" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migración: $f"
  "${PSQL[@]}" -f "$f"
done
for f in supabase/tests/*.test.sql; do
  echo "prueba: $f"
  "${PSQL[@]}" -t -f "$f" 2>&1 | show
done
echo "seed: supabase/seed.sql"
"${PSQL[@]}" -f supabase/seed.sql
[[ "$("${PSQL[@]}" -tAc "select count(*) from public.detail_centers c join public.organizations o on o.id = c.organization_id where o.slug = 'meguiars-demo'")" == "2" ]] \
  || { echo "El seed no cargó la organización demo con 2 centros" >&2; exit 1; }
[[ "$("${PSQL[@]}" -tAc "select count(*) from public.clients c join public.vehicles v on v.client_id = c.id")" == "4" ]] \
  || { echo "El seed no cargó los clientes y vehículos de ejemplo" >&2; exit 1; }
[[ "$("${PSQL[@]}" -tAc "select count(distinct revenue_engine) from public.services")" == "5" ]] \
  || { echo "El seed no cargó el catálogo con los 5 motores de ingreso" >&2; exit 1; }

# Prueba de actualización: en una base aparte aplica las migraciones en orden y,
# si existen, carga tests/upgrade/<migración>.before.sql justo antes y verifica
# tests/upgrade/<migración>.after.sql justo después (datos del esquema anterior).
UPGRADE_DB=meguiars_upgrade_check
"${PSQL[@]}" -c "set client_min_messages = warning" -c "drop database if exists $UPGRADE_DB" -c "create database $UPGRADE_DB"
UPGRADE_URL="$(sed -E "s#/postgres(\?|$)#/$UPGRADE_DB\1#" <<<"$DATABASE_URL")"
UPSQL=(psql "$UPGRADE_URL" -X -q -v ON_ERROR_STOP=1)
"${UPSQL[@]}" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  name="$(basename "$f" .sql)"
  before="supabase/tests/upgrade/$name.before.sql"
  after="supabase/tests/upgrade/$name.after.sql"
  if [[ -f "$before" ]]; then echo "actualización: datos previos a $name"; "${UPSQL[@]}" -f "$before"; fi
  "${UPSQL[@]}" -f "$f"
  if [[ -f "$after" ]]; then echo "actualización: verificación de $name"; "${UPSQL[@]}" -t -f "$after" 2>&1 | show; fi
done
"${PSQL[@]}" -c "drop database $UPGRADE_DB"

echo "Pruebas de base de datos OK"
