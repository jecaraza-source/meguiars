-- F5.1 — Endurecimiento previo al piloto.
--
-- 1. Cartera B2B sólo en el centro gestor (ADR 0022). Los documentos de cobro,
--    los pagos B2B y sus aplicaciones se leían con la visibilidad de la CUENTA,
--    que también alcanza a los centros que sólo operan el convenio: un admin,
--    encargado, comercial o contador de esos centros podía leer (PostgREST o
--    b2b_billing_document / b2b_account_payments) folios, importes, pagos y OS
--    del centro gestor. Ahora exigen b2b.read en el centro gestor. La ficha de
--    la cuenta, el estado de cuenta agregado (crédito disponible) y las OS del
--    propio centro siguen visibles para operar.
-- 2. Privilegios: `authenticated` conservaba TRUNCATE sobre profiles (TRUNCATE
--    no pasa por RLS) y TRIGGER/REFERENCES sobre todas las tablas por los
--    privilegios por defecto de Supabase. Ninguno se usa: se revocan, también
--    para las tablas futuras. Las funciones de trigger de private dejan de ser
--    ejecutables por PUBLIC (los triggers no requieren EXECUTE).

create function private.b2b_portfolio_visible(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.b2b_accounts a
                  where a.id = p_account_id and private.can_read_b2b(a.home_detail_center_id));
$$;
revoke all on function private.b2b_portfolio_visible(uuid) from public, anon;
grant execute on function private.b2b_portfolio_visible(uuid) to authenticated;

drop policy b2b_invoices_select on public.b2b_invoices;
create policy b2b_invoices_select on public.b2b_invoices
  for select to authenticated using (private.b2b_portfolio_visible(account_id));
drop policy b2b_payments_select on public.b2b_payments;
create policy b2b_payments_select on public.b2b_payments
  for select to authenticated using (private.b2b_portfolio_visible(account_id));
drop policy b2b_payment_allocations_select on public.b2b_payment_allocations;
create policy b2b_payment_allocations_select on public.b2b_payment_allocations
  for select to authenticated using (
    exists (select 1 from public.b2b_payments p
             where p.id = payment_id and private.b2b_portfolio_visible(p.account_id)));

CREATE OR REPLACE FUNCTION public.b2b_billing_document(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inv public.b2b_invoices;
  acc public.b2b_accounts;
  today date;
  v_paid numeric;
begin
  select * into inv from public.b2b_invoices where id = p_invoice_id;
  if not found or not private.b2b_portfolio_visible(inv.account_id) then
    raise exception 'Documento inexistente o sin permiso' using errcode = '42501';
  end if;
  select * into acc from public.b2b_accounts where id = inv.account_id;
  today := private.center_today(acc.home_detail_center_id);
  v_paid := private.b2b_invoice_paid(inv.id);
  return jsonb_build_object(
    'id', inv.id, 'account_id', acc.id, 'account_name', acc.name, 'legal_name', acc.legal_name, 'rfc', acc.rfc,
    'tax_regime', acc.tax_regime, 'fiscal_zip', acc.fiscal_zip, 'billing_email', acc.billing_email,
    'home_detail_center_id', acc.home_detail_center_id,
    'folio', inv.folio, 'period_from', inv.period_from, 'period_to', inv.period_to, 'issued_on', inv.issued_on,
    'external_ref', inv.reference, 'external_invoiced_on', inv.external_invoiced_on, 'due_on', inv.due_on,
    'due_on_reason', inv.due_on_reason, 'orders_amount', inv.orders_amount, 'fee_amount', inv.fee_amount,
    'amount', inv.amount, 'paid', v_paid, 'balance', case when inv.status = 'anulada' then 0 else inv.amount - v_paid end,
    'status', private.b2b_document_status(inv.status, inv.amount, v_paid, inv.reference, inv.due_on, today),
    'age_days', today - inv.issued_on,
    'days_overdue', case when inv.status = 'emitida' and inv.amount > v_paid then greatest(0, today - inv.due_on) else 0 end,
    'notes', inv.notes, 'void_reason', inv.void_reason, 'created_at', inv.created_at,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'folio', o.folio, 'detail_center_id', o.detail_center_id, 'center_name', c.name,
               'delivered_on', (o.delivered_at at time zone c.timezone)::date,
               'vehicle_label', o.vehicle_make || ' ' || o.vehicle_model || ' · ' || o.vehicle_plate,
               'purchase_order', o.channel_reference, 'total', o.total) order by o.delivered_at)
        from public.service_orders o join public.detail_centers c on c.id = o.detail_center_id
       where o.b2b_invoice_id = inv.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'payment_id', p.id, 'paid_on', p.paid_on, 'method', p.method, 'reference', p.reference,
               'amount', a.amount, 'voided', p.voided_at is not null) order by p.paid_on, a.created_at)
        from public.b2b_payment_allocations a join public.b2b_payments p on p.id = a.payment_id
       where a.invoice_id = inv.id), '[]'::jsonb)
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.b2b_account_payments(p_account_id uuid)
 RETURNS TABLE(id uuid, amount numeric, method text, reference text, paid_on date, voided_at timestamp with time zone, void_reason text, applied numeric, unapplied numeric, allocations jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.b2b_portfolio_visible(p_account_id) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  return query
  select p.id, p.amount, p.method, p.reference, p.paid_on, p.voided_at, p.void_reason,
         coalesce(al.applied, 0)::numeric, (p.amount - coalesce(al.applied, 0))::numeric,
         coalesce(al.items, '[]'::jsonb), p.created_at
    from public.b2b_payments p
    left join lateral (
      select sum(a.amount) as applied,
             jsonb_agg(jsonb_build_object('invoice_id', a.invoice_id, 'folio', i.folio, 'amount', a.amount)
                       order by a.created_at, i.folio_number) as items
        from public.b2b_payment_allocations a join public.b2b_invoices i on i.id = a.invoice_id
       where a.payment_id = p.id
    ) al on true
   where p.account_id = p_account_id
   order by p.paid_on desc, p.created_at desc;
end;
$function$;


revoke truncate on public.profiles from authenticated;
do $$
declare t record;
begin
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

revoke execute on function private.audit_row(), private.handle_new_user(), private.prevent_orphan_organization(),
  private.require_change_reason(), private.set_updated_at(), private.validate_timezone() from public;
