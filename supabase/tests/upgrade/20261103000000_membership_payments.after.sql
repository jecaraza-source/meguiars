-- Tras 20261103000000_membership_payments: las asignaciones previas siguen
-- cobrando su OS (Σ pagos válidos = cobrado) y la venta previa de membresías
-- sigue contando en el P&L sin recibos retroactivos.
\set ON_ERROR_STOP on
do $$
begin
  if exists (select 1 from public.payment_allocations where service_order_id is null or membership_event_id is not null) then
    raise exception 'FALLÓ: las asignaciones previas siguen ligadas a su OS';
  end if;
  if exists (select 1 from public.service_orders o
              where o.paid_amount <> coalesce((select sum(a.amount) from public.payment_allocations a
                join public.payments p on p.id = a.payment_id and p.status = 'valido'
               where a.service_order_id = o.id), 0)) then
    raise exception 'FALLÓ: Σ pagos válidos = cobrado en todas las OS';
  end if;
  if exists (select 1 from public.membership_events e
              where e.kind in ('alta', 'renovacion') and private.membership_event_refunded(e.id)) then
    raise exception 'FALLÓ: una venta previa sin recibo no cuenta como reembolsada';
  end if;
  raise notice 'ok - cobros previos intactos; ventas previas de membresía sin recibo siguen como venta';
end $$;
