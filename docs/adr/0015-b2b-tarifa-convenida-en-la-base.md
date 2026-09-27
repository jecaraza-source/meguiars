# ADR 0015 — B2B: tarifa convenida aplicada en la base, convenios sin traslape y cortes de facturación sin CFDI

- Estado: aceptado
- Fecha: 2026-10-04

## Contexto

Las cuentas empresariales operan con tarifas y condiciones distintas a las de mostrador, en uno o varios centros, con vehículos autorizados y pago a crédito. La OS ya congela precios por línea (ADR 0009), calcula totales en la base (ADR 0011) y tiene descuentos con niveles de autorización. El operador no debe poder alterar la tarifa convenida, un convenio vencido no debe aplicarse solo y la rentabilidad B2B debe poder calcularse por cuenta y centro.

## Decisión

1. **La cuenta se liga a un cliente empresa** (`clients.kind = 'company'`), que ya tiene su flotilla. No se duplican vehículos: `b2b_vehicles` sólo autoriza vehículos del cliente (o el convenio acepta cualquiera de la flotilla).
2. **Convenio con centros habilitados y un solo convenio activo por cuenta y fecha.** Una restricción de exclusión (`daterange` + `btree_gist`) evita el traslape, así la OS nunca tiene que elegir entre dos convenios. Al habilitar un centro, la empresa queda visible ahí (`client_centers`) para abrir sus OS.
3. **La tarifa se aplica en la base** dentro de `private.put_service_order_item`, reemplazada con la misma firma: toda línea nueva de una OS con convenio **aplicable ese día** toma la tarifa (`price_source = 'convenio'`, `b2b_price_rule_id`, `list_unit_price`) y queda congelada. Con el convenio vencido, suspendido, cancelado o deshabilitado en el centro, las líneas nuevas van a precio de lista; las ya vendidas conservan su precio. Se prefirió a aplicar la tarifa como descuento: el precio de la línea es el precio real (margen correcto) y los descuentos de la OS siguen siendo excepciones.
4. **Reglas simples por convenio** (`b2b_price_rules`): precio fijo, % sobre lista o "incluido" (paquete / iguala), por servicio o general, con escalón por número de OS del mes. Prioridad: la regla del servicio gana a la general; "incluido" mientras queden unidades del periodo; el escalón más alto alcanzado. Espejo en `resolveB2bPrice` para la vista previa.
5. **El operador no altera la tarifa.** No lee tarifas (RLS) ni las edita (sólo admin / comercial B2B del centro gestor, con motivo). En una OS con convenio los descuentos manuales exigen encargado o admin (trigger). La cuenta de una OS sólo cambia por las RPC B2B (trigger con bandera de transacción).
6. **Estado de cuenta derivado, facturación mínima.** Consumo, por facturar, por cobrar, vencido, comprometido y crédito disponible se calculan al leer (`private.b2b_account_balance`). Los cortes (`b2b_invoices`) agrupan OS entregadas y cuotas bajo la referencia del CFDI emitido fuera; los pagos (`b2b_payments`) bajan el saldo. Es la interfaz para un export / API de facturación futuro; no se implementa CFDI.
7. **Rentabilidad en `@meguiars/analytics`** sobre `b2b_profitability_facts` (por cuenta y centro, sin datos personales): ingreso de OS terminadas + cuotas (en el centro gestor) − costo directo congelado.

## Consecuencias

- La tarifa depende de la regla vigente **al agregar la línea**: cambiar una tarifa no re-precia OS abiertas (igual que el catálogo). Aplicar una cuenta a una OS abierta sí re-precia sus líneas (sólo sin descuentos).
- El límite de crédito bloquea abrir OS cuando la exposición (por facturar + por cobrar + OS en curso) lo supera; el vencido se informa pero no bloquea.
- `create_b2b_service_order` y `apply_b2b_account` son invoker; el cálculo de precio, el estado de cuenta y los listados B2B son `security definer` con chequeo explícito de rol y centro.
- El contador consulta estado de cuenta y rentabilidad, pero no factura (sigue siendo rol de sólo lectura).
