# Módulo O4 — Operación / Orden de Servicio digital (núcleo)

## Alcance

La Orden de Servicio (OS) es el eje operacional: une la recepción (cita o walk-in), la ejecución (bahía, técnico y tiempos), el cobro, los costos, las recomendaciones y la próxima visita.

- **Alta:** desde una cita recibida (sin recapturar cliente, vehículo, bahía, técnico ni servicios) o como walk-in.
- **Folio:** legible y único por centro (`CDMX-01-000123`), consecutivo sin huecos aunque web y móvil abran OS al mismo tiempo.
- **Snapshot:** nombre, teléfono y email del cliente; marca, modelo, año y placa del vehículo; kilometraje. Si después se edita el cliente, la OS conserva lo que se recibió.
- **Líneas de servicio y producto:** precio, costo, duración, clave y motor se congelan al venderse (ADR 0009). Un producto es un servicio del catálogo con motor `producto_complemento`.
- **Descuentos:** por línea o sobre la OS, siempre con motivo. El nivel de autorización depende del **% acumulado** de la OS.
- **Ejecución:** bahía y técnico, tiempo estimado (suma de líneas), hora prometida y tiempo real trabajado (sin pausas).
- **Estatus controlados:** `abierta`, `autorizada`, `en_proceso`, `pausada`, `terminada`, `entregada` y `cancelada`, con historial auditado.
- **Diagnóstico, observaciones, recomendaciones y próxima visita** (fecha y servicio recomendado).
- **Reglas de autorización y entrega por canal** (B2C, membresía y B2B).
- **Cobro mínimo:** registrar pagos hasta cubrir el saldo, como interfaz para el módulo de pagos.

**Fuera de alcance (interfaces preparadas):**

- **Pagos detallados, pagos parciales con conciliación y reembolsos:** hoy `paid_amount` y `record_service_order_payment`.
- **Membresías y redenciones:** hoy `channel = membresia` y `channel_reference` (número de membresía).
- **Cuentas B2B y facturación:** hoy `b2b_account_id` (sin FK todavía) y `channel_reference` (orden de compra).
- **Consumo de inventario y evidencias (fotos):** se vincularán con `service_order_items.id` y `service_orders.id`.

## Modelo de datos (`20260930000000_service_orders.sql`)

```
detail_centers 1─* service_orders *─1 clients / vehicles (O1)
                        │ 0..1 appointments (O3; appointments.service_order_id ↔ service_orders.appointment_id)
                        ├─* service_order_items        (precio congelado del catálogo O2)
                        ├─* service_order_discounts    (por línea o por OS; se anulan, no se borran)
                        └─* service_order_status_history
private.service_order_counters (consecutivo de folio por centro)
```

| Tabla                          | Notas                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_orders`               | Centro, folio, canal y referencia, estatus, `version`, snapshot, recursos, textos operativos, próxima visita, totales (`subtotal`, `discount_total`, `total`, `cost_total`), `paid_amount` y tiempos. |
| `service_order_items`          | `kind` (servicio/producto), datos congelados, `quantity` (1–99), `line_subtotal` (columna generada) y `line_discount`.                                                                                |
| `service_order_discounts`      | `kind` (`percent`/`amount`), `value`, `amount` aplicado, `reason`, `authorization_level`, `authorized_by` y anulación (`voided_at`, `void_reason`).                                                   |
| `service_order_status_history` | `from_status → to_status`, motivo, actor y fecha. Lo escribe un trigger; nadie lo escribe directamente.                                                                                               |

**Integridad en la base:**

- FKs compuestas por organización y centro (cliente, vehículo, cita, bahía, técnico, servicio recomendado).
- Un trigger impide cambiar folio, centro, cliente, vehículo, snapshot o llave de idempotencia; otro impide cambiar precio, costo, duración o motor de una línea (**precios congelados**).
- `check (total = subtotal − discount_total and total ≥ 0)`.
- Sin borrado físico de OS ni de descuentos.

## Totales (una sola definición)

`private.recalc_service_order` es la fuente de verdad. `computeOrderTotals` en `packages/domain/src/orders/totals.ts` es su espejo exacto (centavos, redondeo `round(numeric)`) para vistas previas. Las pruebas SQL y unitarias usan **el mismo ejemplo**:

1. **Línea:** subtotal = cantidad × precio congelado. Los descuentos de la línea (porcentaje sobre su subtotal o importe) se topan al subtotal.
2. **OS:** base = subtotal − descuentos por línea. Los descuentos de la OS (porcentaje sobre la base o importe) se topan a la base.
3. **Total** = subtotal − descuentos. **Costo** = Σ cantidad × costo congelado. **Margen** = `standardMargin(total, costo)`, la misma definición del catálogo. **Saldo** = total − cobrado.

Importes en MXN con IVA incluido. El desglose de IVA llega con facturación.

## Reglas

| Regla              | Detalle                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transiciones       | `abierta → autorizada \| cancelada`, `autorizada → en_proceso \| cancelada`, `en_proceso → pausada \| terminada`, `pausada → en_proceso \| cancelada`, `terminada → entregada`. SQL y dominio; `schema-parity.test.ts` las compara.                               |
| Motivo obligatorio | Pausar, cancelar, descuentos, anular descuento y cambiar líneas después de autorizar.                                                                                                                                                                             |
| Autorizar          | Al menos una línea. Membresía exige número de membresía; B2B, orden de compra. Guarda quién, cuándo y el **total autorizado**.                                                                                                                                    |
| Adicionales        | Después de autorizar, agregar o cambiar líneas exige motivo (p. ej., "cliente autorizó") y actualiza el total autorizado. Una OS terminada ya no cambia sus líneas.                                                                                               |
| Entregar           | **B2C y membresía:** saldo cobrado completo (`paid_amount ≥ total`). **B2B:** con orden de compra, sin cobro (se factura a la cuenta).                                                                                                                            |
| Cancelar           | Abierta: cualquier operador. Autorizada o pausada: encargado o admin. Nunca con cobros registrados (el reembolso llega con pagos). Una OS en proceso se pausa antes de cancelar.                                                                                  |
| Descuentos         | Nivel exigido por el % acumulado de la OS: **operador ≤ 10 %**, **encargado ≤ 30 %**, **admin > 30 %** (`DISCOUNT_LEVEL_LIMITS`, con paridad SQL). Un descuento no excede el importe pendiente ni deja saldo a favor. Evento `service_order.discount_authorized`. |
| Cobro              | OS autorizada y no entregada; nunca más que el saldo; formas: efectivo, tarjeta, transferencia u otro. Evento `service_order.payment_recorded` con forma y referencia.                                                                                            |
| Tiempo real        | `worked_minutes` acumula los tramos en proceso; la pausa no cuenta.                                                                                                                                                                                               |
| Cita               | La OS se abre con la cita recibida o en servicio; una cita tiene a lo sumo una OS. Al iniciar la OS la cita pasa a "en servicio"; al terminar, a "terminada" (libera la bahía); al entregar, a "entregada".                                                       |
| Idempotencia       | `request_id`: el mismo formulario enviado dos veces, o desde web y móvil, abre una sola OS.                                                                                                                                                                       |
| Concurrencia       | Cada edición envía la `version` leída. La RPC bloquea la fila (`for update`) y, si la versión cambió, responde `40001`. Web y móvil muestran "La OS cambió en otro dispositivo" y recargan la versión vigente.                                                    |

## Permisos

| Capacidad       | Roles                            | Qué permite                                              |
| --------------- | -------------------------------- | -------------------------------------------------------- |
| `orders.read`   | admin_socio, encargado, operador | ver las OS del centro                                    |
| `orders.write`  | admin_socio, encargado, operador | abrir, editar, avanzar, descontar (según nivel) y cobrar |
| `orders.manage` | admin_socio, encargado           | cancelar una OS autorizada o pausada                     |

- El contador y el comercial B2B no ven OS: el snapshot tiene datos personales. Los KPIs financieros consolidados llegarán por RPC agregadas.
- RLS: `private.can_use_orders`, `private.can_manage_orders` y `private.discount_level_of`. Las escrituras directas fallan (`23514` sin motivo, `42501` borrado o historial).

## RPC

| RPC                                                                  | Uso                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `create_service_order`                                               | Walk-in con líneas `[{service_id, quantity}]`, canal, recursos y recepción.    |
| `create_service_order_from_appointment`                              | Desde la cita, con canal, referencia y kilometraje.                            |
| `set_service_order_item(order, version, service, quantity, reason?)` | Agregar o cambiar cantidad (0 = quitar).                                       |
| `add_service_order_discount` / `void_service_order_discount`         | Descuento con nivel / anulación con motivo.                                    |
| `set_service_order_status(order, version, status, reason?)`          | Transición con reglas por canal (`MG002` si falta algo).                       |
| `update_service_order_details`                                       | Canal (sólo abierta), recursos, textos, próxima visita, kilometraje y promesa. |
| `record_service_order_payment`                                       | Cobro (interfaz mínima).                                                       |
| `list_service_orders(center, status?, query?)`                       | Listado con búsqueda por folio, cliente o placa.                               |

Errores: `40001` → conflicto (versión), `MG002` → regla de negocio visible, `42501` → permiso, `22023` → validación.

## Pantallas

| Web              | Móvil                     | Contenido                                                                                                                                     |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ordenes`       | `OrdersScreen`            | Listado con búsqueda y filtro por estatus; saldo pendiente.                                                                                   |
| `/ordenes/nueva` | `OrderNewScreen`          | Walk-in: buscar cliente, vehículo, canal, cantidades por servicio o producto, bahía, técnico, kilometraje, promesa y observaciones.           |
| `/ordenes/[id]`  | `OrderDetailScreen`       | KPIs (total, saldo, margen y tiempo), estatus con bloqueos visibles, líneas, descuentos con vista previa del nivel, cobro, datos e historial. |
| `/agenda/[id]`   | `AppointmentDetailScreen` | "Abrir OS" en citas recibidas o "Ver OS".                                                                                                     |

## Datos seed

- `CDMX-01-000001`: walk-in en proceso (detallado de interiores y aromatizante).
- `CDMX-01-000002`: abierta con 10 % en el pulido.
- `MTY-01-000001`: B2B autorizada con la orden de compra `OC-5521`, al precio propio de Monterrey.

## Variables de entorno

Ninguna nueva.

## Pruebas

- **SQL** (`supabase/tests/service_orders.test.sql`), 68 aserciones: folio y snapshot; totales; precios congelados ante cambios del catálogo; idempotencia; versión vieja; escrituras directas y borrado bloqueados; precio de línea inmutable; descuentos por nivel (operador, encargado, admin), tope y anulación; auditoría; transiciones; motivos; adicionales; tiempo real; reglas B2C, B2B y membresía; cobros; cancelación por rol y con cobros; OS desde cita y sincronía de la cita; listado; RLS entre centros y contador; folios por centro.
- **Concurrencia real** (`scripts/test-db.sh`): 8 sesiones de Postgres abren OS a la vez (folios únicos y consecutivos) y dos sesiones editan con la misma versión (sólo una se aplica).
- **Unitarias:** transiciones, niveles, totales con el ejemplo de SQL, vista previa, margen, saldo, bloqueos por canal y presentadores (`domain/src/orders/orders.test.ts`); validación y paridad web/móvil (`validation/src/orders.test.ts`); adaptador (`supabase/src/repositories/orders.test.ts`); paridad de enums, transiciones, límites de descuento y formas de pago; navegación.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 12 comprobaciones: listado, alta walk-in, niveles de descuento, adicional con motivo, flujo de estatus, bloqueo por saldo, cobro y entrega, versión vieja, OS desde cita B2B, búsqueda, vista móvil y contador sin acceso.

## Pendientes

- **Entrega a crédito B2C autorizada por el encargado** (hoy sólo B2B se entrega sin cobro).
- **Módulo de pagos:** tabla `payments` con FK a la OS, pagos parciales, reembolsos y cancelación con reembolso.
- **Membresías:** `membership_redemptions` ligadas a `service_order_items` para cubrir líneas.
- **Evidencias** (fotos de recepción y entrega) e **inventario** (`inventory_consumptions` por línea).
- **Historial del cliente (O1)** con las OS y su próxima visita; recordatorios.
- **KPIs** (ticket promedio, margen real por motor) en `packages/analytics` a partir de OS entregadas.
