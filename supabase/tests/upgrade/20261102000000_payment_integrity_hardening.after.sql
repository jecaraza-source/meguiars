-- Tras 20261102000000_payment_integrity_hardening: los recibos previos siguen
-- válidos, la membresía ya no se captura y la OS B2B sin cuenta pide su cobro.
\set ON_ERROR_STOP on
do $$
begin
  if (select active from public.payment_methods where code = 'membresia') then
    raise exception 'FALLÓ: la membresía queda desactivada como forma de pago';
  end if;
  if exists (select 1 from public.service_orders o
              where o.paid_amount <> coalesce((select sum(a.amount) from public.payment_allocations a
                join public.payments p on p.id = a.payment_id and p.status = 'valido'
               where a.service_order_id = o.id), 0)) then
    raise exception 'FALLÓ: los recibos previos siguen válidos (Σ pagos válidos = cobrado)';
  end if;
  if (select private.service_order_delivery_blocker(o) from public.service_orders o
       where o.id = '2a000000-0000-0000-0000-000000000042')
     is distinct from 'Hay saldo pendiente: una OS B2B sin cuenta se cobra antes de entregar' then
    raise exception 'FALLÓ: la OS B2B sin cuenta previa pide su cobro antes de entregar';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_graphql') then
    raise exception 'FALLÓ: pg_graphql queda apagado';
  end if;
  raise notice 'ok - recibos previos intactos; membresía inactiva; B2B sin cuenta se cobra antes de entregar';
end $$;
