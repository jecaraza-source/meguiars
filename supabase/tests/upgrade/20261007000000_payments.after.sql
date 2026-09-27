-- Tras 20261007000000_payments: lo cobrado en O4 queda en recibos (uno por
-- evento, más uno "Otro" por la diferencia), sin cambiar el cobrado ni el total.
\set ON_ERROR_STOP on
do $$
begin
  if (select paid_amount <> 500 or payment_status <> 'pagada' or status <> 'entregada'
        from public.service_orders where id = '2a000000-0000-0000-0000-000000000007') then
    raise exception 'FALLÓ: la OS previa conserva cobrado, estado y queda pagada';
  end if;
  if (select string_agg(p.receipt_folio || ':' || t.method || '=' || t.amount || ':' || coalesce(t.reference, '-'), ','
                        order by p.receipt_number)
        from public.payments p join public.payment_tenders t on t.payment_id = p.id
        join public.payment_allocations a on a.payment_id = p.id
       where a.service_order_id = '2a000000-0000-0000-0000-000000000007' and p.status = 'valido')
     is distinct from 'CRM-01-R-000001:efectivo=200.00:Previo,CRM-01-R-000002:tarjeta=250.00:AUT-9,CRM-01-R-000003:otro=50.00:Previo' then
    raise exception 'FALLÓ: los cobros previos quedan como recibos con su forma de pago';
  end if;
  if exists (select 1 from public.service_orders o
              where o.paid_amount <> coalesce((select sum(a.amount) from public.payment_allocations a
                join public.payments p on p.id = a.payment_id and p.status = 'valido'
               where a.service_order_id = o.id), 0)) then
    raise exception 'FALLÓ: Σ pagos válidos = cobrado en todas las OS';
  end if;
  if (select received_at::date from public.payments where receipt_folio = 'CRM-01-R-000002') <> current_date - 1 then
    raise exception 'FALLÓ: el recibo conserva la fecha del cobro original';
  end if;
  raise notice 'ok - cobros previos migrados a recibos (Σ pagos válidos = cobrado)';
end $$;
