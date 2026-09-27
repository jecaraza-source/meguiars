# Módulo C3 — Comercial / B2B: empresas, convenios, tarifas y vehículos

## Alcance

Operación de cuentas empresariales con paridad web y móvil:

- **Cuenta:** empresa ligada a un cliente de tipo empresa (su flotilla está en Clientes y vehículos), razón social, RFC, régimen fiscal, CP fiscal y email de facturación (opcionales), estatus (`activa`, `suspendida`, `baja`) y centro gestor.
- **Contactos** con contacto principal.
- **Convenios:** vigencia, centros habilitados, modelo de cobro, condición de pago (días), límite de crédito, cuota y servicios incluidos, notas.
- **Tarifas:** precio fijo o % sobre lista por servicio (o para todos), "incluido" en paquete / iguala y escalones por volumen mensual.
- **Vehículos autorizados** (o cualquier vehículo de la flotilla, según el convenio).
- **OS a cuenta B2B** con la tarifa convenida aplicada en el servidor, orden de compra y evidencias de la OS (módulo de ejecución).
- **Estado de cuenta:** consumo acumulado, por facturar, por cobrar, vencido, OS en curso y crédito disponible; cortes de facturación y pagos.
- **Rentabilidad** por cuenta y centro (y consolidada).

Decisiones en [ADR 0015](../adr/0015-b2b-tarifa-convenida-en-la-base.md).

**Fuera de alcance (interfaces preparadas):** CFDI (los cortes guardan la referencia del CFDI emitido fuera; son la base de un export / API), portal de clientes B2B, aprobación de OS por el cliente.

## Modelo de datos (`20261004000000_b2b.sql`)

```
clients (company) 1─1 b2b_accounts ─* b2b_contacts
                        │         ─* b2b_vehicles *─1 vehicles (flotilla del cliente)
                        │         ─* b2b_invoices ─* b2b_payments
                        └─* b2b_agreements ─* b2b_agreement_centers *─1 detail_centers
                                         └─* b2b_price_rules *─1 services (o todos)
service_orders.b2b_account_id / b2b_agreement_id / b2b_invoice_id
service_order_items.price_source = 'convenio' + b2b_price_rule_id + list_unit_price
```

| Modelo de cobro     | Cómo cobra                                                                                | Configuración                                         |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Tarifa por vehículo | Cada servicio de cada vehículo a la tarifa convenida.                                     | Reglas de precio fijo o % (por servicio o general).   |
| Volumen mensual     | Tarifas escalonadas por el número de OS de la cuenta en el mes (incluida la actual).      | Reglas con "desde N OS en el mes".                    |
| Paquete             | Cuota única; N servicios incluidos durante la vigencia (precio 0); el excedente a tarifa. | Cuota, servicios incluidos y reglas "incluido".       |
| Iguala              | Cuota mensual; N servicios incluidos por mes (precio 0); el excedente a tarifa.           | Cuota mensual, incluidos por mes y reglas "incluido". |

## Reglas

| Regla               | Detalle                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Convenio aplicable  | Estado efectivo (`private.b2b_agreement_state` ↔ `agreementState`): suspendido y cancelado mandan; antes del inicio, programado; después del fin, **vencido**; si no, vigente. Sólo un convenio **vigente**, habilitado en el centro, de una cuenta activa, se aplica.   |
| Sin traslape        | Un convenio activo por cuenta y fecha (restricción de exclusión).                                                                                                                                                                                                        |
| Tarifa en la base   | `private.put_service_order_item` → `private.b2b_line_price`: regla del servicio sobre la general; "incluido" mientras queden unidades del periodo; escalón de volumen más alto alcanzado. La línea queda con `price_source = 'convenio'`, la regla y el precio de lista. |
| Convenio vencido    | No se abre OS a cuenta ("El convenio … venció el …") y las líneas nuevas de una OS existente van a precio de lista; las vendidas conservan su tarifa.                                                                                                                    |
| Vehículo            | De la flotilla del cliente, activo y, si el convenio es "lista", autorizado en `b2b_vehicles`.                                                                                                                                                                           |
| Operador sin tarifa | No lee ni edita tarifas; precio congelado por trigger; descuentos manuales en OS con convenio sólo encargado o admin; la cuenta de una OS sólo cambia por RPC B2B; una OS a cuenta conserva el canal B2B.                                                                |
| Límite de crédito   | Exposición = por facturar + por cobrar + OS en curso. Abrir una OS que la deje sobre el límite falla (`MG002`).                                                                                                                                                          |
| Cuotas              | `private.b2b_fee_accrued` ↔ `agreementFees`: paquete una vez al iniciar; iguala una por mes iniciado (recorte de fin de mes). Cancelar recorta la vigencia a hoy.                                                                                                        |
| Estado de cuenta    | Consumo = OS entregadas + cuotas devengadas; por facturar = OS entregadas sin corte + cuotas sin facturar; por cobrar = cortes emitidos − pagos; vencido = cortes con fecha de pago pasada − pagos.                                                                      |
| Corte / pago        | Corte: OS entregadas de la cuenta sin corte y cuota devengada pendiente; vence según la condición de pago. Pago ≤ saldo por cobrar. Anular un corte (sin pagos) libera sus OS. Todo con `request_id` e idempotente.                                                      |
| Auditoría           | `private.audit_row` + `require_change_reason` en todas las tablas B2B.                                                                                                                                                                                                   |

## Rentabilidad (`@meguiars/analytics`)

| KPI           | Fórmula                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| Ingreso B2B   | Σ total de OS B2B terminadas o entregadas en el rango + cuotas devengadas en el rango. |
| Costo directo | Σ costo directo congelado de esas OS.                                                  |
| Margen        | Ingreso − costo; % = margen ÷ ingreso × 100.                                           |

Las cuotas se asignan al centro gestor de la cuenta; las OS, a su centro. `b2bProfitability` agrega por cuenta y centro y consolida la cuenta cuando opera en varios centros.

## Permisos

| Capacidad      | Roles                                           | Qué permite                                                                    |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `b2b.read`     | admin_socio, encargado, comercial_b2b, contador | Cuentas, convenios, tarifas, estado de cuenta, OS de la cuenta y rentabilidad. |
| `b2b.write`    | admin_socio, comercial_b2b                      | Cuentas, contactos, convenios, tarifas y vehículos (en el **centro gestor**).  |
| `b2b.billing`  | admin_socio, comercial_b2b                      | Cortes de facturación y pagos (en el centro gestor).                           |
| `orders.write` | admin_socio, encargado, operador                | Abrir OS a cuenta B2B y aplicar la cuenta a una OS abierta (sin ver tarifas).  |

- Una cuenta es visible desde su centro gestor y desde los centros habilitados en sus convenios; las OS del estado de cuenta se limitan a los centros del usuario.
- El contador consulta pero no factura (sigue siendo rol de sólo lectura).

## RPC

| RPC                                                                                                         | Uso                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `upsert_b2b_account`, `upsert_b2b_contact`, `upsert_b2b_agreement`, `set_b2b_price_rule`, `set_b2b_vehicle` | Administración con motivo.                                    |
| `b2b_accounts_for_center(center)`                                                                           | Cuentas con convenio vigente y sus vehículos (para abrir OS). |
| `create_b2b_service_order(center, request, account, vehicle, items, purchase_order?, …)`                    | OS a cuenta B2B, idempotente.                                 |
| `apply_b2b_account(order, version, account, purchase_order?)`                                               | Ligar una OS abierta (p. ej. desde cita) y re-preciarla.      |
| `b2b_account_statement(account)` / `b2b_account_orders(account, from, to)`                                  | Estado de cuenta y OS con evidencias.                         |
| `create_b2b_invoice`, `void_b2b_invoice`, `record_b2b_payment`, `void_b2b_payment`                          | Cortes y pagos.                                               |
| `b2b_profitability_facts(centers[], from, to)`                                                              | Hechos de rentabilidad.                                       |

Errores: `MG002` → regla visible (vencido, vehículo no autorizado, crédito, unidades, traslape), `42501` → permiso, `22023` → validación, `40001` → la OS cambió.

## Pantallas

| Web                             | Móvil                                | Contenido                                                                                                           |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `/comercial/b2b`                | `B2bAccountsScreen`                  | Cuentas con estatus y convenio vigente; búsqueda y filtro.                                                          |
| `/comercial/b2b/nueva`          | `B2bAccountNewScreen`                | Alta ligada a un cliente empresa.                                                                                   |
| `/comercial/b2b/[id]`           | `B2bAccountScreen`                   | Estado de cuenta, convenios, vehículos, OS (con evidencias), cortes y pagos, contactos y datos.                     |
| `/comercial/b2b/convenios/[id]` | `B2bAgreementScreen`                 | Tarifas (alta y activar / desactivar), vista previa del precio convenido y condiciones.                             |
| `/comercial/b2b/rentabilidad`   | `B2bProfitabilityScreen`             | Rentabilidad por cuenta y centro, del centro o consolidada.                                                         |
| `/ordenes/nueva?modo=b2b`       | `OrderNewScreen` → "A cuenta B2B"    | Cuenta, vehículo autorizado, orden de compra y líneas (la tarifa se aplica al guardar).                             |
| `/ordenes/[id]`                 | `OrderDetailScreen` (`OrderB2bCard`) | Cuenta y convenio de la OS, líneas con tarifa y precio de lista; "Aplicar convenio" a una OS abierta de la empresa. |

## Datos seed

- Cuenta **Transportes del Norte** (centro gestor Monterrey) con el convenio "Flotilla 2026" (tarifa por vehículo, vigente, CDMX y Monterrey, 30 días, límite $50,000): lavado exprés a $199 y 10 % sobre lista en el resto; vehículo NL4521A autorizado.
- La OS `MTY-01-000001` (B2B previa) queda a cuenta de la empresa con su precio original.

## Variables de entorno

Ninguna nueva.

## Pendientes

- CFDI y export / API de facturación (los cortes ya guardan la referencia).
- Bloqueo opcional por saldo vencido (hoy sólo se informa).
- Portal del cliente B2B y aprobación de OS por su parte.
