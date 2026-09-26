# Módulo C1 — Comercial / Membresías y fidelización

## Alcance

Motor de ingreso recurrente para planes de cuidado continuo del vehículo, con paridad web y móvil:

- **Catálogo de planes** CARE / PLUS / PREMIUM de la organización. Cada plan define:
  - precio por periodo y periodicidad (mensual, trimestral, semestral o anual);
  - vigencia de venta (desde / hasta) y días de aviso antes de vencer;
  - alcance de redención (sólo en el centro de origen o en cualquier centro);
  - restricciones (texto) y servicios incluidos con unidades por periodo.
- **Alta** por cliente y vehículo en el centro activo, con referencia de pago. Las condiciones del plan (precio, periodicidad, alcance y beneficios) se **congelan** en la membresía; cambiar el plan después no altera lo vendido.
- **Estados:** `activa`, `proxima_a_vencer`, `vencida`, `suspendida` y `cancelada`.
- **Redención desde la OS** con validación de elegibilidad, control de usos por periodo, idempotencia y trazabilidad.
- **Renovación manual**, con interfaz preparada para el pago recurrente futuro.
- **Indicadores:** activas, altas, bajas, renovaciones, MRR, uso, tasa de uso, ingreso promedio por miembro e ingreso cobrado.
- **Historial** de altas, renovaciones, suspensiones, reactivaciones, cancelaciones, redenciones y anulaciones.

**Fuera de alcance (interfaces preparadas):**

- **Cobro recurrente:** `memberships.auto_renew`, `memberships.payment_method_ref` (token del proveedor, nunca datos de tarjeta) y el puerto `MembershipBillingPort` del dominio.
- **Cuentas B2B:** siguen en su módulo; una OS B2B no redime membresías.
- **Campañas, puntos y referidos.**

## Modelo de datos (`20261002000000_memberships.sql`)

```
membership_plans 1─* membership_benefits *─1 services
       │
       └─* memberships (centro de origen, cliente, vehículo, condiciones congeladas)
               ├─* membership_redemptions *─1 service_orders / service_order_items / service_order_discounts
               └─* membership_events (historial, sólo anexar)
private.membership_counters (consecutivo MEM-000123 por organización)
```

| Tabla                     | Notas                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `membership_plans`        | Clave única por organización (inmutable), nivel (`care`, `plus`, `premium`), precio > 0, `period_months` ∈ {1, 3, 6, 12}, `redeem_scope`, `renewal_notice_days` (0–60), vigencia de venta y activo.                                                                                                          |
| `membership_benefits`     | Servicio del catálogo y `quantity_per_period` (1–99).                                                                                                                                                                                                                                                        |
| `memberships`             | Número `MEM-000001`, estado guardado (`membership_state`), snapshot del plan (`plan_code`, `plan_name`, `plan_tier`, `price`, `period_months`, `redeem_scope`, `renewal_notice_days` y `benefits` jsonb), `started_on`, `period_anchor` y `ends_on`. Un vehículo tiene a lo sumo una membresía no cancelada. |
| `membership_redemptions`  | Membresía, centro de origen y centro de la OS, línea, descuento generado, servicio (con clave y nombre congelados), cantidad, importe, periodo de uso y `request_id`. Se anulan con motivo; nunca se borran.                                                                                                 |
| `membership_events`       | Tipo, estados, monto cobrado (alta y renovación), periodo, motivo, datos (folio de la OS, referencia de pago), actor y hora. La escribe `private.log_membership_event`.                                                                                                                                      |
| `service_order_discounts` | Nueva columna `source` (`manual` o `membresia`).                                                                                                                                                                                                                                                             |

## Reglas

| Regla                | Detalle                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado efectivo      | `private.membership_status` (espejo `membershipStatus`): cancelada y suspendida mandan; si hoy > `ends_on`, **vencida**; si faltan `renewal_notice_days` días o menos, **próxima a vencer**; si no, **activa**. "Hoy" es la fecha del centro de origen.                                                                      |
| Periodos de uso      | `private.membership_period` (espejo `membershipPeriod`): bloques de `period_months` desde `period_anchor`, con el recorte de fin de mes de Postgres (31-ene + 1 mes = 28-feb). Los usos se reinician en cada periodo.                                                                                                        |
| Alta                 | Plan activo y en vigencia de venta, con al menos un servicio incluido. Inicio entre hoy y 30 días. Vehículo activo del cliente y sin otra membresía abierta. Idempotente por `request_id`. Evento `alta` con el monto y la referencia de pago.                                                                               |
| Redimir              | Membresía activa o próxima a vencer y ya iniciada; mismo cliente y vehículo que la OS; en su centro de origen o en cualquiera si el plan lo permite. El servicio de la línea debe estar incluido, con saldo en el periodo, y sin otra redención activa en la línea. OS abierta a terminada y que no sea B2B.                 |
| Efecto en la OS      | Descuento por importe = precio congelado de la línea × unidades, con `source = 'membresia'`. La OS pasa a canal `membresia` con el número como referencia. Estos descuentos **no cuentan** para el nivel de autorización de los descuentos manuales (`add_service_order_discount` reemplazada; espejo en `previewDiscount`). |
| Idempotencia         | `redeem_membership_benefit` recibe `request_id` y la `version` de la OS: un doble clic, o web y móvil, devuelven la misma redención. Las operaciones sobre una membresía se serializan con un bloqueo por membresía.                                                                                                         |
| Protección de la OS  | Una línea redimida no se quita ni baja de las unidades redimidas. El descuento de membresía sólo se anula desde la redención. Cancelar la OS anula sus redenciones y libera los usos.                                                                                                                                        |
| Renovar              | Sólo próxima a vencer o vencida, desde el centro de origen. **Antes de vencer** se agrega un periodo con las **mismas condiciones adquiridas** (precio y beneficios congelados). **Vencida:** reinicia hoy con las condiciones vigentes del plan, o de otro plan (cambio de plan). Idempotente por `request_id`.             |
| Suspender / cancelar | Encargado o admin del centro de origen, con motivo. Suspendida → no redime ni renueva; se reactiva. Cancelada es final y libera el vehículo para una nueva alta.                                                                                                                                                             |
| Auditoría            | `private.audit_row` y `require_change_reason` en planes, beneficios, membresías y redenciones, más `membership_events`. Sin `delete` para `authenticated` salvo quitar un beneficio de un plan (auditado).                                                                                                                   |

## MRR y KPIs (fórmula documentada)

Fuente única: `public.membership_metric_facts` (hechos por membresía, **sin datos personales**) y las funciones de `packages/analytics/src/memberships.ts`. Se calcula al corte `to` y dentro del rango `[from, to]`:

| KPI                          | Fórmula                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MRR**                      | Σ (precio congelado del periodo ÷ meses del periodo) de las membresías **activas o próximas a vencer** al corte. Ej.: mensual $849 → $849; trimestral $3,900 → $1,300. Suspendidas, vencidas y canceladas aportan $0. |
| Activas                      | Membresías activas o próximas a vencer al corte.                                                                                                                                                                      |
| Altas                        | Membresías con evento `alta` en el rango.                                                                                                                                                                             |
| Bajas                        | Cancelaciones en el rango + membresías que vencieron en el rango y no se renovaron al corte.                                                                                                                          |
| Renovaciones                 | Eventos `renovacion` en el rango.                                                                                                                                                                                     |
| Uso                          | Unidades redimidas (no anuladas) en el rango.                                                                                                                                                                         |
| Tasa de uso                  | Uso de las activas ÷ unidades incluidas en el rango (unidades por periodo × meses del rango ÷ meses del periodo) × 100.                                                                                               |
| Ingreso promedio por miembro | MRR ÷ activas.                                                                                                                                                                                                        |
| Ingreso cobrado              | Σ montos de altas y renovaciones en el rango.                                                                                                                                                                         |

`/comercial` (y `ComercialScreen`) muestra los últimos 30 días del centro activo o, con "Todos mis centros", el consolidado corporativo.

## Permisos

| Capacidad            | Roles                                           | Qué permite                                     |
| -------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `memberships.read`   | admin_socio, encargado, operador, comercial_b2b | ver membresías, saldo, redenciones e historial  |
| `memberships.write`  | admin_socio, encargado, operador, comercial_b2b | contratar y renovar                             |
| `memberships.manage` | admin_socio, encargado                          | suspender, reactivar y cancelar                 |
| admin corporativo    | admin_socio de la organización                  | crear y editar planes y sus servicios incluidos |
| KPIs                 | admin_socio, encargado, contador, comercial_b2b | `membership_metric_facts` sin datos personales  |

- Redimir exige además `orders.write` (el descuento se aplica en la OS).
- RLS: `private.can_use_memberships` y `private.can_manage_memberships`. Una membresía de plan "cualquier centro" también la ve quien atiende al cliente en otro centro (`private.can_see_client`); sus redenciones e historial se ven con ella, para que el saldo cuente todos los centros.
- El contador no ve membresías (datos personales), sólo los KPIs.

## RPC

| RPC                                                                         | Uso                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `upsert_membership_plan` / `set_membership_benefit`                         | Planes y servicios incluidos (admin corporativo, con motivo).       |
| `create_membership(center, request, plan, client, vehicle, starts?, pay?)`  | Alta idempotente.                                                   |
| `renew_membership(membership, request, plan?, pay?)`                        | Renovación manual (cambio de plan sólo vencida).                    |
| `set_membership_state(membership, state, reason)`                           | Suspender, reactivar o cancelar.                                    |
| `membership_balance(membership)`                                            | Saldo del periodo por servicio (una sola definición).               |
| `redeem_membership_benefit(order, version, item, membership, qty, request)` | Redención idempotente.                                              |
| `void_membership_redemption(redemption, version, reason)`                   | Anulación con motivo.                                               |
| `list_memberships(center, status?, query?)`                                 | Listado con estado efectivo y búsqueda por número, cliente o placa. |
| `membership_metric_facts(centers[], from, to)`                              | Hechos para KPIs.                                                   |

Errores: `MG002` → regla visible (sin saldo, vencida, otro centro…), `40001` → la OS cambió, `42501` → permiso, `22023` → validación.

## Pantallas

| Web                           | Móvil                    | Contenido                                                                                           |
| ----------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `/comercial`                  | `ComercialScreen`        | KPIs del centro o consolidados.                                                                     |
| `/comercial/membresias`       | `MembershipsScreen`      | Listado con búsqueda, filtro por estado y próxima renovación.                                       |
| `/comercial/membresias/nueva` | `MembershipNewScreen`    | Buscar cliente, elegir vehículo y plan (con beneficios), inicio y referencia de pago.               |
| `/comercial/membresias/[id]`  | `MembershipDetailScreen` | Estado, precio congelado, próxima renovación, saldo del periodo, acciones, redenciones e historial. |
| `/comercial/planes`, `[id]`   | `MembershipPlansScreen`  | Catálogo de planes, alta y edición, servicios incluidos.                                            |
| `/ordenes/[id]`               | `OrderDetailScreen`      | Tarjeta "Membresía": saldo, próxima renovación, redimir una línea y anular redenciones.             |

## Datos seed

- Planes: CARE ($449 mensual: 2 lavados exprés), PLUS ($849 mensual, cualquier centro: 2 lavados exprés + 1 premium) y PREMIUM ($3,900 trimestral: 3 lavados premium + 1 detallado de interiores).
- `MEM-000001` PLUS de José Pérez (activa, CDMX), `MEM-000002` CARE de María López (próxima a vencer, CDMX) y `MEM-000003` PREMIUM de Transportes del Norte (Monterrey).

## Variables de entorno

Ninguna nueva.
