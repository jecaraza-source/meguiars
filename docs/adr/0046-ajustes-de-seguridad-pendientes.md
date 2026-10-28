# ADR 0046 — Ajustes de seguridad pendientes de la auditoría

- Estado: aceptado
- Fecha: 2026-10-28

## Contexto

La auditoría de seguridad de octubre (ADR 0042 a 0045) dejó hallazgos de severidad media y baja. Este ADR reúne los que se corrigen juntos.

## Decisión

1. **Bitácora del contador.** `audit_log` guarda las filas completas (`old_data`/`new_data`), con nombres y teléfonos de clientes. El contador sólo ve la bitácora de `payments`, `payment_reversals`, caja (`cash_*`), egresos (`expenses`, `expense_*`, `vendors`) y cuentas por cobrar B2B (`b2b_invoices`, `b2b_payments`). Es una lista de tablas permitidas: una tabla nueva no le queda visible por descuido. El admin sigue viendo todo. Cumple ADR 0018 («el contador no ve el nombre del cliente»).
2. **Números de prueba del asistente.** `authenticated` ya no lee la columna `bot_settings.test_numbers` (permisos por columna); sólo sale por `get_assistant_settings`, que la muestra a quien administra el asistente.
3. **Concurrencia.** `private.find_promotion` y `private.b2b_line_price` toman un candado por promoción o por convenio antes de contar usos o unidades incluidas, para que dos OS guardadas a la vez no rebasen el límite.
4. **Egresos rechazados.** `update_expense` exige poder aprobar egresos para editar uno rechazado; antes un encargado podía bajarle el importe y dejarlo aprobado.
5. **Web.**
   - `?next=` sólo acepta rutas internas sin `\` ni caracteres de control (`isSafeInternalPath` en `domain`). El navegador quita tabuladores y saltos de línea, así que `/\t/evil.com` llevaba a otro sitio después de iniciar sesión.
   - Encabezados en todas las rutas: `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy` (cámara sólo del propio sitio). Se omitió una CSP completa de scripts: requiere nonces en Next.js y no tiene un riesgo concreto que la justifique hoy.

## No se corrige

- **`request_id` buscado por organización y no por centro** en algunas RPC (`create_expense`, `create_lead`, `create_quote`, `open_cash_session`, `create_opportunity`, `upsert_b2b_account`, `register_payment`, `close_cash_session`). Para explotarlo hay que adivinar un UUID aleatorio de otro centro, y corregirlo exige reescribir ocho funciones grandes. Se revisa si el `request_id` deja de ser aleatorio.
- **Subir de nivel de tarifa B2B con OS desechables** (abrir y cancelar OS para alcanzar `min_monthly_orders`): requiere una decisión de negocio sobre qué OS cuentan para el volumen.

## Consecuencias

- Pruebas: `supabase/tests/security_followups.test.sql`, `expenses.test.sql` y `assistant.test.sql` actualizadas, y `links.test.ts` en `domain`.
