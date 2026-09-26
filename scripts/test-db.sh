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
[[ "$("${PSQL[@]}" -tAc "select count(*) from public.appointments a join public.appointment_services s on s.appointment_id = a.id where a.ends_at = a.starts_at + make_interval(mins => a.duration_minutes)")" == "3" ]] \
  || { echo "El seed no cargó la agenda de ejemplo" >&2; exit 1; }
[[ "$("${PSQL[@]}" -tAc "select string_agg(folio || '=' || total, ',' order by folio) from public.service_orders")" == "CDMX-01-000001=1890.00,CDMX-01-000002=2520.00,MTY-01-000001=220.00" ]] \
  || { echo "El seed no cargó las órdenes de servicio de ejemplo" >&2; exit 1; }

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

# Concurrencia de OS: sesiones simultáneas (como web y móvil a la vez) nunca
# repiten folio, y dos ediciones con la misma versión no se pisan.
CONC_DB=meguiars_concurrency_check
"${PSQL[@]}" -c "set client_min_messages = warning" -c "drop database if exists $CONC_DB" -c "create database $CONC_DB"
CONC_URL="$(sed -E "s#/postgres(\?|$)#/$CONC_DB\1#" <<<"$DATABASE_URL")"
CPSQL=(psql "$CONC_URL" -X -q -v ON_ERROR_STOP=1)
"${CPSQL[@]}" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do "${CPSQL[@]}" -f "$f"; done
"${CPSQL[@]}" -f supabase/tests/concurrency/service_orders.setup.sql
as_operator() {
  "${CPSQL[@]}" -tA -c "set role authenticated" \
    -c "select from set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000f1\",\"role\":\"authenticated\"}', false)" \
    -c "$1"
}
new_order() {
  as_operator "select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '$1',
    'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    '[{\"service_id\":\"5e000000-0000-4000-8000-000000000001\"}]')).id"
}
pids=()
for i in 1 2 3 4 5 6 7 8; do new_order "30000000-0000-4000-8000-00000000000$i" >/dev/null & pids+=($!); done
for p in "${pids[@]}"; do wait "$p"; done
[[ "$("${CPSQL[@]}" -tAc "select count(distinct folio) = 8 and min(folio_number) = 1 and max(folio_number) = 8 from public.service_orders")" == "t" ]] \
  || { echo "FALLÓ: OS simultáneas repitieron o saltaron folio" >&2; exit 1; }
echo "  ok - 8 OS simultáneas: folios únicos y consecutivos"
order="$(new_order 30000000-0000-4000-8000-000000000009)"
v="$("${CPSQL[@]}" -tAc "select version from public.service_orders where id = '$order'")"
ok=0
as_operator "select public.set_service_order_status('$order', $v, 'autorizada')" >/dev/null 2>&1 & a=$!
as_operator "select public.set_service_order_item('$order', $v, '5e000000-0000-4000-8000-000000000001', 3)" >/dev/null 2>&1 & b=$!
wait "$a" && ok=$((ok + 1)); wait "$b" && ok=$((ok + 1))
[[ "$ok" == "1" && "$("${CPSQL[@]}" -tAc "select version from public.service_orders where id = '$order'")" -gt "$v" ]] \
  || { echo "FALLÓ: dos ediciones con la misma versión no deben aplicarse ambas ($ok)" >&2; exit 1; }
echo "  ok - dos ediciones simultáneas con la misma versión: sólo una se aplica"
"${PSQL[@]}" -c "drop database $CONC_DB"

echo "Pruebas de base de datos OK"
