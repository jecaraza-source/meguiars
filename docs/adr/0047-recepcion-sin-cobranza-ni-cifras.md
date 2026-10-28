# ADR 0047 — Recepción sin cobranza, corte ni cifras de dinero

- Estado: aceptado
- Fecha: 2026-10-28

## Contexto

El dueño definió qué ve recepción (`operador_recepcion`): cobra en mostrador, pero no ve el corte de caja, la cobranza del centro ni indicadores financieros. En Marketing sólo ve las campañas. Hasta ahora recepción tenía `cash.read` y `payments.read` (corte, cobranza, «Cobrado hoy» y venta del día) y `marketing.read` (calendario, promociones, segmentos y el presupuesto e inversión de las campañas). En la misma revisión, Dirección quedó sólo para el admin / socio (`executive.read` en todas sus pantallas).

## Decisión

1. **Cobrar sigue igual.** Recepción conserva `payments.write` y `payments.read` (recibos de una OS o membresía, `order_payments`, `payment_receipt`, `membership_payments`) para cobrar, ver e imprimir el recibo.
2. **Cobranza del centro:** nueva capacidad `payments.ledger.read` ↔ `private.can_list_payments` (admin, encargado, contador). La exigen la pantalla Cobranza y `list_payments`, `payment_facts`, `receivable_orders`, `sales_reconciliation` y el bloque de cobros de `center_day_summary`. En Operación del día, recepción ve cuántas OS se entregaron, sin venta, por cobrar ni cobrado (`delivered_today.total` y `pending` en null).
3. **Corte de caja:** `private.can_read_cash` pasa a admin, encargado y contador. El candado de corte cerrado (`private.guard_cash_window`) es security definer y no depende de este permiso.
4. **Marketing:** calendario y promociones exigen `marketing.planning.read` (todos los que leen marketing salvo recepción); segmentos, `marketing.manage`. Presupuesto, inversión y gasto de campañas sólo con `private.can_read_campaign_money` ↔ `canSeeCampaignMoney` (gestiona marketing o lee métricas comerciales): `list_campaigns` devuelve `budget` en null y `spend` en 0, `campaign_spend_entries` y la tabla `campaign_spend` vienen vacías, y `campaigns.budget` ya no se lee directo.

## Consecuencias

- Compatible con las apps instaladas: mismas firmas y columnas. Una app anterior muestra la inversión de las campañas en $0 a recepción hasta actualizarse.
- La tabla `payments` sigue legible para recepción por RLS, porque la usa al cobrar; las vistas de la cobranza del centro son las que se restringen.
- Pruebas: `reception_visibility.test.sql`, más los ajustes de cobranza, corte, membresías y Operación del día; dominio (navegación, roles, cifras del día y de campañas).
