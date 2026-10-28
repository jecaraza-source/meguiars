-- Endurecimiento de la integridad de cobros (auditoría de seguridad, ADR 0042).
--
-- 1. GraphQL apagado. pg_graphql ejecuta varias mutaciones de una petición en
--    una sola transacción. Como private.set_change_reason() fija el motivo hasta
--    el fin de la transacción, una RPC cualquiera seguida de escrituras directas
--    a las tablas saltaba private.require_change_reason() (p. ej. fijar el total
--    de una OS o marcarla entregada). Ninguna app usa GraphQL: sólo PostgREST,
--    que ejecuta una llamada por transacción.
-- 2. La membresía deja de ser forma de pago. Saldaba cualquier importe sin cobrar
--    nada (sólo exigía una membresía vigente del cliente). Los servicios incluidos
--    ya se redimen como descuento de la OS (ADR 0013); el resto se cobra en
--    efectivo, tarjeta o transferencia. Los recibos previos con membresía siguen
--    válidos (sólo se desactiva la forma de pago).
-- 3. Una OS B2B sin cuenta se cobra antes de entregarse. Sólo la OS a cuenta B2B
--    se entrega a crédito: su saldo va al estado de cuenta de la empresa.

-- 1. GraphQL --------------------------------------------------------------------
drop extension if exists pg_graphql;

-- 2. Membresía como forma de pago ----------------------------------------------
update public.payment_methods set active = false where code = 'membresia';

-- 3. Entrega de OS B2B sin cuenta ----------------------------------------------
-- Qué impide entregar (null = nada). Espejo de deliveryBlocker(): b2c, membresía
-- y B2B sin cuenta exigen el saldo cobrado; B2B a cuenta se factura a la cuenta
-- con su orden de compra.
create or replace function private.service_order_delivery_blocker(o public.service_orders) returns text
language sql immutable set search_path = '' as $$
  select case
    when o.channel in ('b2c', 'membresia') and o.paid_amount < o.total
      then 'Hay saldo pendiente: registra el cobro antes de entregar'
    when o.channel = 'b2b' and o.channel_reference is null
      then 'Captura la orden de compra del cliente B2B'
    when o.channel = 'b2b' and o.b2b_account_id is null and o.paid_amount < o.total
      then 'Hay saldo pendiente: una OS B2B sin cuenta se cobra antes de entregar'
  end;
$$;
