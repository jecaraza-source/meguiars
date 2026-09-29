# ADR 0027 — Alertas: evaluación programada en Vercel Cron y deduplicación en la base

- Estado: aceptado
- Fecha: 2026-09-29

## Contexto

D4 pide alertas configurables por KPI (umbral, variación, ausencia de dato) por centro, conjunto o corporativo, con bandeja, sin duplicados ilimitados, sin perder historial y respetando permisos por centro. Los KPIs se calculan en TypeScript (`@meguiars/analytics`, ADR 0023/0024) a partir de una sola lectura (`dashboard_facts`); la base sólo entrega hechos con sus permisos.

## Decisión

1. **Evaluación en Vercel Cron (diaria), no en `pg_cron`.** Con `pg_cron` habría que reescribir en SQL las fórmulas de ~35 KPIs y mantener dos implementaciones; en Vercel Cron el runner reutiliza el mismo servicio de métricas que tableros y KPIs, y "Evaluar ahora" usa exactamente el mismo código. Los periodos son cerrados (día/semana/mes anterior; mes en curso hasta ayer), así que una corrida diaria basta y cabe en el plan Hobby.
2. **Llave de servicio acotada.** La ruta `/api/cron/alertas` exige `CRON_SECRET` y es la única que usa `SUPABASE_SERVICE_ROLE_KEY` (`server-only`). Los hechos se leen con `alert_rule_facts`, que fija las claims del **autor de la regla** y llama `dashboard_facts`: el cron nunca ve más de lo que ve quien configuró la regla. Registrar resultados y corridas va por RPC con validación (centros del resultado ⊂ centros de la regla; corrida abierta).
3. **Deduplicación y cooldown en la base.** Índice único parcial: una alerta abierta por (regla, ámbito). `record_alert_results` actualiza la abierta (ocurrencias, último valor/periodo, evento "repetida"), aplica el cooldown contra la última resuelta y usa `on conflict do nothing` ante corridas simultáneas.
4. **Historial inmutable.** Resolver cambia el estado con nota obligatoria; nunca se borra. `alert_events` es sólo inserción. La alerta copia KPI, condición, umbral y severidad al dispararse, para seguir siendo trazable aunque la regla cambie.
5. **Permisos por centro con RLS.** Una alerta se ve si el usuario puede leer alertas en todos sus centros, y se gestiona si puede gestionarlas en todos.
6. **Notificaciones fuera de alcance**, con interfaz lista (`AlertNotifier`, `notified_at`).

## Consecuencias

- Requiere configurar `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` en Vercel (producción). Sin ellas no hay evaluación automática (sí manual).
- Una regla cuyo autor pierde acceso (o es borrado) deja de ver esos centros o se omite; hay que volver a guardarla con otro admin.
- La hora de corrida es aproximada (Vercel Cron en Hobby). Si se necesita granularidad horaria, basta cambiar el `schedule` en un plan que lo permita; la lógica no cambia.
