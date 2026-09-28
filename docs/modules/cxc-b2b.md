# Módulo AF5 — Administración y Finanzas / Cuentas por cobrar B2B

## Alcance

Visibilidad de los servicios B2B realizados, facturables y cobrados, con paridad web y móvil. **No es un módulo fiscal:** la factura (CFDI) se emite fuera y aquí sólo se registra su referencia.

- **Documentos de cobro por cuenta y periodo:** agrupan las OS entregadas de la cuenta (todas las del periodo o las elegidas) y la cuota devengada pendiente.
- **Estados:** `por_facturar`, `facturado_externo`, `parcial`, `cobrado`, `vencido` (y `anulado`).
- **Factura externa opcional:** referencia (folio o UUID del CFDI) y fecha.
- **Fecha compromiso** de pago, editable con motivo (queda en el documento y en la auditoría).
- **Antigüedad** 0-30 / 31-60 / 61-90 / 90+ días (configurable).
- **Pagos aplicados a uno o varios documentos**, o automáticamente al compromiso más antiguo; lo no aplicado queda como saldo a favor.
- **Export de soporte** para el contador o la facturación externa (CSV).

Decisiones en [ADR 0022](../adr/0022-cxc-b2b-documentos-sobre-cortes.md).

## Modelo de datos (`20261012000000_b2b_receivables.sql`)

```
b2b_accounts ─* b2b_invoices (documento de cobro) ─* service_orders.b2b_invoice_id
             └─* b2b_payments ─* b2b_payment_allocations *─1 b2b_invoices
private.b2b_document_counters (folio CXC por organización)
```

| Tabla                     | Cambio / notas                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b2b_invoices`            | + `folio` (`CXC-000001`), `folio_number`, `period_from` / `period_to`, `external_invoiced_on`, `due_on_reason`. `reference` (factura externa) pasa a opcional; sigue única por cuenta. `due_on` = fecha compromiso. |
| `b2b_payment_allocations` | Nueva. Pago, documento e importe (> 0). Inmutable (trigger), con motivo y auditoría. RLS de lectura por visibilidad de la cuenta; sin escritura directa.                                                            |
| `b2b_payments`            | Sin cambios de columnas; `invoice_id` queda como referencia simple cuando el pago se aplica a un solo documento.                                                                                                    |

### Migración de datos previos

- Cortes previos: folio en orden de alta, periodo por la entrega de sus OS (o la fecha del corte) y su referencia como factura externa.
- Pagos vigentes previos: se aplican a su corte (hasta su saldo) y el resto al compromiso más antiguo.
- El saldo por cuenta no cambia (prueba `supabase/tests/upgrade/20261012000000_b2b_receivables.*`).

## Reglas

| Regla             | Detalle                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agrupar           | Periodo sin fechas futuras. OS entregadas de la cuenta, con fecha de entrega (del centro de la OS) en el periodo y sin documento. Cuota ≤ devengada pendiente. Importe > 0. Idempotente por `request_id` (MG002 / 22023). |
| Vencimiento       | Por defecto, fecha del documento + condición de pago del convenio; se puede fijar otra fecha compromiso (no anterior a hoy al crear, ni al documento al editar).                                                          |
| Estado (derivado) | anulado > cobrado (pagado ≥ importe) > vencido (compromiso pasado con saldo) > parcial (pagado > 0) > facturado externo (con referencia) > por facturar.                                                                  |
| Pago              | > 0 y ≤ saldo por cobrar de la cuenta; sin fecha futura. Aplicación explícita: cada importe ≤ saldo del documento y Σ ≤ pago. Sin aplicación: compromiso, fecha y folio más antiguos primero. Idempotente.                |
| Saldo a favor     | Lo no aplicado de un pago; `allocate_b2b_payment` lo aplica después (explícito o automático).                                                                                                                             |
| Anular            | Documento: sólo sin pagos aplicados vigentes; sus OS vuelven a quedar por agrupar. Pago: con motivo; sus aplicaciones dejan de contar.                                                                                    |
| Saldo trazable    | consumo (OS entregadas + cuotas devengadas) − pagos vigentes = sin agrupar + saldo de documentos − saldo a favor. Coincide con el estado de cuenta de C3 (por facturar + por cobrar).                                     |
| P&L               | No cambia: la venta es la OS entregada y la cuota devengada. Agrupar, facturar o cobrar no suma ingreso.                                                                                                                  |
| Antigüedad        | Documentos por días desde su fecha; OS sin agrupar por días desde la entrega. `agingBuckets([30, 60, 90])` → 0-30, 31-60, 61-90, 90+.                                                                                     |
| Cartera           | Pertenece al centro gestor de la cuenta; el resumen filtra por centros gestores del alcance (centro activo o todos mis centros).                                                                                          |
| Sin conexión      | Las mutaciones requieren conexión (sin cola offline); el `request_id` hace seguro el reintento.                                                                                                                           |

## Permisos

| Capacidad     | Roles                                           | Qué permite en CxC                                                                           |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `b2b.read`    | admin_socio, encargado, comercial_b2b, contador | Resumen, antigüedad, documentos, pagos y export (cuentas de sus centros gestores).           |
| `b2b.billing` | admin_socio, comercial_b2b                      | Agrupar, registrar factura externa y compromiso, registrar / aplicar / anular pagos, anular. |

El **contador** consulta y exporta pero no escribe (rol de sólo lectura). Recepción no ve el módulo.

## RPC

| RPC                                                                        | Uso                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `b2b_receivables(centers[])`                                               | Resumen por cuenta: sin agrupar, documentos por estado, a favor, saldo. |
| `b2b_billing_documents(centers[], account?, include_closed?, from?, to?)`  | Documentos con saldo, estado, antigüedad y días vencido.                |
| `b2b_unbilled_orders(centers[], account?)`                                 | OS entregadas sin documento.                                            |
| `b2b_account_payments(account)`                                            | Pagos con lo aplicado, saldo a favor y aplicaciones.                    |
| `b2b_billing_document(id)`                                                 | Detalle: datos fiscales, OS y pagos aplicados.                          |
| `b2b_receivables_export(centers[], from, to, account?)`                    | Una fila por OS o cuota de cada documento vigente (máx. 1 año).         |
| `create_b2b_billing_batch`, `update_b2b_billing_batch`, `void_b2b_invoice` | Documentos.                                                             |
| `register_b2b_payment`, `allocate_b2b_payment`, `void_b2b_payment`         | Pagos.                                                                  |
| `create_b2b_invoice`, `record_b2b_payment` (C3)                            | Interfaces compatibles sobre las anteriores.                            |

Errores: `MG002` → regla visible (periodo sin OS, saldo, documento con pagos), `42501` → permiso, `22023` → validación.

## Pantallas

| Web                             | Móvil                      | Contenido                                                                                                            |
| ------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/finanzas/cxc`                 | `ReceivablesScreen`        | KPIs, saldo por cuenta, antigüedad por cuenta y rango, documentos abiertos y export (web: rango; móvil: 90 días).    |
| `/finanzas/cxc/cuentas/[id]`    | `ReceivableAccountScreen`  | Saldo trazable, OS por agrupar y agrupar, documentos del año, pagos (aplicar saldo a favor, anular), registrar pago. |
| `/finanzas/cxc/documentos/[id]` | `ReceivableDocumentScreen` | Detalle, datos fiscales, OS, pagos aplicados, factura externa y compromiso, anular y CSV del documento.              |
| `/comercial/b2b/[id]`           | `B2bAccountScreen`         | Tarjeta "Cuentas por cobrar B2B" con documentos abiertos y enlace (reemplaza los formularios de corte y pago de C3). |

Textos compartidos en `receivablesCopy`; reglas en `@meguiars/domain` (`b2bDocumentStatus`, `agingBuckets`, `receivablesAging`, `autoAllocation`, `previewAllocation`, `receivableTraceGap`, `receivablesExportCsv`).

## Export para el contador

CSV UTF-8 (web con BOM para Excel), una fila por OS o cuota: documento, estado, cuenta, razón social, RFC, régimen fiscal, CP fiscal, email de facturación, periodo, fecha del documento, factura externa y su fecha, fecha compromiso, concepto, OS, centro, fecha de entrega, vehículo, orden de compra, importe de la línea e importe / pagado / saldo del documento.

## Datos seed

Transportes del Norte (centro gestor Monterrey):

- `MTY-01-000003` (2 lavados a $199, entregada hace 25 días) en `CXC-000001`: factura externa A-1523, compromiso vencido hace 5 días, $200 cobrados → **vencido**, saldo $198.
- `MTY-01-000004` ($199, entregada hace 3 días) → **por agrupar**.

## Pruebas

- **SQL** (`supabase/tests/b2b_receivables.test.sql`), 47 aserciones: estados (precedencia), permisos (contador, encargado, operador, comercial de otro centro), periodo y OS del periodo, folio e idempotencia, factura externa y compromiso con motivo y auditoría, pagos a varios documentos, saldo a favor y aplicación posterior, orden automático, validaciones de aplicación, vencido y antigüedad, anulaciones, inmutabilidad, saldo trazable, cuota de iguala, export, detalle y **P&L sin cambios**.
- **Actualización:** cortes y pagos previos.
- **Unitarias:** estado, aging configurable, aplicación automática y vista previa, saldo trazable, presentación, CSV, validación y repositorio; paridad de estados y orden con la migración.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 10 comprobaciones: resumen y antigüedad, agrupar, factura externa con motivo, pago a dos documentos (cobrado y parcial), CSV, documento con pagos sin anulación, tarjeta en la ficha B2B, contador de sólo lectura, cartera por centro gestor y recepción sin acceso.

## Variables de entorno

Ninguna nueva.

## Pendientes

- CFDI / timbrado y conciliación bancaria (fuera de alcance).
- Pagos B2B en efectivo o cheque recibidos en el centro no entran al corte de caja (AF3).
- Reverso parcial de un pago y desaplicar sin anular.
- Bloqueo opcional de nuevas OS por saldo vencido (hoy sólo se informa).
- Rangos de antigüedad configurables por organización (hoy, en código).
