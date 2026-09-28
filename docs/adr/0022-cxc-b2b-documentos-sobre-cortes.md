# ADR 0022 — Cuentas por cobrar B2B: documentos sobre los cortes de C3 y pagos aplicados

- Estado: aceptado
- Fecha: 2026-09-28

## Contexto

AF5 pide visibilidad de los servicios B2B realizados, facturables y cobrados sin construir un módulo fiscal: agrupar OS por cuenta y periodo, estados (por facturar, facturado externo, parcial, cobrado, vencido), referencia de factura externa opcional, fecha compromiso, antigüedad, pagos aplicados a varios documentos y un export para el contador.

C3 ya tenía cortes (`b2b_invoices`, con la referencia del CFDI obligatoria) y pagos de la cuenta (`b2b_payments`, ligados como máximo a un corte). AF1 (`payments`) registra recibos **por OS**: una OS a cuenta B2B se liquida con "crédito B2B" y el dinero real de la empresa llega después contra el estado de cuenta.

## Decisión

1. **El documento de cobro es el corte de C3**, no una tabla nueva. Se le agregan folio interno (`CXC-000001`, consecutivo por organización), periodo, fecha de la factura externa y motivo del cambio de compromiso. La referencia de la factura externa pasa a ser opcional. Los cortes previos se migran con folio en orden de alta y periodo por la entrega de sus OS.
2. **El pago de la empresa sigue en `b2b_payments`** (no en `payments` de AF1). Así la cobranza de mostrador y su invariante `paid_amount = Σ asignaciones` no cambian; el crédito B2B de AF1 sigue siendo sólo la forma de liquidar la OS en mostrador.
3. **`b2b_payment_allocations` (inmutable)** reparte un pago entre documentos. Lo no aplicado queda como saldo a favor. Sin aplicación explícita, se cubre primero el compromiso más antiguo (mismo orden en SQL y en `autoAllocation`). Anular el pago deja sin efecto sus aplicaciones.
4. **Estado derivado, no almacenado.** Precedencia: anulado > cobrado > vencido > parcial > facturado externo > por facturar (`private.b2b_document_status` ↔ `b2bDocumentStatus`). Sólo se guarda `emitida` / `anulada`.
5. **Antigüedad por fecha del documento** (y por fecha de entrega para lo no agrupado). Vencido es aparte: fecha compromiso pasada. Los rangos 0-30 / 31-60 / 61-90 / 90+ son configurables en `agingBuckets`.
6. **El P&L no cambia.** La venta sigue siendo la OS entregada y la cuota devengada; agrupar, facturar o cobrar no suma ingreso (prueba SQL que compara `pnl_lines` antes y después).
7. **Permisos existentes:** `b2b.read` consulta y exporta (incluido el contador); `b2b.billing` (admin, comercial B2B) agrupa, factura, cobra y anula en el centro gestor. El contador sigue de sólo lectura.
8. **La facturación sale de la ficha comercial.** Los formularios de corte y pago de C3 se retiran; la ficha muestra los documentos abiertos y enlaza a Administración y Finanzas → Cuentas por cobrar B2B. `create_b2b_invoice` y `record_b2b_payment` quedan como interfaces compatibles sobre las nuevas RPC.

## Consecuencias

- Saldo por cuenta trazable: consumo − pagos = sin agrupar + documentos − saldo a favor (prueba SQL y aviso en la UI).
- `b2b_account_orders` muestra el folio del documento (y la factura externa si existe) en lugar de sólo la referencia.
- Un pago B2B en efectivo no entra al corte de caja de AF3 (va al estado de cuenta); se documenta como pendiente.
- La cartera es del centro gestor: un centro que sólo opera la cuenta no la ve en su resumen.
