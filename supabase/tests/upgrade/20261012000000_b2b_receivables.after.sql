-- Tras 20261012000000_b2b_receivables: los cortes previos quedan como documentos
-- de cobro (folio en orden de alta, periodo por la entrega de sus OS y la
-- referencia como factura externa) y los pagos vigentes se aplican a su corte o,
-- sin corte, al compromiso más antiguo; el saldo de la cuenta no cambia.
\set ON_ERROR_STOP on
do $$
begin
  if (select string_agg(folio || ':' || coalesce(reference, '-') || ':' || period_from || '..' || period_to
                        || ':' || external_invoiced_on, ',' order by folio_number)
        from public.b2b_invoices where account_id = '2b100000-0000-0000-0000-000000000001')
     is distinct from (select 'CXC-000001:F-100:' || d || '..' || d || ':' || (current_date - 15)
                               || ',CXC-000002:F-101:' || (current_date - 5) || '..' || (current_date - 5) || ':'
                               || (current_date - 5)
                          from (select (o.delivered_at at time zone c.timezone)::date as d
                                  from public.service_orders o join public.detail_centers c on c.id = o.detail_center_id
                                 where o.id = '2a000000-0000-0000-0000-000000000012') x) then
    raise exception 'FALLÓ: folio, periodo y factura externa de los cortes previos';
  end if;
  if (select string_agg(p.reference || '>' || i.folio || '=' || a.amount, ',' order by p.reference)
        from public.b2b_payment_allocations a
        join public.b2b_payments p on p.id = a.payment_id
        join public.b2b_invoices i on i.id = a.invoice_id)
     is distinct from 'CH-1>CXC-000001=400.00,SPEI-A>CXC-000002=200.00' then
    raise exception 'FALLÓ: pagos previos aplicados a su corte o al compromiso más antiguo (el anulado no)';
  end if;
  if (select string_agg(private.b2b_invoice_paid(id) || '/' || amount, ',' order by folio_number)
        from public.b2b_invoices where account_id = '2b100000-0000-0000-0000-000000000001')
     is distinct from '400.00/500.00,200.00/300.00' then
    raise exception 'FALLÓ: cobrado por documento';
  end if;
  if (select receivable <> 200 or invoiced <> 800 or paid <> 600
        from private.b2b_account_balance('2b100000-0000-0000-0000-000000000001')) then
    raise exception 'FALLÓ: el saldo de la cuenta no cambia (por cobrar $200)';
  end if;
  if (select last_number from private.b2b_document_counters
       where organization_id = '2e000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FALLÓ: el consecutivo continúa después de los cortes previos';
  end if;
  raise notice 'ok - cortes previos como documentos de cobro y pagos previos aplicados (saldo intacto)';
end $$;
