# ADR 0041 — Reportes de Dirección por correo con Resend y envío diario idempotente

- Estado: aceptado
- Fecha: 2026-10-19

## Contexto

Dirección pidió recibir los reportes por correo con frecuencia diaria, semanal, quincenal y mensual. El correo es **sólo para reporteo interno**: no habrá correos a clientes ni SMS (se descartó esa parte de la nota 1). Las cifras ya existen en el Tablero corporativo ([ADR 0025](0025-tablero-corporativo-y-drill-down-conciliado.md)) y se calculan en TypeScript; la evaluación programada de alertas ya resolvió cómo leer hechos desde un cron con los permisos de una persona ([ADR 0027](0027-alertas-evaluacion-programada-y-deduplicacion.md)).

## Decisión

1. **Proveedor: Resend, por su API HTTP oficial** (`POST https://api.resend.com/emails`). Sin dependencia npm nueva: un `fetch` en `apps/web/src/lib/email.ts`. Razones: API simple con `Idempotency-Key`, verificación de dominio (SPF/DKIM) desde su panel, plan gratuito suficiente para unos pocos correos diarios y conector disponible para revisar envíos. Alternativas: Amazon SES (más configuración de cuenta y salida de sandbox) y SMTP de Google Workspace (contraseñas de aplicación; se evita pedir contraseñas). Cambiar de proveedor sólo toca `email.ts`.
2. **Variables sólo del servidor:** `RESEND_API_KEY` y `REPORTS_EMAIL_FROM` (remitente de un dominio verificado). Sin ellas no se envía nada y la pantalla lo dice; no se simula un envío.
3. **Programaciones en la base** (`report_subscriptions`): nombre, frecuencia, centros (o todos) y 1 a 20 correos. Sólo el admin corporativo las ve y cambia (contienen correos y llevan cifras financieras), con versión, motivo y auditoría.
4. **Un cron diario** (`/api/cron/reportes`, Vercel Cron 13:00 UTC ≈ 7:00 en CDMX, con `CRON_SECRET`). Para cada programación activa calcula su **último periodo cerrado** (diario: ayer; semanal: lunes a domingo anterior; quincenal: 1–15 o 16–fin de mes; mensual: mes anterior) y lo envía **si aún no se envió**. Así, si un día no corre, el siguiente lo recupera; un fallo se reintenta al día siguiente.
5. **Sin duplicados:** índice único parcial en `report_deliveries` (programación + periodo, vía automática, enviado) y `Idempotency-Key` en Resend. «Enviar ahora» queda en la bitácora como manual y no cuenta como el envío automático.
6. **Mismas cifras que el tablero:** el correo se arma con `corporateBoard` + `presentCorporateCard` contra el periodo anterior equivalente, incluidas las alertas de umbral. El cron lee los hechos con `report_subscription_facts`, que fija las claims del **autor** y exige que siga siendo admin corporativo.
7. **Móvil:** consulta programaciones y bitácora; crear, editar y «Enviar ahora» están en la web porque el envío sale del servidor.

## Consecuencias

- Puesta en marcha manual: cuenta de Resend, dominio verificado (registros DNS), `RESEND_API_KEY` y `REPORTS_EMAIL_FROM` en Vercel (Production) y `CRON_SECRET` si aún no existe.
- Si el autor deja de ser admin corporativo, sus programaciones fallan con un mensaje claro en la bitácora hasta que otro admin las vuelva a guardar.
- La hora es aproximada (Vercel Cron); cambiarla sólo toca `vercel.json`.
