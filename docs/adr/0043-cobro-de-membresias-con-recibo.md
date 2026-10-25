# ADR 0043 — Cobro de la venta y renovación de membresías con recibo y corte de caja

- Estado: propuesto
- Fecha: 2026-10-25

## Contexto

El alta y la renovación de una membresía sólo guardan una referencia de pago opcional (`membership_events.data.payment_reference`). No hay recibo, el dinero no entra al corte de caja y nada asegura que se cobró. Mientras tanto, el P&L ya reconoce la venta en la fecha del alta o la renovación (`private.pnl_movements`, línea `membresias`). La membresía dejó de ser forma de pago de la OS (ADR 0042), así que la membresía se cobra al venderse y sus servicios se redimen como descuento de la OS (ADR 0013).

Los recibos (ADR 0018) ya resuelven folio, formas de pago mixtas, cambio del efectivo, reverso con motivo e idempotencia, pero sólo se aplican a OS (`payment_allocations.service_order_id`). El corte de caja (ADR 0020) se calcula desde los recibos y sus formas de pago, no desde las OS.

## Decisión

1. **Cargo de membresía** (`membership_charges`): uno por alta y por renovación, con `detail_center_id`, membresía, evento, importe = precio congelado, `request_id` y estado derivado de sus recibos válidos. Inmutable, con auditoría.
2. **El recibo también cobra cargos de membresía**: `payment_allocations` admite `service_order_id` **o** `membership_charge_id` (exactamente uno). Mismo folio por centro, mismas formas de pago activas (efectivo, tarjeta, transferencia; nunca crédito B2B), mismo cambio del efectivo, sin sobrepago y mismo bloqueo de corte cerrado. El corte y la conciliación lo incluyen sin otra fuente.
3. **Pago completo al vender**: `create_membership` y `renew_membership` reciben las formas de pago y crean membresía, cargo y recibo en una sola transacción. Si el cobro no cubre el precio, no hay alta ni renovación. Los parámetros previos (`p_payment_reference`) se mantienen durante la transición.
4. **Reembolso**: `reverse_payment` de un recibo de membresía (encargado o admin, con motivo) **cancela la membresía** si no tiene redenciones válidas. Si ya se usó, el reverso se rechaza: primero se cancela la membresía con su motivo y la devolución se decide aparte.
5. **P&L sin cambios**: la venta sigue reconociéndose al alta o renovación por su precio (ADR 0021). El recibo sólo la cobra.
6. **Membresías previas**: conservan su referencia de pago; no se generan recibos retroactivos.
7. **Paridad web/móvil**: alta y renovación con captura del cobro y recibo al final, con los mismos repositorios y presentadores de `domain`. Sin cola offline.

## Consecuencias

- Migración expand → migrate → contract: primero columnas y RPC nuevas compatibles; después las apps; al final se retira la referencia de pago libre.
- Pruebas: SQL (permisos por centro, sin sobrepago, corte cuadrado, reverso y cancelación, idempotencia, actualización con membresías previas) y unitarias del dominio.
- Fuera de alcance: cobro recurrente automático (`auto_renew`, `MembershipBillingPort`).
