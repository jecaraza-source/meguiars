# ADR 0013 — Membresías: condiciones congeladas, redención como descuento de la OS y MRR en analytics

- Estado: aceptado
- Fecha: 2026-10-02

## Contexto

Las membresías son ingreso recurrente: el cliente paga un periodo y consume servicios incluidos en cualquier momento del periodo, a veces en otro centro. Los planes cambian (precio, beneficios) y eso no debe alterar lo que ya se vendió. El consumo ocurre en la OS, que ya tiene totales, descuentos con niveles de autorización y concurrencia optimista (ADR 0011).

## Decisión

1. **Snapshot del plan en la membresía** (precio, periodicidad, alcance y beneficios en jsonb). Se refresca sólo al reiniciar una membresía vencida (o con cambio de plan); una renovación anticipada conserva las condiciones adquiridas. Se prefirió a versionar planes (más tablas y joins) y a leer el plan vigente (rompe el histórico).
2. **Estado guardado mínimo** (`activa`, `suspendida`, `cancelada`) y **estado efectivo derivado** de las fechas en una función SQL con espejo en el dominio. Así "próxima a vencer" y "vencida" nunca quedan desfasados por falta de un job.
3. **Periodos de uso anclados**: bloques de `period_months` desde `period_anchor`, con el recorte de fin de mes de Postgres. La redención guarda su `period_start`; el saldo cuenta redenciones no anuladas de ese periodo.
4. **La redención es un descuento de la OS** con `source = 'membresia'`, en lugar de cambiar el precio de la línea: los precios siguen congelados (ADR 0009), los totales los sigue calculando `recalc_service_order` y el margen refleja el costo real. Estos descuentos no cuentan para el nivel de autorización de los descuentos manuales.
5. **Idempotencia y serialización**: `request_id` en alta, renovación y redención; bloqueo por membresía (`pg_advisory_xact_lock`) para que dos centros no consuman el mismo saldo a la vez, sin exigir permiso de edición sobre la membresía a quien redime en otro centro.
6. **KPIs con una sola definición en `@meguiars/analytics`** sobre hechos sin datos personales (`membership_metric_facts`, security definer con chequeo de rol). El MRR mensualiza el precio congelado de las membresías activas o próximas a vencer.
7. **Renovación manual** con interfaz para el cobro recurrente (`auto_renew`, `payment_method_ref`, `MembershipBillingPort`), sin integrar un proveedor de pagos todavía.

## Consecuencias

- Cambiar el precio de un plan afecta nuevas altas y reinicios, no las renovaciones anticipadas. Es deliberado y está documentado para ventas.
- Un cambio de plan antes de vencer requiere cancelar y dar de alta el nuevo plan (o esperar al vencimiento).
- La tasa de uso aproxima las unidades incluidas en el rango con meses promedio (30.4375 días).
- `add_service_order_discount` se reemplazó en esta migración (misma firma) para excluir los descuentos de membresía del porcentaje acumulado.
