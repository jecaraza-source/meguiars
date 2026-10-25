# ADR 0043 — Cobro de la venta y renovación de membresías con recibo y corte de caja

- Estado: aceptado
- Fecha: 2026-10-25

## Contexto

El alta y la renovación de una membresía sólo guardan una referencia de pago opcional (`membership_events.data.payment_reference`). No hay recibo, el dinero no entra al corte de caja y nada asegura que se cobró. Mientras tanto, el P&L ya reconoce la venta en la fecha del alta o la renovación (`private.pnl_movements`, línea `membresias`). La membresía dejó de ser forma de pago de la OS (ADR 0042), así que la membresía se cobra al venderse y sus servicios se redimen como descuento de la OS (ADR 0013).

Los recibos (ADR 0018) ya resuelven folio, formas de pago mixtas, cambio del efectivo, reverso con motivo e idempotencia, pero sólo se aplican a OS (`payment_allocations.service_order_id`). El corte de caja (ADR 0020) se calcula desde los recibos y sus formas de pago, no desde las OS.

## Decisión

1. **El cargo es el evento de alta o renovación** (`membership_events`, con importe = precio congelado y periodo). Se prefirió a una tabla `membership_charges`: el evento ya tiene centro, importe, periodo e idempotencia.
2. **El recibo también cobra cargos de membresía**: `payment_allocations` admite `service_order_id` **o** `membership_event_id` (exactamente uno). Mismo folio por centro, mismas formas de pago activas (efectivo, tarjeta, transferencia; nunca crédito B2B), mismo cambio del efectivo y mismo candado de corte cerrado. El corte y la conciliación lo incluyen sin otra fuente, porque se calculan desde los recibos.
3. **Pago completo al vender**: `sell_membership` y `renew_membership_paid` crean la membresía (o la renuevan) y su recibo en una sola transacción (`private.create_membership_payment`). Si el cobro no cubre exactamente el precio, no hay alta ni renovación. Exigen permiso de cobro (`payments.write`) además de vender membresías: el comercial B2B ya no vende desde las apps (`canSellMemberships`).
4. **Reembolso**: `reverse_payment` de un recibo de membresía (encargado o admin, con motivo) **cancela la membresía** si no tiene redenciones válidas en el periodo cobrado. Si ya se usó, el reverso se rechaza (MG002) hasta que se cancele con su motivo; la devolución se decide aparte.
5. **P&L**: la venta se sigue reconociendo al alta o renovación por su precio (ADR 0021). Una venta reembolsada (todos sus recibos revertidos) deja de contar (`private.membership_event_refunded` en `private.pnl_movements`).
6. **Membresías previas**: conservan su referencia de pago; no se generan recibos retroactivos y siguen contando como venta.
7. **Paridad web/móvil**: alta y renovación con captura del cobro, recibos de la membresía con reembolso y recibo impreso con la membresía cobrada. Mismos repositorios (`sell`, `renewPaid`, `payments`), reglas (`summarizeMembershipTenders`) y presentadores (`presentMembershipPayment`) de `domain`. Sin cola offline.

## Consecuencias

- Expand → migrate → contract: `create_membership` y `renew_membership` (sin cobro) se conservan para las apps ya instaladas. Cuando todas las versiones usen el cobro, una migración posterior las retira o las limita a `service_role`.
- Pruebas: SQL (permisos por centro, sin sobrepago, corte cuadrado, reverso y cancelación, idempotencia, actualización con membresías previas) y unitarias del dominio.
- Fuera de alcance: cobro recurrente automático (`auto_renew`, `MembershipBillingPort`).
