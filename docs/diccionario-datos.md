# Diccionario de datos

> Generado desde el esquema con `DATABASE_URL=… bash scripts/data-dictionary.sh`; no editar a mano.
> `npm run test:db` falla si este archivo no coincide con las migraciones.

Esquema `public` (expuesto por PostgREST). Toda tabla tiene RLS; "sólo por RPC" significa que
`authenticated` no tiene INSERT/UPDATE/DELETE directos y los cambios pasan por funciones con
chequeo de permiso, motivo y auditoría. La tenencia indica qué columna aísla los datos
(centro u organización); las políticas y el barrido `supabase/tests/seeded/cross_tenant.test.sql`
lo verifican. El esquema `private` (funciones de permiso y cálculo) no se expone.

### `alert_evaluation_runs`

- **Módulo:** [alertas](modules/alertas.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `source` | text | no |  |
| `actor_id` | uuid | sí |  |
| `started_at` | timestamp with time zone | no | now() |
| `finished_at` | timestamp with time zone | sí |  |
| `rules_evaluated` | integer | no | 0 |
| `created` | integer | no | 0 |
| `updated` | integer | no | 0 |
| `suppressed` | integer | no | 0 |
| `cleared` | integer | no | 0 |
| `error` | text | sí |  |

### `alert_events`

- **Módulo:** [alertas](modules/alertas.md)
- **Tenencia:** por relación (usuario o catálogo global)
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `instance_id` | uuid | no |  |
| `kind` | text | no |  |
| `actor_id` | uuid | sí |  |
| `note` | text | sí |  |
| `value` | numeric(16,4) | sí |  |
| `period_from` | date | sí |  |
| `period_to` | date | sí |  |
| `created_at` | timestamp with time zone | no | now() |

### `alert_instances`

- **Módulo:** [alertas](modules/alertas.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `rule_id` | uuid | no |  |
| `rule_name` | text | no |  |
| `metric_id` | text | no |  |
| `channel` | text | sí |  |
| `condition` | text | no |  |
| `threshold` | numeric(14,2) | sí |  |
| `severity` | text | no |  |
| `scope_key` | text | no |  |
| `detail_center_ids` | uuid[] | no |  |
| `period_from` | date | no |  |
| `period_to` | date | no |  |
| `previous_from` | date | sí |  |
| `previous_to` | date | sí |  |
| `value` | numeric(16,4) | sí |  |
| `previous_value` | numeric(16,4) | sí |  |
| `change_pct` | numeric(12,2) | sí |  |
| `occurrences` | integer | no | 1 |
| `first_detected_at` | timestamp with time zone | no | now() |
| `last_detected_at` | timestamp with time zone | no | now() |
| `last_period_from` | date | no |  |
| `last_period_to` | date | no |  |
| `last_value` | numeric(16,4) | sí |  |
| `condition_cleared_at` | timestamp with time zone | sí |  |
| `status` | text | no | 'nueva'::text |
| `reviewed_at` | timestamp with time zone | sí |  |
| `reviewed_by` | uuid | sí |  |
| `resolved_at` | timestamp with time zone | sí |  |
| `resolved_by` | uuid | sí |  |
| `resolution_note` | text | sí |  |
| `notified_at` | timestamp with time zone | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `alert_rules`

- **Módulo:** [alertas](modules/alertas.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `name` | text | no |  |
| `description` | text | sí |  |
| `metric_id` | text | no |  |
| `channel` | text | sí |  |
| `condition` | text | no |  |
| `threshold` | numeric(14,2) | sí |  |
| `period` | text | no |  |
| `scope_kind` | text | no |  |
| `center_ids` | uuid[] | sí |  |
| `severity` | text | no |  |
| `cooldown_minutes` | integer | no | 1440 |
| `active` | boolean | no | true |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `appointment_services`

- **Módulo:** [agenda](modules/agenda.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (DELETE, INSERT) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `appointment_id` | uuid | no |  |
| `service_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `position` | smallint | no | 0 |
| `duration_minutes` | integer | no |  |
| `created_at` | timestamp with time zone | no | now() |

### `appointments`

- **Módulo:** [agenda](modules/agenda.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `client_id` | uuid | no |  |
| `vehicle_id` | uuid | no |  |
| `starts_at` | timestamp with time zone | no |  |
| `duration_minutes` | integer | no |  |
| `ends_at` | timestamp with time zone | no |  |
| `bay_id` | uuid | sí |  |
| `technician_id` | uuid | sí |  |
| `notes` | text | sí |  |
| `status` | appointment_status | no | 'programada'::appointment_status |
| `is_walk_in` | boolean | no | false |
| `conflict_override` | boolean | no | false |
| `received_at` | timestamp with time zone | sí |  |
| `started_at` | timestamp with time zone | sí |  |
| `finished_at` | timestamp with time zone | sí |  |
| `delivered_at` | timestamp with time zone | sí |  |
| `cancelled_at` | timestamp with time zone | sí |  |
| `service_order_id` | uuid | sí |  |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `quote_id` | uuid | sí |  |

### `approval_events`

- **Módulo:** [egresos](modules/egresos.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `expense_id` | uuid | no |  |
| `kind` | text | no |  |
| `amount` | numeric(12,2) | no |  |
| `note` | text | sí |  |
| `actor_id` | uuid | sí | auth.uid() |
| `occurred_at` | timestamp with time zone | no | clock_timestamp() |

### `audit_log`

- **Módulo:** [multicentro-seguridad](modules/multicentro-seguridad.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `detail_center_id` | uuid | sí |  |
| `table_name` | text | no |  |
| `record_id` | text | sí |  |
| `action` | text | no |  |
| `actor_id` | uuid | sí |  |
| `reason` | text | sí |  |
| `old_data` | jsonb | sí |  |
| `new_data` | jsonb | sí |  |
| `occurred_at` | timestamp with time zone | no | now() |
| `organization_id` | uuid | sí |  |
| `event` | text | sí |  |

### `automation_executions`

- **Módulo:** [automatizaciones](modules/automatizaciones.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `automation_id` | uuid | no |  |
| `run_id` | uuid | sí |  |
| `subject_key` | text | no |  |
| `client_id` | uuid | sí |  |
| `lead_id` | uuid | sí |  |
| `quote_id` | uuid | sí |  |
| `appointment_id` | uuid | sí |  |
| `service_order_id` | uuid | sí |  |
| `task_id` | uuid | sí |  |
| `outcome` | text | no |  |
| `detail` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |

### `automation_runs`

- **Módulo:** [automatizaciones](modules/automatizaciones.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `automation_id` | uuid | no |  |
| `mode` | text | no |  |
| `started_at` | timestamp with time zone | no | now() |
| `finished_at` | timestamp with time zone | sí |  |
| `evaluated` | integer | no | 0 |
| `created` | integer | no | 0 |
| `stopped` | integer | no | 0 |
| `skipped` | jsonb | no | '{}'::jsonb |
| `error` | text | sí |  |
| `run_by` | uuid | sí |  |

### `automations`

- **Módulo:** [automatizaciones](modules/automatizaciones.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | sí |  |
| `name` | text | no |  |
| `trigger` | text | no |  |
| `purpose` | text | no |  |
| `delay_days` | integer | no |  |
| `service_ids` | uuid[] | no | '{}'::uuid[] |
| `lead_sources` | text[] | no | '{}'::text[] |
| `assign_to` | uuid | sí |  |
| `due_in_days` | integer | no | 0 |
| `message_template` | text | sí |  |
| `cooldown_days` | integer | no | 30 |
| `max_per_run` | integer | no | 50 |
| `contact_from` | time without time zone | no | '09:00:00'::time without time zone |
| `contact_to` | time without time zone | no | '19:00:00'::time without time zone |
| `active` | boolean | no | false |
| `activated_at` | timestamp with time zone | sí |  |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `b2b_accounts`

- **Módulo:** [b2b](modules/b2b.md)
- **Tenencia:** centro (`home_detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `home_detail_center_id` | uuid | no |  |
| `client_id` | uuid | no |  |
| `name` | text | no |  |
| `legal_name` | text | sí |  |
| `rfc` | text | sí |  |
| `tax_regime` | text | sí |  |
| `fiscal_zip` | text | sí |  |
| `billing_email` | text | sí |  |
| `status` | text | no | 'activa'::text |
| `notes` | text | sí |  |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `b2b_agreement_centers`

- **Módulo:** [b2b](modules/b2b.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `agreement_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `created_at` | timestamp with time zone | no | now() |

### `b2b_agreements`

- **Módulo:** [b2b](modules/b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `account_id` | uuid | no |  |
| `name` | text | no |  |
| `billing_model` | text | no |  |
| `starts_on` | date | no |  |
| `ends_on` | date | no |  |
| `status` | text | no | 'activo'::text |
| `vehicle_rule` | text | no | 'lista'::text |
| `payment_terms_days` | smallint | no | 30 |
| `credit_limit` | numeric(12,2) | sí |  |
| `fee_amount` | numeric(12,2) | sí |  |
| `included_units` | integer | sí |  |
| `notes` | text | sí |  |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `b2b_contacts`

- **Módulo:** [b2b](modules/b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `account_id` | uuid | no |  |
| `full_name` | text | no |  |
| `title` | text | sí |  |
| `phone` | text | sí |  |
| `email` | text | sí |  |
| `is_primary` | boolean | no | false |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `b2b_invoices`

- **Módulo:** [cxc-b2b](modules/cxc-b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `account_id` | uuid | no |  |
| `reference` | text | sí |  |
| `issued_on` | date | no |  |
| `due_on` | date | no |  |
| `orders_amount` | numeric(12,2) | no |  |
| `fee_amount` | numeric(12,2) | no | 0 |
| `amount` | numeric(12,2) | sí | (orders_amount + fee_amount) |
| `status` | text | no | 'emitida'::text |
| `void_reason` | text | sí |  |
| `notes` | text | sí |  |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `folio` | text | no |  |
| `folio_number` | integer | no |  |
| `period_from` | date | no |  |
| `period_to` | date | no |  |
| `external_invoiced_on` | date | sí |  |
| `due_on_reason` | text | sí |  |

### `b2b_payment_allocations`

- **Módulo:** [cxc-b2b](modules/cxc-b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `payment_id` | uuid | no |  |
| `invoice_id` | uuid | no |  |
| `amount` | numeric(12,2) | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |

### `b2b_payments`

- **Módulo:** [cxc-b2b](modules/cxc-b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `account_id` | uuid | no |  |
| `invoice_id` | uuid | sí |  |
| `amount` | numeric(12,2) | no |  |
| `method` | text | no |  |
| `reference` | text | sí |  |
| `paid_on` | date | no |  |
| `voided_at` | timestamp with time zone | sí |  |
| `void_reason` | text | sí |  |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `b2b_price_rules`

- **Módulo:** [b2b](modules/b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `agreement_id` | uuid | no |  |
| `service_id` | uuid | sí |  |
| `kind` | text | no |  |
| `value` | numeric(12,2) | sí |  |
| `min_monthly_orders` | integer | no | 0 |
| `active` | boolean | no | true |
| `notes` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `b2b_vehicles`

- **Módulo:** [b2b](modules/b2b.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `account_id` | uuid | no |  |
| `vehicle_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `active` | boolean | no | true |
| `cost_center` | text | sí |  |
| `driver_name` | text | sí |  |
| `notes` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `bays`

- **Módulo:** [agenda](modules/agenda.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `name` | text | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `campaign_spend`

- **Módulo:** [marketing](modules/marketing.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `campaign_id` | uuid | no |  |
| `spent_on` | date | no |  |
| `amount` | numeric(12,2) | no |  |
| `channel` | text | no |  |
| `expense_id` | uuid | sí |  |
| `note` | text | sí |  |
| `voided_at` | timestamp with time zone | sí |  |
| `voided_by` | uuid | sí |  |
| `void_reason` | text | sí |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `campaigns`

- **Módulo:** [marketing](modules/marketing.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | sí |  |
| `name` | text | no |  |
| `objective` | text | no |  |
| `channels` | text[] | no | '{}'::text[] |
| `starts_on` | date | no |  |
| `ends_on` | date | no |  |
| `budget` | numeric(12,2) | sí |  |
| `status` | text | no | 'planeada'::text |
| `utm_source` | text | no |  |
| `utm_medium` | text | no |  |
| `utm_campaign` | text | no |  |
| `landing_url` | text | sí |  |
| `notes` | text | sí |  |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `cash_closings`

- **Módulo:** [corte-caja](modules/corte-caja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `session_id` | uuid | no |  |
| `sequence` | smallint | no |  |
| `window_from` | timestamp with time zone | no |  |
| `window_to` | timestamp with time zone | no |  |
| `opening_float` | numeric(12,2) | no |  |
| `cash_collected` | numeric(12,2) | no |  |
| `cash_refunded` | numeric(12,2) | no |  |
| `expected_cash` | numeric(12,2) | no |  |
| `counted_cash` | numeric(12,2) | no |  |
| `difference` | numeric(12,2) | no |  |
| `card_total` | numeric(12,2) | no |  |
| `transfer_total` | numeric(12,2) | no |  |
| `non_cash_total` | numeric(12,2) | no |  |
| `payments_count` | integer | no |  |
| `reversals_count` | integer | no |  |
| `breakdown` | jsonb | no |  |
| `notes` | text | sí |  |
| `closed_by` | uuid | sí | auth.uid() |
| `closed_at` | timestamp with time zone | no | now() |
| `request_id` | uuid | no |  |

### `cash_reopenings`

- **Módulo:** [corte-caja](modules/corte-caja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `session_id` | uuid | no |  |
| `closing_id` | uuid | no |  |
| `reason` | text | no |  |
| `reopened_by` | uuid | sí | auth.uid() |
| `reopened_at` | timestamp with time zone | no | now() |

### `cash_sessions`

- **Módulo:** [corte-caja](modules/corte-caja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `number` | integer | no |  |
| `folio` | text | no |  |
| `business_date` | date | no |  |
| `shift` | text | no |  |
| `opening_float` | numeric(12,2) | no |  |
| `status` | text | no | 'abierta'::text |
| `opened_by` | uuid | sí | auth.uid() |
| `opened_at` | timestamp with time zone | no | now() |
| `window_end` | timestamp with time zone | sí |  |
| `closed_by` | uuid | sí |  |
| `closed_at` | timestamp with time zone | sí |  |
| `closings_count` | smallint | no | 0 |
| `notes` | text | sí |  |
| `version` | integer | no | 1 |
| `request_id` | uuid | no |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `center_baselines`

- **Módulo:** [piloto-rollout](modules/piloto-rollout.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `metric` | text | no |  |
| `value` | numeric(14,2) | no |  |
| `period_from` | date | sí |  |
| `period_to` | date | sí |  |
| `source` | text | no |  |
| `version` | integer | no | 1 |
| `updated_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `channel_accounts`

- **Módulo:** [bandeja](modules/bandeja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `channel` | text | no |  |
| `external_account_id` | text | no |  |
| `label` | text | no |  |
| `verified_name` | text | sí |  |
| `status` | text | no | 'pendiente'::text |
| `last_verified_at` | timestamp with time zone | sí |  |
| `last_verify_error` | text | sí |  |
| `last_webhook_at` | timestamp with time zone | sí |  |
| `active` | boolean | no | true |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `client_centers`

- **Módulo:** [clientes-vehiculos](modules/clientes-vehiculos.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `client_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `first_seen_at` | timestamp with time zone | no | now() |
| `last_visit_at` | timestamp with time zone | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `client_error_reports`

- **Módulo:** [piloto-rollout](modules/piloto-rollout.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `organization_id` | uuid | sí |  |
| `detail_center_id` | uuid | sí |  |
| `user_id` | uuid | sí | auth.uid() |
| `source` | text | no |  |
| `name` | text | no |  |
| `message` | text | no |  |
| `digest` | text | sí |  |
| `route` | text | sí |  |
| `occurred_at` | timestamp with time zone | no | now() |

### `clients`

- **Módulo:** [clientes-vehiculos](modules/clientes-vehiculos.md)
- **Tenencia:** centro (`home_detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `home_detail_center_id` | uuid | no |  |
| `kind` | text | no | 'person'::text |
| `full_name` | text | no |  |
| `phone` | text | no |  |
| `email` | text | sí |  |
| `notes` | text | sí |  |
| `marketing_opt_in` | boolean | no | false |
| `marketing_channels` | text[] | no | '{}'::text[] |
| `marketing_opt_in_at` | timestamp with time zone | sí |  |
| `marketing_opt_in_source` | text | sí |  |
| `last_visit_at` | timestamp with time zone | sí |  |
| `last_visit_detail_center_id` | uuid | sí |  |
| `active` | boolean | no | true |
| `request_id` | uuid | no |  |
| `created_in_detail_center_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `search_name` | text | sí | private.normalize_text(full_name) |
| `phone_digits` | text | sí | regexp_replace(phone, '\D'::text, ''::text, 'g'::text) |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `merged_into_id` | uuid | sí |  |
| `merged_at` | timestamp with time zone | sí |  |
| `merged_by` | uuid | sí |  |

### `contact_preferences`

- **Módulo:** [crm-recurrencia](modules/crm-recurrencia.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `organization_id` | uuid | no |  |
| `client_id` | uuid | no |  |
| `channel` | text | no |  |
| `opted_in` | boolean | no |  |
| `source` | text | no |  |
| `updated_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `content_posts`

- **Módulo:** [marketing](modules/marketing.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | sí |  |
| `campaign_id` | uuid | sí |  |
| `channel` | text | no |  |
| `format` | text | no |  |
| `title` | text | no |  |
| `copy` | text | sí |  |
| `planned_at` | timestamp with time zone | no |  |
| `status` | text | no | 'idea'::text |
| `owner_id` | uuid | sí |  |
| `link_url` | text | sí |  |
| `published_url` | text | sí |  |
| `published_at` | timestamp with time zone | sí |  |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `conversation_notes`

- **Módulo:** [bandeja](modules/bandeja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `conversation_id` | uuid | no |  |
| `body` | text | no |  |
| `author_id` | uuid | sí | auth.uid() |
| `request_id` | uuid | no |  |
| `created_at` | timestamp with time zone | no | now() |

### `conversations`

- **Módulo:** [bandeja](modules/bandeja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `channel_account_id` | uuid | no |  |
| `channel` | text | no |  |
| `contact_external_id` | text | no |  |
| `contact_phone` | text | sí |  |
| `contact_name` | text | sí |  |
| `lead_id` | uuid | sí |  |
| `client_id` | uuid | sí |  |
| `assigned_to` | uuid | sí |  |
| `status` | text | no | 'abierta'::text |
| `unread_count` | integer | no | 0 |
| `last_inbound_at` | timestamp with time zone | sí |  |
| `last_message_at` | timestamp with time zone | no | now() |
| `last_message_preview` | text | sí |  |
| `version` | integer | no | 1 |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `priority` | text | no | 'normal'::text |
| `tags` | text[] | no | '{}'::text[] |
| `pending` | boolean | no | false |

### `crm_tasks`

- **Módulo:** [crm-recurrencia](modules/crm-recurrencia.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `client_id` | uuid | sí |  |
| `vehicle_id` | uuid | sí |  |
| `kind` | text | no |  |
| `channel` | text | no |  |
| `status` | text | no | 'pendiente'::text |
| `due_on` | date | no |  |
| `notes` | text | sí |  |
| `source` | text | no | 'manual'::text |
| `service_order_id` | uuid | sí |  |
| `membership_id` | uuid | sí |  |
| `recommended_service_id` | uuid | sí |  |
| `assigned_to` | uuid | sí |  |
| `outcome` | text | sí |  |
| `outcome_notes` | text | sí |  |
| `completed_at` | timestamp with time zone | sí |  |
| `completed_by` | uuid | sí |  |
| `cancel_reason` | text | sí |  |
| `dedupe_key` | text | sí |  |
| `request_id` | uuid | sí |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `opportunity_id` | uuid | sí |  |
| `lead_id` | uuid | sí |  |
| `automation_id` | uuid | sí |  |

### `dashboard_definitions`

- **Módulo:** [tableros](modules/tableros.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `name` | text | no |  |
| `description` | text | sí |  |
| `audience_role` | app_role | sí |  |
| `center_ids` | uuid[] | sí |  |
| `default_range` | text | no | 'mes'::text |
| `is_default` | boolean | no | false |
| `version` | integer | no | 1 |
| `request_id` | uuid | sí |  |
| `archived_at` | timestamp with time zone | sí |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `dashboard_widgets`

- **Módulo:** [tableros](modules/tableros.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `dashboard_id` | uuid | no |  |
| `metric_id` | text | no |  |
| `widget_type` | text | no |  |
| `title` | text | sí |  |
| `position` | smallint | no |  |
| `col_span` | smallint | no | 1 |
| `row_span` | smallint | no | 1 |
| `options` | jsonb | no | '{}'::jsonb |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `detail_centers`

- **Módulo:** [multicentro-seguridad](modules/multicentro-seguridad.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (UPDATE) · RLS con 2 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `code` | text | no |  |
| `name` | text | no |  |
| `timezone` | text | no | 'America/Mexico_City'::text |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `organization_id` | uuid | no |  |
| `active` | boolean | no | true |

### `expense_attachments`

- **Módulo:** [egresos](modules/egresos.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `expense_id` | uuid | no |  |
| `storage_path` | text | no |  |
| `file_name` | text | sí |  |
| `content_type` | text | no |  |
| `size_bytes` | integer | no |  |
| `uploaded_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `removed_at` | timestamp with time zone | sí |  |
| `removed_by` | uuid | sí |  |
| `remove_reason` | text | sí |  |
| `updated_at` | timestamp with time zone | no | now() |

### `expense_categories`

- **Módulo:** [egresos](modules/egresos.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `code` | text | no |  |
| `name` | text | no |  |
| `pnl_group` | text | no |  |
| `description` | text | sí |  |
| `position` | smallint | no | 50 |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `expense_settings`

- **Módulo:** [egresos](modules/egresos.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `detail_center_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `approval_threshold` | numeric(12,2) | sí |  |
| `updated_at` | timestamp with time zone | no | now() |

### `expenses`

- **Módulo:** [egresos](modules/egresos.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `number` | integer | no |  |
| `folio` | text | no |  |
| `category_id` | uuid | no |  |
| `pnl_group` | text | no |  |
| `vendor_id` | uuid | sí |  |
| `concept` | text | no |  |
| `amount` | numeric(12,2) | no |  |
| `payment_method` | text | no |  |
| `paid_on` | date | no |  |
| `reference` | text | sí |  |
| `notes` | text | sí |  |
| `status` | text | no |  |
| `requires_approval` | boolean | no | false |
| `approved_by` | uuid | sí |  |
| `approved_at` | timestamp with time zone | sí |  |
| `voided_by` | uuid | sí |  |
| `voided_at` | timestamp with time zone | sí |  |
| `void_reason` | text | sí |  |
| `version` | integer | no | 1 |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `inventory_items`

- **Módulo:** [ejecucion-evidencias](modules/ejecucion-evidencias.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `code` | text | no |  |
| `name` | text | no |  |
| `unit` | text | no |  |
| `unit_cost` | numeric(12,4) | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `kpi_settings`

- **Módulo:** [kpis](modules/kpis.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `organization_id` | uuid | no |  |
| `ltv_lifetime_years` | numeric(4,2) | no | 3 |
| `operating_hours_per_day` | numeric(4,2) | no | 10 |
| `operating_days_per_week` | smallint | no | 6 |
| `version` | integer | no | 1 |
| `updated_at` | timestamp with time zone | no | now() |

### `kpi_thresholds`

- **Módulo:** [tablero-corporativo](modules/tablero-corporativo.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `metric_id` | text | no |  |
| `channel` | text | sí |  |
| `detail_center_id` | uuid | sí |  |
| `min_value` | numeric(14,2) | sí |  |
| `max_value` | numeric(14,2) | sí |  |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `lead_events`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `seq` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `lead_id` | uuid | no |  |
| `kind` | text | no |  |
| `source_channel` | text | no |  |
| `from_stage_id` | uuid | sí |  |
| `to_stage_id` | uuid | sí |  |
| `value` | numeric(12,2) | sí |  |
| `owner_id` | uuid | sí |  |
| `channel` | text | sí |  |
| `quote_id` | uuid | sí |  |
| `appointment_id` | uuid | sí |  |
| `service_order_id` | uuid | sí |  |
| `note` | text | sí |  |
| `actor_id` | uuid | sí | auth.uid() |
| `occurred_at` | timestamp with time zone | no | now() |

### `lead_services`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `lead_id` | uuid | no |  |
| `service_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `created_at` | timestamp with time zone | no | now() |

### `lead_stages`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `code` | text | no |  |
| `name` | text | no |  |
| `kind` | text | no |  |
| `milestone` | text | sí |  |
| `position` | smallint | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `leads`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `full_name` | text | no |  |
| `phone` | text | sí |  |
| `email` | text | sí |  |
| `social_handle` | text | sí |  |
| `source_channel` | text | no |  |
| `source_detail` | text | sí |  |
| `referred_by_client_id` | uuid | sí |  |
| `client_id` | uuid | sí |  |
| `vehicle_description` | text | sí |  |
| `notes` | text | sí |  |
| `consent_channels` | text[] | no | '{}'::text[] |
| `consent_at` | timestamp with time zone | sí |  |
| `estimated_value` | numeric(12,2) | sí |  |
| `stage_id` | uuid | no |  |
| `status` | text | no | 'abierta'::text |
| `owner_id` | uuid | sí |  |
| `next_action` | text | sí |  |
| `next_action_on` | date | sí |  |
| `first_contact_at` | timestamp with time zone | sí |  |
| `closed_at` | timestamp with time zone | sí |  |
| `won_value` | numeric(12,2) | sí |  |
| `service_order_id` | uuid | sí |  |
| `loss_reason` | text | sí |  |
| `loss_notes` | text | sí |  |
| `phone_key` | text | sí | "right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text |
| `version` | integer | no | 1 |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `campaign_id` | uuid | sí |  |

### `membership_benefits`

- **Módulo:** [membresias](modules/membresias.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (DELETE, INSERT, UPDATE) · RLS con 4 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `plan_id` | uuid | no |  |
| `service_id` | uuid | no |  |
| `quantity_per_period` | smallint | no |  |
| `notes` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `membership_events`

- **Módulo:** [membresias](modules/membresias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `membership_id` | uuid | no |  |
| `membership_center_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `kind` | text | no |  |
| `from_state` | text | sí |  |
| `to_state` | text | sí |  |
| `plan_code` | text | sí |  |
| `amount` | numeric(12,2) | sí |  |
| `period_start` | date | sí |  |
| `period_end` | date | sí |  |
| `reason` | text | sí |  |
| `data` | jsonb | sí |  |
| `request_id` | uuid | sí |  |
| `actor_id` | uuid | sí |  |
| `occurred_at` | timestamp with time zone | no | clock_timestamp() |

### `membership_plans`

- **Módulo:** [membresias](modules/membresias.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `code` | text | no |  |
| `tier` | text | no |  |
| `name` | text | no |  |
| `description` | text | sí |  |
| `price` | numeric(12,2) | no |  |
| `period_months` | smallint | no |  |
| `redeem_scope` | text | no | 'centro_origen'::text |
| `restrictions` | text | sí |  |
| `renewal_notice_days` | smallint | no | 7 |
| `available_from` | date | no |  |
| `available_until` | date | sí |  |
| `active` | boolean | no | true |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `membership_redemptions`

- **Módulo:** [membresias](modules/membresias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `membership_id` | uuid | no |  |
| `membership_center_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `item_id` | uuid | sí |  |
| `discount_id` | uuid | sí |  |
| `service_id` | uuid | no |  |
| `service_code` | text | no |  |
| `service_name` | text | no |  |
| `quantity` | smallint | no |  |
| `unit_price` | numeric(12,2) | no |  |
| `amount` | numeric(12,2) | no |  |
| `period_start` | date | no |  |
| `period_end` | date | no |  |
| `request_id` | uuid | no |  |
| `redeemed_by` | uuid | sí | auth.uid() |
| `redeemed_at` | timestamp with time zone | no | now() |
| `voided_at` | timestamp with time zone | sí |  |
| `voided_by` | uuid | sí |  |
| `void_reason` | text | sí |  |
| `updated_at` | timestamp with time zone | no | now() |

### `memberships`

- **Módulo:** [membresias](modules/membresias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `number` | text | no |  |
| `number_seq` | integer | no |  |
| `plan_id` | uuid | no |  |
| `client_id` | uuid | no |  |
| `vehicle_id` | uuid | no |  |
| `state` | membership_state | no | 'activa'::membership_state |
| `plan_code` | text | no |  |
| `plan_name` | text | no |  |
| `plan_tier` | text | no |  |
| `price` | numeric(12,2) | no |  |
| `period_months` | smallint | no |  |
| `redeem_scope` | text | no |  |
| `renewal_notice_days` | smallint | no |  |
| `benefits` | jsonb | no |  |
| `started_on` | date | no |  |
| `period_anchor` | date | no |  |
| `ends_on` | date | no |  |
| `renewals` | integer | no | 0 |
| `auto_renew` | boolean | no | false |
| `payment_method_ref` | text | sí |  |
| `suspended_at` | timestamp with time zone | sí |  |
| `cancelled_at` | timestamp with time zone | sí |  |
| `cancel_reason` | text | sí |  |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `messages`

- **Módulo:** [bandeja](modules/bandeja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `conversation_id` | uuid | no |  |
| `direction` | text | no |  |
| `external_id` | text | sí |  |
| `message_type` | text | no | 'text'::text |
| `body` | text | sí |  |
| `status` | text | no |  |
| `error` | text | sí |  |
| `sent_by` | uuid | sí |  |
| `request_id` | uuid | sí |  |
| `occurred_at` | timestamp with time zone | no | now() |
| `status_at` | timestamp with time zone | no | now() |
| `created_at` | timestamp with time zone | no | now() |

### `metric_registry`

- **Módulo:** [tableros](modules/tableros.md)
- **Tenencia:** por relación (usuario o catálogo global)
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | text | no |  |
| `version` | integer | no |  |
| `name` | text | no |  |
| `description` | text | no |  |
| `unit` | text | no |  |
| `formula` | text | no |  |
| `source` | text | no |  |
| `source_tables` | text[] | no |  |
| `capability` | text | no |  |
| `widget_types` | text[] | no |  |
| `filters` | text[] | no | '{}'::text[] |
| `breakdowns` | text[] | no | '{}'::text[] |
| `drill` | boolean | no | false |
| `active` | boolean | no | true |
| `updated_at` | timestamp with time zone | no | now() |

### `opportunity_events`

- **Módulo:** [pipeline](modules/pipeline.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `seq` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `opportunity_id` | uuid | no |  |
| `kind` | text | no |  |
| `opportunity_kind` | text | no |  |
| `from_stage_id` | uuid | sí |  |
| `to_stage_id` | uuid | sí |  |
| `value` | numeric(12,2) | sí |  |
| `owner_id` | uuid | sí |  |
| `note` | text | sí |  |
| `actor_id` | uuid | sí | auth.uid() |
| `occurred_at` | timestamp with time zone | no | now() |

### `organizations`

- **Módulo:** [multicentro-seguridad](modules/multicentro-seguridad.md)
- **Tenencia:** por relación (usuario o catálogo global)
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `slug` | text | no |  |
| `name` | text | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `payment_allocations`

- **Módulo:** [cobranza](modules/cobranza.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `payment_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `amount` | numeric(12,2) | no |  |
| `created_at` | timestamp with time zone | no | now() |

### `payment_methods`

- **Módulo:** [cobranza](modules/cobranza.md)
- **Tenencia:** por relación (usuario o catálogo global)
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `code` | text | no |  |
| `name` | text | no |  |
| `kind` | text | no |  |
| `collects_cash` | boolean | no |  |
| `requires_reference` | boolean | no | false |
| `allows_change` | boolean | no | false |
| `position` | smallint | no |  |
| `active` | boolean | no | true |

### `payment_reversals`

- **Módulo:** [cobranza](modules/cobranza.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `payment_id` | uuid | no |  |
| `amount` | numeric(12,2) | no |  |
| `reason` | text | no |  |
| `reversed_by` | uuid | sí | auth.uid() |
| `reversed_at` | timestamp with time zone | no | now() |

### `payment_tenders`

- **Módulo:** [cobranza](modules/cobranza.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `payment_id` | uuid | no |  |
| `method` | text | no |  |
| `amount` | numeric(12,2) | no |  |
| `reference` | text | sí |  |
| `membership_id` | uuid | sí |  |
| `b2b_account_id` | uuid | sí |  |
| `created_at` | timestamp with time zone | no | now() |

### `payments`

- **Módulo:** [cobranza](modules/cobranza.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `receipt_number` | integer | no |  |
| `receipt_folio` | text | no |  |
| `client_id` | uuid | sí |  |
| `amount` | numeric(12,2) | no |  |
| `cash_received` | numeric(12,2) | sí |  |
| `change_amount` | numeric(12,2) | no | 0 |
| `status` | text | no | 'valido'::text |
| `notes` | text | sí |  |
| `received_by` | uuid | sí | auth.uid() |
| `received_at` | timestamp with time zone | no | now() |
| `request_id` | uuid | no |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `pipeline_stages`

- **Módulo:** [pipeline](modules/pipeline.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `code` | text | no |  |
| `name` | text | no |  |
| `kind` | text | no |  |
| `position` | smallint | no |  |
| `probability` | smallint | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `profiles`

- **Módulo:** [auth-sesion](modules/auth-sesion.md)
- **Tenencia:** por relación (usuario o catálogo global)
- **Escritura:** directa con RLS (DELETE, INSERT) · RLS con 2 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no |  |
| `full_name` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `active` | boolean | no | true |
| `last_detail_center_id` | uuid | sí |  |

### `promotions`

- **Módulo:** [marketing](modules/marketing.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `campaign_id` | uuid | sí |  |
| `code` | text | no |  |
| `name` | text | no |  |
| `kind` | text | no |  |
| `value` | numeric(12,2) | no |  |
| `service_ids` | uuid[] | no | '{}'::uuid[] |
| `detail_center_ids` | uuid[] | no | '{}'::uuid[] |
| `starts_on` | date | no |  |
| `ends_on` | date | no |  |
| `max_uses` | integer | sí |  |
| `active` | boolean | no | true |
| `authorization_level` | discount_level | no | 'admin'::discount_level |
| `terms` | text | sí |  |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `quick_replies`

- **Módulo:** [bandeja](modules/bandeja.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | sí |  |
| `title` | text | no |  |
| `body` | text | no |  |
| `active` | boolean | no | true |
| `version` | integer | no | 1 |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `quote_discounts`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `quote_id` | uuid | no |  |
| `item_id` | uuid | sí |  |
| `kind` | text | no |  |
| `value` | numeric(12,2) | no |  |
| `amount` | numeric(12,2) | no | 0 |
| `reason` | text | no |  |
| `authorization_level` | discount_level | no |  |
| `authorized_by` | uuid | sí | auth.uid() |
| `voided_at` | timestamp with time zone | sí |  |
| `voided_by` | uuid | sí |  |
| `void_reason` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `source` | text | no | 'manual'::text |
| `promotion_id` | uuid | sí |  |

### `quote_items`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `quote_id` | uuid | no |  |
| `position` | smallint | no | 0 |
| `service_id` | uuid | no |  |
| `service_code` | text | no |  |
| `service_name` | text | no |  |
| `revenue_engine` | revenue_engine | no |  |
| `unit_price` | numeric(12,2) | no |  |
| `price_source` | text | no |  |
| `unit_direct_cost` | numeric(12,2) | no |  |
| `operator_commission_pct` | numeric(5,2) | sí |  |
| `duration_minutes` | integer | no |  |
| `quantity` | integer | no |  |
| `line_subtotal` | numeric(12,2) | sí | round(((quantity)::numeric * unit_price), 2) |
| `line_discount` | numeric(12,2) | no | 0 |
| `operator_pay` | numeric(12,2) | sí | GREATEST(round((((((quantity)::numeric * unit_price) - line_ |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `quotes`

- **Módulo:** [prospectos-cotizaciones](modules/prospectos-cotizaciones.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `folio` | text | no |  |
| `folio_number` | integer | no |  |
| `lead_id` | uuid | sí |  |
| `client_id` | uuid | sí |  |
| `vehicle_id` | uuid | sí |  |
| `contact_name` | text | no |  |
| `status` | text | no | 'borrador'::text |
| `valid_until` | date | no |  |
| `subtotal` | numeric(12,2) | no | 0 |
| `discount_total` | numeric(12,2) | no | 0 |
| `total` | numeric(12,2) | no | 0 |
| `standard_cost_total` | numeric(12,2) | no | 0 |
| `operator_pay_total` | numeric(12,2) | no | 0 |
| `cost_total` | numeric(12,2) | sí | (standard_cost_total + operator_pay_total) |
| `contribution_margin` | numeric(12,2) | sí | ((total - standard_cost_total) - operator_pay_total) |
| `notes` | text | sí |  |
| `appointment_id` | uuid | sí |  |
| `sent_at` | timestamp with time zone | sí |  |
| `decided_at` | timestamp with time zone | sí |  |
| `decision_reason` | text | sí |  |
| `converted_at` | timestamp with time zone | sí |  |
| `version` | integer | no | 1 |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `role_assignments`

- **Módulo:** [multicentro-seguridad](modules/multicentro-seguridad.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `role` | app_role | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `sales_opportunities`

- **Módulo:** [pipeline](modules/pipeline.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `kind` | text | no |  |
| `title` | text | no |  |
| `b2b_account_id` | uuid | sí |  |
| `client_id` | uuid | sí |  |
| `company_name` | text | sí |  |
| `legal_name` | text | sí |  |
| `rfc` | text | sí |  |
| `contact_name` | text | sí |  |
| `contact_title` | text | sí |  |
| `contact_phone` | text | sí |  |
| `contact_email` | text | sí |  |
| `estimated_value` | numeric(12,2) | no |  |
| `stage_id` | uuid | no |  |
| `status` | text | no | 'abierta'::text |
| `owner_id` | uuid | sí |  |
| `next_action` | text | sí |  |
| `next_action_on` | date | sí |  |
| `expected_close_on` | date | sí |  |
| `source` | text | sí |  |
| `proposed_billing_model` | text | sí |  |
| `proposed_months` | smallint | sí |  |
| `proposed_vehicle_rule` | text | sí |  |
| `proposed_payment_terms_days` | smallint | sí |  |
| `proposed_credit_limit` | numeric(12,2) | sí |  |
| `proposed_fee_amount` | numeric(12,2) | sí |  |
| `proposed_included_units` | integer | sí |  |
| `notes` | text | sí |  |
| `closed_at` | timestamp with time zone | sí |  |
| `won_value` | numeric(12,2) | sí |  |
| `loss_reason` | text | sí |  |
| `loss_notes` | text | sí |  |
| `converted_account_id` | uuid | sí |  |
| `converted_agreement_id` | uuid | sí |  |
| `version` | integer | no | 1 |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `service_center_config`

- **Módulo:** [catalogo](modules/catalogo.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_id` | uuid | no |  |
| `available` | boolean | no | true |
| `price_override` | numeric(12,2) | sí |  |
| `direct_cost_override` | numeric(12,2) | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `operator_commission_pct_override` | numeric(5,2) | sí |  |

### `service_order_consumptions`

- **Módulo:** [ejecucion-evidencias](modules/ejecucion-evidencias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `item_id` | uuid | no |  |
| `inventory_item_id` | uuid | no |  |
| `unit` | text | no |  |
| `standard_quantity` | numeric(12,3) | no |  |
| `actual_quantity` | numeric(12,3) | no |  |
| `unit_cost` | numeric(12,4) | no |  |
| `note` | text | sí |  |
| `recorded_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `service_order_discounts`

- **Módulo:** [orden-servicio](modules/orden-servicio.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `item_id` | uuid | sí |  |
| `kind` | text | no |  |
| `value` | numeric(12,2) | no |  |
| `amount` | numeric(12,2) | no | 0 |
| `reason` | text | no |  |
| `authorization_level` | discount_level | no |  |
| `authorized_by` | uuid | sí | auth.uid() |
| `voided_at` | timestamp with time zone | sí |  |
| `voided_by` | uuid | sí |  |
| `void_reason` | text | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `source` | text | no | 'manual'::text |
| `promotion_id` | uuid | sí |  |

### `service_order_events`

- **Módulo:** [orden-servicio](modules/orden-servicio.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `item_id` | uuid | sí |  |
| `kind` | text | no |  |
| `technician_id` | uuid | sí |  |
| `note` | text | sí |  |
| `data` | jsonb | sí |  |
| `actor_id` | uuid | sí |  |
| `occurred_at` | timestamp with time zone | no | clock_timestamp() |

### `service_order_evidence`

- **Módulo:** [ejecucion-evidencias](modules/ejecucion-evidencias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `item_id` | uuid | sí |  |
| `incident_id` | uuid | sí |  |
| `kind` | text | no |  |
| `storage_path` | text | no |  |
| `content_type` | text | no |  |
| `size_bytes` | integer | no |  |
| `width` | integer | sí |  |
| `height` | integer | sí |  |
| `note` | text | sí |  |
| `taken_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `deleted_at` | timestamp with time zone | sí |  |
| `deleted_by` | uuid | sí |  |
| `delete_reason` | text | sí |  |
| `updated_at` | timestamp with time zone | no | now() |

### `service_order_incidents`

- **Módulo:** [ejecucion-evidencias](modules/ejecucion-evidencias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `item_id` | uuid | sí |  |
| `kind` | text | no |  |
| `description` | text | no |  |
| `status` | text | no | 'abierta'::text |
| `resolution` | text | sí |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `resolved_by` | uuid | sí |  |
| `resolved_at` | timestamp with time zone | sí |  |
| `updated_at` | timestamp with time zone | no | now() |

### `service_order_items`

- **Módulo:** [orden-servicio](modules/orden-servicio.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (DELETE, INSERT, UPDATE) · RLS con 4 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `position` | smallint | no | 0 |
| `kind` | text | no |  |
| `service_id` | uuid | no |  |
| `service_code` | text | no |  |
| `service_name` | text | no |  |
| `revenue_engine` | revenue_engine | no |  |
| `unit_price` | numeric(12,2) | no |  |
| `unit_direct_cost` | numeric(12,2) | no |  |
| `duration_minutes` | integer | no |  |
| `price_source` | text | no |  |
| `quantity` | integer | no |  |
| `line_subtotal` | numeric(12,2) | sí | round(((quantity)::numeric * unit_price), 2) |
| `line_discount` | numeric(12,2) | no | 0 |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `work_status` | item_work_status | no | 'pendiente'::item_work_status |
| `started_at` | timestamp with time zone | sí |  |
| `finished_at` | timestamp with time zone | sí |  |
| `work_started_at` | timestamp with time zone | sí |  |
| `worked_minutes` | integer | no | 0 |
| `technician_id` | uuid | sí |  |
| `list_unit_price` | numeric(12,2) | sí |  |
| `b2b_price_rule_id` | uuid | sí |  |
| `operator_commission_pct` | numeric(5,2) | sí |  |
| `operator_commission_amount` | numeric(12,2) | sí | GREATEST(round((((((quantity)::numeric * unit_price) - line_ |

### `service_order_staff`

- **Módulo:** [ejecucion-evidencias](modules/ejecucion-evidencias.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (DELETE, INSERT) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `service_order_id` | uuid | no |  |
| `technician_id` | uuid | no |  |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `added_by` | uuid | sí | auth.uid() |
| `added_at` | timestamp with time zone | no | now() |

### `service_order_status_history`

- **Módulo:** [orden-servicio](modules/orden-servicio.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `from_status` | service_order_status | sí |  |
| `to_status` | service_order_status | no |  |
| `reason` | text | sí |  |
| `actor_id` | uuid | sí |  |
| `occurred_at` | timestamp with time zone | no | clock_timestamp() |

### `service_orders`

- **Módulo:** [orden-servicio](modules/orden-servicio.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `folio` | text | no |  |
| `folio_number` | integer | no |  |
| `appointment_id` | uuid | sí |  |
| `client_id` | uuid | no |  |
| `vehicle_id` | uuid | no |  |
| `channel` | sales_channel | no | 'b2c'::sales_channel |
| `channel_reference` | text | sí |  |
| `b2b_account_id` | uuid | sí |  |
| `status` | service_order_status | no | 'abierta'::service_order_status |
| `version` | integer | no | 1 |
| `client_name` | text | no |  |
| `client_phone` | text | sí |  |
| `client_email` | text | sí |  |
| `vehicle_make` | text | no |  |
| `vehicle_model` | text | no |  |
| `vehicle_year` | smallint | no |  |
| `vehicle_plate` | text | no |  |
| `odometer_km` | integer | sí |  |
| `bay_id` | uuid | sí |  |
| `technician_id` | uuid | sí |  |
| `diagnosis` | text | sí |  |
| `observations` | text | sí |  |
| `recommendations` | text | sí |  |
| `next_visit_on` | date | sí |  |
| `next_visit_service_id` | uuid | sí |  |
| `next_visit_notes` | text | sí |  |
| `subtotal` | numeric(12,2) | no | 0 |
| `discount_total` | numeric(12,2) | no | 0 |
| `total` | numeric(12,2) | no | 0 |
| `cost_total` | numeric(12,2) | no | 0 |
| `estimated_minutes` | integer | no | 0 |
| `paid_amount` | numeric(12,2) | no | 0 |
| `authorized_at` | timestamp with time zone | sí |  |
| `authorized_by` | uuid | sí |  |
| `authorized_total` | numeric(12,2) | sí |  |
| `promised_at` | timestamp with time zone | sí |  |
| `started_at` | timestamp with time zone | sí |  |
| `finished_at` | timestamp with time zone | sí |  |
| `delivered_at` | timestamp with time zone | sí |  |
| `cancelled_at` | timestamp with time zone | sí |  |
| `work_started_at` | timestamp with time zone | sí |  |
| `worked_minutes` | integer | no | 0 |
| `request_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `b2b_agreement_id` | uuid | sí |  |
| `b2b_invoice_id` | uuid | sí |  |
| `payment_status` | text | sí | 
CASE
    WHEN (paid_amount >= total) THEN 'pagada'::text
   |

### `service_price_history`

- **Módulo:** [catalogo](modules/catalogo.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | bigint | no |  |
| `organization_id` | uuid | no |  |
| `service_id` | uuid | no |  |
| `detail_center_id` | uuid | sí |  |
| `price` | numeric(12,2) | sí |  |
| `direct_cost` | numeric(12,2) | sí |  |
| `valid_from` | timestamp with time zone | no | clock_timestamp() |
| `changed_by` | uuid | sí | auth.uid() |
| `reason` | text | sí |  |
| `operator_commission_pct` | numeric(5,2) | sí |  |

### `service_supply_standards`

- **Módulo:** [ejecucion-evidencias](modules/ejecucion-evidencias.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (DELETE, INSERT, UPDATE) · RLS con 4 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `organization_id` | uuid | no |  |
| `service_id` | uuid | no |  |
| `inventory_item_id` | uuid | no |  |
| `quantity` | numeric(12,3) | no |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `services`

- **Módulo:** [catalogo](modules/catalogo.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `code` | text | no |  |
| `name` | text | no |  |
| `description` | text | sí |  |
| `revenue_engine` | revenue_engine | no |  |
| `standard_duration_minutes` | integer | no |  |
| `base_price` | numeric(12,2) | no |  |
| `standard_direct_cost` | numeric(12,2) | no |  |
| `active` | boolean | no | true |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |
| `operator_commission_pct` | numeric(5,2) | sí |  |

### `technicians`

- **Módulo:** [agenda](modules/agenda.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `full_name` | text | no |  |
| `profile_id` | uuid | sí |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `upsell_offers`

- **Módulo:** [recomendaciones](modules/recomendaciones.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `detail_center_id` | uuid | no |  |
| `service_order_id` | uuid | no |  |
| `rule_id` | uuid | no |  |
| `stage` | text | no |  |
| `target_service_id` | uuid | sí |  |
| `target_plan_id` | uuid | sí |  |
| `suggested_price` | numeric(12,2) | no |  |
| `status` | text | no | 'ofrecida'::text |
| `rejection_reason` | text | sí |  |
| `accepted_item_id` | uuid | sí |  |
| `accepted_value` | numeric(12,2) | sí |  |
| `offered_by` | uuid | sí | auth.uid() |
| `offered_at` | timestamp with time zone | no | now() |
| `decided_by` | uuid | sí |  |
| `decided_at` | timestamp with time zone | sí |  |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `upsell_rules`

- **Módulo:** [recomendaciones](modules/recomendaciones.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `name` | text | no |  |
| `source_service_id` | uuid | sí |  |
| `target_service_id` | uuid | sí |  |
| `target_plan_id` | uuid | sí |  |
| `stage` | text | no | 'diagnostico'::text |
| `priority` | smallint | no | 50 |
| `pitch` | text | no |  |
| `channels` | text[] | no | '{b2c,membresia,b2b}'::text[] |
| `center_ids` | uuid[] | sí |  |
| `min_order_total` | numeric(12,2) | sí |  |
| `starts_on` | date | no |  |
| `ends_on` | date | sí |  |
| `active` | boolean | no | true |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `user_dashboard_preferences`

- **Módulo:** [tableros](modules/tableros.md)
- **Tenencia:** por relación (usuario o catálogo global)
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `user_id` | uuid | no |  |
| `dashboard_id` | uuid | no |  |
| `widget_order` | uuid[] | no | '{}'::uuid[] |
| `hidden_widget_ids` | uuid[] | no | '{}'::uuid[] |
| `filters` | jsonb | no | '{}'::jsonb |
| `is_favorite` | boolean | no | false |
| `updated_at` | timestamp with time zone | no | now() |

### `user_detail_centers`

- **Módulo:** [multicentro-seguridad](modules/multicentro-seguridad.md)
- **Tenencia:** centro (`detail_center_id`) y organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `detail_center_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `role` | app_role | no |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `vehicles`

- **Módulo:** [clientes-vehiculos](modules/clientes-vehiculos.md)
- **Tenencia:** organización
- **Escritura:** directa con RLS (INSERT, UPDATE) · RLS con 3 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `client_id` | uuid | no |  |
| `make` | text | no |  |
| `model` | text | no |  |
| `year` | smallint | no |  |
| `plate` | text | no |  |
| `identifier` | text | sí |  |
| `notes` | text | sí |  |
| `active` | boolean | no | true |
| `request_id` | uuid | sí |  |
| `created_in_detail_center_id` | uuid | no |  |
| `created_by` | uuid | sí | auth.uid() |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `vendors`

- **Módulo:** [egresos](modules/egresos.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `name` | text | no |  |
| `rfc` | text | sí |  |
| `phone` | text | sí |  |
| `email` | text | sí |  |
| `notes` | text | sí |  |
| `active` | boolean | no | true |
| `created_at` | timestamp with time zone | no | now() |
| `updated_at` | timestamp with time zone | no | now() |

### `whatsapp_templates`

- **Módulo:** [bandeja](modules/bandeja.md)
- **Tenencia:** organización
- **Escritura:** sólo por RPC · RLS con 1 política(s)

| Columna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | uuid | no | gen_random_uuid() |
| `organization_id` | uuid | no |  |
| `business_account_id` | text | no |  |
| `name` | text | no |  |
| `language` | text | no |  |
| `category` | text | no |  |
| `status` | text | no |  |
| `body_text` | text | sí |  |
| `param_count` | integer | no | 0 |
| `synced_at` | timestamp with time zone | no | now() |

