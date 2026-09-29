# Dirección / Alertas (D4)

Gestión por excepción: reglas sobre KPIs registrados que abren alertas cuando un indicador sale de lo esperado. Web: `/direccion/alertas` (bandeja), `/direccion/alertas/[id]` (detalle e historial) y `/direccion/alertas/reglas` (reglas). Móvil: **Dirección → Alertas**. Decisiones en [ADR 0027](../adr/0027-alertas-evaluacion-programada-y-deduplicacion.md).

## Reglas

| Campo     | Valores                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| KPI       | cualquier métrica registrada (D1/D2); canal fijo opcional si la métrica admite el filtro `canal`                               |
| Condición | por debajo / por encima de un umbral; caída / alza contra el periodo anterior (en % o en **puntos** si el KPI es %); sin datos |
| Periodo   | día anterior; semana anterior (lun–dom); mes en curso hasta ayer (vs. mismos días del mes anterior); mes anterior              |
| Ámbito    | **cada centro** (una alerta por centro), **conjunto** (≥ 2 centros, cifra consolidada) o **corporativo** (todos los centros)   |
| Severidad | informativa, atención, crítica                                                                                                 |
| Cooldown  | 0 min a 30 días (1 día por defecto): tras resolver, no se reabre la misma regla y ámbito durante ese tiempo                    |

Sólo el **admin corporativo** crea y edita reglas (`save_alert_rule`, con versión, motivo y auditoría). El valor del KPI sale del mismo servicio de métricas que tableros y KPIs (una fórmula). "Sin datos" = no hay hechos del KPI en el periodo; con canal fijo en ventas, sin ingresos de ese canal.

## Alertas

- **Trazables**: cada alerta guarda KPI, canal, condición y umbral (copia de la regla al dispararse), centro(s), periodo evaluado, valor, periodo anterior y variación. Enlaza a **Dirección → KPIs** con ese periodo y centros y, si el KPI es tarjeta del tablero corporativo, a su **drill-down** (sólo si el usuario puede abrir esas pantallas).
- **Sin duplicados**: índice único parcial — como máximo una alerta abierta (nueva o revisada) por regla y ámbito. Si la condición se repite, se actualizan ocurrencias, último valor y último periodo, y se registra el evento "Se repitió".
- **Estados**: nueva → revisada → resuelta. Resolver exige nota. **Resolver no borra**: la alerta y su historial (`alert_events`: detectada, se repitió, la condición dejó de cumplirse, revisada, resuelta) quedan. Si la condición deja de cumplirse, se marca pero no se resuelve sola.
- **Cooldown**: tras resolver, si la condición vuelve a cumplirse dentro del cooldown, no se abre otra (queda contada como suprimida en la corrida).

## Evaluación

- **Programada**: Vercel Cron diario (`apps/web/vercel.json`, `0 12 * * *` UTC = 6:00 en CDMX) llama `GET /api/cron/alertas` con `Authorization: Bearer $CRON_SECRET`. La ruta usa la llave de servicio **sólo en el servidor** y, por cada organización con reglas activas, corre `runAlertEvaluation` (@meguiars/analytics). Los hechos se leen con `alert_rule_facts`, que ejecuta `dashboard_facts` **con los permisos del autor de la regla**.
- **Manual**: "Evaluar ahora" (admin corporativo, web y móvil) corre el mismo runner con la sesión del usuario.
- Cada corrida queda en `alert_evaluation_runs` (origen, reglas evaluadas, nuevas, repetidas, suprimidas, superadas, errores). Un error en una regla no detiene las demás.
- Las reglas sin autor (sembradas o de un usuario borrado) no se evalúan en el cron hasta que un admin las guarde.

## Permisos

| Rol                 | Bandeja (alertas de sus centros) | Revisar / resolver | Reglas y "Evaluar ahora" |
| ------------------- | -------------------------------- | ------------------ | ------------------------ |
| admin_socio         | sí                               | sí                 | sí (corporativo)         |
| encargado           | sí                               | sí                 | no                       |
| contador            | sí                               | no                 | no                       |
| operador, comercial | no                               | no                 | no                       |

Una alerta de conjunto o corporativa sólo se ve (y gestiona) si el usuario tiene el permiso en **todos** sus centros (RLS en `alert_instances`).

## Notificaciones (futuro)

No se envían correos ni WhatsApp. La interfaz queda lista: `AlertNotifier.notify({ organizationId, ruleId, alertIds })` recibe las alertas nuevas de cada regla (el runner la llama si se pasa un notificador) y la columna `alert_instances.notified_at` está reservada para marcar el envío.

## Base de datos (20261018000000_alerts.sql)

- Tablas: `alert_rules`, `alert_instances`, `alert_events` (sólo inserción), `alert_evaluation_runs`. Sin escritura directa: todo por RPC.
- RPC: `save_alert_rule`, `review_alert`, `resolve_alert`, `start_alert_run`, `finish_alert_run`, `record_alert_results` (deduplicación y cooldown), `alert_rule_facts` (sólo `service_role`).
- Helpers: `private.can_read_alerts`, `can_manage_alerts`, `alert_visible`, `alert_manageable`, `is_service_request`, `can_evaluate_alerts`.

## Variables de entorno (sólo servidor, Vercel → Production)

| Variable                    | Uso                                                            |
| --------------------------- | -------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | llave de servicio, sólo en `/api/cron/alertas` (`server-only`) |
| `CRON_SECRET`               | secreto que Vercel Cron envía como `Authorization: Bearer …`   |

Sin ellas, la ruta responde 401/503 y no evalúa; "Evaluar ahora" sigue funcionando. Nunca con prefijo `NEXT_PUBLIC_` ni en móvil. Vercel Cron sólo corre en el despliegue de producción; en el plan Hobby, una vez al día.

## Datos de ejemplo

El seed agrega 3 reglas (venta diaria baja por centro, caída de ventas del mes corporativa, sin vehículos atendidos) y una alerta nueva en Monterrey con su evento "Detectada".

## Pruebas

- `supabase/tests/alerts.test.sql`: permisos y validaciones de reglas, trazabilidad, sin duplicados, RLS por centro, revisar/resolver con historial, cooldown, condición superada, corridas, lectura como autor (`service_role`) y auditoría.
- `packages/analytics/src/alerts/alerts.test.ts`: ventanas, ámbitos, cada condición (incluidos puntos para %), sin datos con canal, runner con puerto falso y enlaces.
- `packages/domain/src/alerts/alerts.test.ts`, `packages/validation/src/alerts.test.ts`, `packages/supabase/src/repositories/alerts.test.ts`.
- `scripts/dashboard-parity.test.mjs`: cargadores de alertas idénticos en web y móvil.
