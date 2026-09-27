# ADR 0018 — Cobranza: recibos sobre la OS, sin sobrepago y sin cola offline

- Estado: aceptado
- Fecha: 2026-10-07

## Contexto

La OS (O4) registraba el cobro sólo como `paid_amount` con `record_service_order_payment`. AF1 necesita:

- cobros parciales y mixtos con recibo interno;
- membresía y crédito B2B como formas de pago;
- reversos con permiso y traza;
- corte de caja y conciliación contra las ventas.

Todo ello sin contar dos veces los ingresos que ya representan la OS y el estado de cuenta B2B.

## Decisión

1. **La OS es la venta; el recibo es cobranza.**
   - `payments` / `payment_tenders` / `payment_allocations` sólo registran cómo se cobró el total de la OS.
   - `service_orders.paid_amount` se deriva: Σ asignaciones de recibos válidos, recalculado por `private.sync_order_paid`. Un trigger impide escribirlo por otra vía.
   - `payment_status` es una columna generada. Los reportes de venta leen las OS; los de caja, los recibos.
2. **Sin sobrepago, con una excepción explícita.** El efectivo admite un recibido mayor y se guarda el cambio; el cambio no es cobranza. Cualquier otro excedente se rechaza.
3. **Formas de pago sin efectivo.**
   - Membresía y crédito B2B son liquidaciones (`collects_cash = false`): saldan la OS pero no entran a caja.
   - Una OS a cuenta B2B sólo se liquida a crédito, porque su cobranza real vive en el estado de cuenta de C3; el crédito B2B no se acepta en otras OS.
4. **Nada se edita ni se borra.**
   - Formas de pago, asignaciones y reversos son inmutables.
   - El recibo sólo pasa de `valido` a `revertido`, con motivo, actor y fecha.
   - Cancelar una OS exige revertir antes sus cobros (reembolso).
5. **Idempotencia en lugar de cola offline.**
   - Las mutaciones financieras requieren conexión.
   - Cada cobro lleva un `request_id` único, así un reintento (doble toque o red intermitente) devuelve el mismo recibo; con la versión de la OS, dos dispositivos no cobran el mismo saldo.
6. **Compatibilidad.**
   - `record_service_order_payment` conserva su firma y crea un recibo.
   - La migración convierte los cobros previos en recibos a partir de los eventos `service_order.payment_recorded`, y uno `otro` por la diferencia.
7. **Privacidad del contador.** Consulta cobranza (`payments.read`) sin el nombre del cliente y sigue siendo de sólo lectura.

## Consecuencias

- Descuentos, líneas y cancelación siguen protegidos por el saldo: con cobros, el total no baja de lo cobrado.
- El reverso es por recibo completo. Un reembolso parcial se hace revirtiendo y volviendo a cobrar lo correcto.
- Los reportes de caja distinguen "en caja y banco" de "liquidado sin efectivo".
- No hay cobro sin conexión. Si el negocio lo requiere, el diseño de idempotencia permite agregar una cola después sin cambiar la base.
