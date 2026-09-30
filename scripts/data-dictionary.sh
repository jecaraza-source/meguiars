#!/usr/bin/env bash
# Genera el diccionario de datos (docs/diccionario-datos.md) desde una base con
# todas las migraciones aplicadas. scripts/test-db.sh lo regenera y falla si el
# archivo versionado quedó desactualizado.
# Uso: DATABASE_URL=postgres://... bash scripts/data-dictionary.sh [salida]
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-docs/diccionario-datos.md}"
# Módulo que documenta cada tabla (una tabla nueva sin módulo aparece con "—": agrégala aquí).
declare -A OWNER=(
  [alertas.md]="alert_evaluation_runs alert_events alert_instances alert_rules"
  [agenda.md]="appointment_services appointments bays technicians"
  [egresos.md]="approval_events expense_attachments expense_categories expense_settings expenses vendors"
  [multicentro-seguridad.md]="audit_log detail_centers organizations role_assignments user_detail_centers"
  [b2b.md]="b2b_accounts b2b_agreement_centers b2b_agreements b2b_contacts b2b_price_rules b2b_vehicles"
  [cxc-b2b.md]="b2b_invoices b2b_payment_allocations b2b_payments"
  [corte-caja.md]="cash_closings cash_reopenings cash_sessions"
  [clientes-vehiculos.md]="client_centers clients vehicles"
  [crm-recurrencia.md]="contact_preferences crm_tasks"
  [tableros.md]="dashboard_definitions dashboard_widgets metric_registry user_dashboard_preferences"
  [ejecucion-evidencias.md]="inventory_items service_order_consumptions service_order_evidence service_order_incidents service_order_staff service_supply_standards"
  [kpis.md]="kpi_settings"
  [tablero-corporativo.md]="kpi_thresholds"
  [membresias.md]="membership_benefits membership_events membership_plans membership_redemptions memberships"
  [pipeline.md]="opportunity_events pipeline_stages sales_opportunities"
  [cobranza.md]="payment_allocations payment_methods payment_reversals payment_tenders payments"
  [auth-sesion.md]="profiles"
  [catalogo.md]="service_center_config service_price_history services"
  [orden-servicio.md]="service_order_discounts service_order_events service_order_items service_order_status_history service_orders"
  [recomendaciones.md]="upsell_offers upsell_rules"
  [piloto-rollout.md]="center_baselines client_error_reports"
  [prospectos-cotizaciones.md]="lead_events lead_services lead_stages leads quote_discounts quote_items quotes"
  [bandeja.md]="channel_accounts conversations messages"
  [marketing.md]="campaign_spend campaigns content_posts promotions"
  [automatizaciones.md]="automation_executions automation_runs automations"
)
modules="$(for doc in "${!OWNER[@]}"; do for t in ${OWNER[$doc]}; do printf '%s=%s,' "$t" "$doc"; done; done)"
{
  cat <<'HEAD'
# Diccionario de datos

> Generado desde el esquema con `DATABASE_URL=… bash scripts/data-dictionary.sh`; no editar a mano.
> `npm run test:db` falla si este archivo no coincide con las migraciones.

Esquema `public` (expuesto por PostgREST). Toda tabla tiene RLS; "sólo por RPC" significa que
`authenticated` no tiene INSERT/UPDATE/DELETE directos y los cambios pasan por funciones con
chequeo de permiso, motivo y auditoría. La tenencia indica qué columna aísla los datos
(centro u organización); las políticas y el barrido `supabase/tests/seeded/cross_tenant.test.sql`
lo verifican. El esquema `private` (funciones de permiso y cálculo) no se expone.

HEAD
  psql "$DATABASE_URL" -XAt -v modules="${modules%,}" -f scripts/data-dictionary.sql
} > "$out"
