# Módulo AF1 — Administración y Finanzas / Ingresos y cobranza (POS)

## Alcance

Registrar y conciliar los ingresos B2C, de membresía y B2B ligados a la Orden de Servicio (OS), con paridad web y móvil.

- **Cobro total o parcial por OS**, con **pagos mixtos** (varias formas de pago en un recibo).
- **Formas de pago:** efectivo, tarjeta, transferencia, membresía y crédito B2B.
- **Estado de pago de la OS** (`pendiente`, `parcial`, `pagada`) según el saldo, calculado por la base.
- **Descuentos ya autorizados reflejados:** se cobra el total de la OS, que ya descuenta los descuentos autorizados y las redenciones de membresía.
- **Recibo interno** por centro (folio `CDMX-01-R-000001`). **No es un CFDI.**
- **Reverso** (reembolso o captura errónea) sólo con permiso, motivo y auditoría.
- **Corte de caja, por cobrar y conciliación** contra las ventas (OS entregadas).

**La venta es la OS; los recibos sólo representan su cobranza.** Así nada se cuenta dos veces: los ingresos por venta se leen de las OS y la cobranza, de los recibos.

Decisiones en [ADR 0018](../adr/0018-cobranza-recibos-sobre-la-os.md).

## Modelo de datos (`20261007000000_payments.sql`)

```
payment_methods (catálogo)
payments (recibo, centro) ─< payment_tenders (forma de pago) ─ payment_methods
payments ─< payment_allocations >─ service_orders           (hoy una OS por recibo)
payments ─ payment_reversals (0..1, inmutable)
service_orders.paid_amount = Σ asignaciones de recibos válidos; payment_status (generada)
```

| Tabla                 | Notas                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment_methods`     | `kind` (efectivo, electrónico, beneficio, crédito), `collects_cash` (entra a caja o banco), `requires_reference` (transferencia), `allows_change` (sólo efectivo). `otro` existe inactivo, sólo para cobros previos a este módulo. |
| `payments`            | Recibo: folio por centro, cliente, importe (Σ formas de pago), efectivo recibido y cambio, estado (`valido` / `revertido`), quién y cuándo, `request_id` único (idempotencia). Sólo cambia `valido → revertido`; no se borra.      |
| `payment_tenders`     | Forma de pago, importe y referencia. `membership_id` es obligatorio con membresía y `b2b_account_id` con crédito B2B. Inmutable.                                                                                                   |
| `payment_allocations` | A qué OS se aplica el recibo y cuánto. Inmutable. Permite en el futuro repartir un recibo entre varias OS.                                                                                                                         |
| `payment_reversals`   | Motivo (3–500), quién, cuándo e importe. Uno por recibo. Inmutable.                                                                                                                                                                |
| `service_orders` (+)  | `payment_status` generada: `pagada` si `paid_amount ≥ total`, `parcial` si hay algo cobrado, `pendiente` si no. `paid_amount` sólo lo escribe la cobranza (trigger `private.guard_paid_amount`).                                   |

Todas con RLS de sólo lectura; las escrituras van por RPC. `payments` y `payment_reversals` llevan `audit_row` (con motivo) y el cobro emite además el evento `service_order.payment_recorded`.

## Reglas

| Regla                  | Detalle                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuándo se cobra        | OS autorizada, en proceso, pausada, terminada o entregada (B2B entrega con saldo). Nunca abierta ni cancelada (22023).                                                                         |
| Sin sobrepago          | Σ formas de pago ≤ saldo (22023). La **única excepción explícita** es el efectivo: el recibido puede ser mayor y se registra el cambio (`cash_received − efectivo`). El cambio no es cobranza. |
| Efectivo recibido      | Sólo si hay efectivo y debe cubrirlo (22023).                                                                                                                                                  |
| Referencia             | Obligatoria en transferencia (22023).                                                                                                                                                          |
| Membresía              | Sólo con una membresía vigente del cliente de la OS (activa o próxima a vencer) (MG002). No entra a caja.                                                                                      |
| Crédito B2B            | Una OS a cuenta B2B **sólo** se liquida a crédito de la cuenta, y el crédito B2B sólo existe para esas OS (MG002). Evita contar dos veces lo que ya está en el estado de cuenta B2B.           |
| Concurrencia           | Versión de la OS (40001). Idempotente por `request_id`: un reintento (doble toque, web y móvil) devuelve el mismo recibo.                                                                      |
| Reverso                | Recibo completo, sólo encargado o admin (42501), con motivo. El recibo queda `revertido` con su traza y el saldo vuelve a la OS. Idempotente.                                                  |
| Cancelar una OS        | Sólo sin cobros válidos: primero se revierten (reembolso).                                                                                                                                     |
| Entregar B2C/membresía | Exige `pagada` (sin cambio respecto a O4).                                                                                                                                                     |
| Sin conexión           | **Las mutaciones financieras requieren conexión.** No hay cola offline: la app muestra "Los cobros requieren conexión" y el `request_id` hace seguro el reintento.                             |

Invariante verificado por las pruebas: para toda OS, `paid_amount = Σ asignaciones de recibos válidos`, y la suma de pagos válidos del corte es igual al saldo cobrado de las OS.

## Indicadores (`@meguiars/analytics`)

Fuente: `payment_facts` (por centro, día del centro y forma de pago; sin datos personales) y `sales_reconciliation`.

| KPI                         | Fórmula                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `payments.collected`        | Σ formas de pago de recibos válidos del periodo.                                    |
| `payments.cash_in`          | Cobrado válido en efectivo, tarjeta y transferencia (el cambio ya está descontado). |
| `payments.non_cash_settled` | Cobrado válido con membresía o crédito B2B.                                         |
| `payments.reversed`         | Σ de recibos del periodo que quedaron revertidos (se cuentan en el día del recibo). |
| `payments.change_given`     | Σ cambio entregado en recibos válidos.                                              |
| `payments.collection_rate`  | Cobrado aplicado a las OS entregadas del periodo ÷ total de esas OS × 100.          |

Además: `paymentsByMethod` (desglose y participación) y `consolidateReconciliation` (varios centros).

## Permisos

| Capacidad          | Roles                                 | Espejo en SQL               |
| ------------------ | ------------------------------------- | --------------------------- |
| `payments.read`    | admin, encargado, recepción, contador | `private.can_read_payments` |
| `payments.write`   | admin, encargado, recepción           | `private.can_use_orders`    |
| `payments.reverse` | admin, encargado                      | `private.can_manage_orders` |

El **contador** consulta corte, recibos y por cobrar, pero sigue de sólo lectura y **sin el nombre del cliente** (la base lo devuelve vacío si no puede leer clientes). El comercial B2B no ve cobranza.

## RPC

| RPC                            | Uso                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `register_payment`             | Cobro de una OS: formas de pago (jsonb), efectivo recibido, notas; versión y solicitud. |
| `reverse_payment`              | Reverso de un recibo con motivo.                                                        |
| `record_service_order_payment` | Interfaz de O4, misma firma: crea un recibo con una forma de pago.                      |
| `order_payments`               | Recibos de una OS con formas de pago y reverso.                                         |
| `payment_receipt`              | Recibo interno completo (jsonb).                                                        |
| `list_payments`                | Recibos de los centros en un rango (fecha del centro).                                  |
| `payment_facts`                | Hechos del corte de caja.                                                               |
| `receivable_orders`            | OS con saldo.                                                                           |
| `sales_reconciliation`         | Ventas (OS entregadas) contra lo cobrado, y cobranza del rango.                         |

## Pantallas

| Web                               | Móvil                                     | Contenido                                                                                                       |
| --------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/ordenes/[id]` (tarjeta Cobro)   | `OrderDetailScreen` → `OrderPaymentsCard` | Estado de pago, pago mixto con vista previa (cambio y saldo resultante), recibos y reverso.                     |
| `/finanzas/cobranza`              | `CashScreen`                              | Corte de caja (hoy, 7 o 30 días; centro activo o todos), por forma de pago, conciliación, recibos y por cobrar. |
| `/finanzas/cobranza/recibos/[id]` | `ReceiptScreen`                           | Recibo interno; web lo imprime y móvil lo comparte como texto. Reverso para encargado o admin.                  |

Estados de carga, vacío, error y sin permiso en todas. Los textos viven en `paymentsCopy` (compartido).

## Migración de cobros previos

La migración convierte lo cobrado en O4 (`paid_amount`) en recibos:

1. un recibo por cada evento `service_order.payment_recorded`, con su forma de pago, referencia y fecha;
2. uno `otro` por la diferencia que no expliquen los eventos.

El cobrado de cada OS no cambia (prueba de actualización `supabase/tests/upgrade/20261007000000_payments.*`). En producción no había cobros, así que el paso no hace nada.

## Datos seed

La OS en proceso de CDMX tiene un anticipo mixto (efectivo $500 con $600 recibidos y tarjeta $500): queda parcial y aparece en por cobrar.

## Pruebas

- **SQL** (`supabase/tests/payments.test.sql`), 41 aserciones: catálogo; OS abierta; descuento autorizado reflejado; parcial con cambio; sobrepago, referencia, efectivo insuficiente y forma inválida; regla B2B; versión vieja; mixto con membresía; idempotencia; OS pagada; membresía sin vigencia; interfaz O4; reverso (permiso, motivo, traza, saldo, idempotencia); cancelación tras reembolso; inmutabilidad; auditoría; entrega; crédito B2B; contador sin nombre del cliente; aislamiento entre centros; corte; conciliación; por cobrar.
- **Actualización:** cobros previos migrados a recibos.
- **Unitarias:** reglas y vista previa (dominio), validación, KPIs y repositorio.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 10 comprobaciones: estado pendiente, anticipo con cambio, sobrepago, mixto con referencia, recibo "no es CFDI", reverso del encargado, corte de caja, contador sin datos personales, comercial sin acceso y entrega tras cobrar el saldo.

## Variables de entorno

Ninguna nueva.

## Pendientes

- Cobranza del estado de cuenta B2B (el crédito B2B se liquida en la OS; los pagos de la cuenta siguen en C3).
- Repartir un recibo entre varias OS (el modelo lo permite; la UI cobra una OS a la vez).
- Reverso parcial (hoy es por recibo completo).
- ~~Apertura y cierre de caja por turno con arqueo~~: [Corte de caja](corte-caja.md) (AF3).
- CFDI (fuera de alcance).
