-- AF5 — Administración y Finanzas / Cuentas por cobrar B2B.
--
-- Visibilidad de lo realizado, facturable y cobrado a las cuentas B2B, sin un
-- módulo fiscal: la factura (CFDI) se emite fuera y aquí sólo se guarda su
-- referencia.
--
-- * Documento de cobro = el corte de C3 (public.b2b_invoices): agrupa las OS
--   entregadas de una cuenta en un periodo (y la cuota devengada). Ahora lleva
--   folio interno (CXC-000001), periodo, referencia de la factura externa
--   opcional (columna `reference`, antes obligatoria), fecha de la factura
--   externa y fecha compromiso de pago (`due_on`, editable con motivo).
-- * Pagos aplicados: un pago de la cuenta (public.b2b_payments) se reparte
--   entre uno o varios documentos (public.b2b_payment_allocations, inmutable).
--   Lo no aplicado queda como saldo a favor de la cuenta.
-- * Estado del documento (derivado, espejo de b2bDocumentStatus):
--   anulado > cobrado > vencido > parcial > facturado_externo > por_facturar.
-- * Aging por antigüedad del documento (días desde su fecha); las OS sin
--   agrupar, por días desde la entrega. Los rangos (0-30 / 31-60 / 61-90 / 90+)
--   se configuran en @meguiars/domain.
-- * El P&L no cambia: la venta sigue siendo la OS entregada y la cuota
--   devengada (20261010000000_pnl.sql); agrupar, facturar o cobrar no suma
--   ingreso.
-- * Permisos: b2b.read (admin, encargado, comercial B2B, contador) consulta y
--   exporta; b2b.billing (admin, comercial B2B) agrupa, registra la factura
--   externa, aplica pagos y anula, en el centro gestor de la cuenta. El
--   contador sigue siendo de sólo lectura.

-- ---------------------------------------------------------------------------
-- 1. Documentos de cobro (evolución de b2b_invoices)
-- ---------------------------------------------------------------------------

create table private.b2b_document_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null
);
alter table private.b2b_document_counters enable row level security;
revoke all on private.b2b_document_counters from public, anon, authenticated;

alter table public.b2b_invoices
  add column folio text,
  add column folio_number integer,
  add column period_from date,
  add column period_to date,
  add column external_invoiced_on date,
  add column due_on_reason text,
  alter column reference drop not null;

-- Documentos previos: folio en orden de alta, periodo = entregas de sus OS (o la
-- fecha del corte) y la referencia que ya tenían como factura externa.
do $$
begin
  perform set_config('app.change_reason', 'CxC B2B: folio y periodo de cortes previos', true);
  with numbered as (
    select i.id, row_number() over (partition by i.organization_id order by i.created_at, i.id)::integer as n
      from public.b2b_invoices i
  ), periods as (
    select i.id,
           min((o.delivered_at at time zone c.timezone)::date) as p_from,
           max((o.delivered_at at time zone c.timezone)::date) as p_to
      from public.b2b_invoices i
      left join public.service_orders o on o.b2b_invoice_id = i.id and o.delivered_at is not null
      left join public.detail_centers c on c.id = o.detail_center_id
     group by i.id
  )
  update public.b2b_invoices i
     set folio_number = numbered.n,
         folio = 'CXC-' || lpad(numbered.n::text, 6, '0'),
         period_from = least(coalesce(periods.p_from, i.issued_on), i.issued_on),
         period_to = least(coalesce(periods.p_to, i.issued_on), i.issued_on),
         external_invoiced_on = i.issued_on
    from numbered, periods
   where numbered.id = i.id and periods.id = i.id;
  insert into private.b2b_document_counters (organization_id, last_number)
  select organization_id, max(folio_number) from public.b2b_invoices group by organization_id;
end;
$$;

alter table public.b2b_invoices
  alter column folio set not null,
  alter column folio_number set not null,
  alter column period_from set not null,
  alter column period_to set not null,
  add constraint b2b_invoices_folio_unique unique (organization_id, folio_number),
  add constraint b2b_invoices_period check (period_to >= period_from),
  add constraint b2b_invoices_external_date check (external_invoiced_on is null or reference is not null),
  add constraint b2b_invoices_due_reason check (due_on_reason is null or length(btrim(due_on_reason)) between 3 and 500);

-- ---------------------------------------------------------------------------
-- 2. Aplicación de pagos a documentos
-- ---------------------------------------------------------------------------

-- b2b_payments necesita una llave (organization_id, id) para la FK compuesta.
alter table public.b2b_payments add constraint b2b_payments_org_id_unique unique (organization_id, id);

create table public.b2b_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, payment_id) references public.b2b_payments (organization_id, id) on delete restrict,
  foreign key (organization_id, invoice_id) references public.b2b_invoices (organization_id, id) on delete restrict
);
create index b2b_payment_allocations_payment_idx on public.b2b_payment_allocations (payment_id);
create index b2b_payment_allocations_invoice_idx on public.b2b_payment_allocations (invoice_id);

create trigger b2b_payment_allocations_require_reason before insert or update or delete
  on public.b2b_payment_allocations for each row execute function private.require_change_reason();
create trigger b2b_payment_allocations_audit after insert or update or delete
  on public.b2b_payment_allocations for each row execute function private.audit_row();

-- Traza inmutable: una aplicación no se edita ni se borra; anular el pago la deja sin efecto.
create function private.forbid_b2b_allocation_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Las aplicaciones de pago no se editan ni se borran; anula el pago' using errcode = '42501';
end;
$$;
create trigger b2b_payment_allocations_immutable before update or delete on public.b2b_payment_allocations
  for each row execute function private.forbid_b2b_allocation_changes();

alter table public.b2b_payment_allocations enable row level security;
create policy b2b_payment_allocations_select on public.b2b_payment_allocations
  for select to authenticated using (
    exists (select 1 from public.b2b_payments p
             where p.id = payment_id and private.b2b_account_visible(p.account_id, false)));
revoke all on public.b2b_payment_allocations from anon;
revoke insert, update, delete, truncate on public.b2b_payment_allocations from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Saldos y estado
-- ---------------------------------------------------------------------------

-- Cobrado de un documento: aplicaciones de pagos no anulados.
create function private.b2b_invoice_paid(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.amount), 0)::numeric(12, 2)
    from public.b2b_payment_allocations a
    join public.b2b_payments p on p.id = a.payment_id and p.voided_at is null
   where a.invoice_id = p_invoice_id;
$$;

-- Parte de un pago aún sin aplicar (saldo a favor).
create function private.b2b_payment_unapplied(p_payment_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select (p.amount - coalesce((select sum(a.amount) from public.b2b_payment_allocations a
                                where a.payment_id = p.id), 0))::numeric(12, 2)
    from public.b2b_payments p where p.id = p_payment_id;
$$;

-- Estado del documento (espejo de b2bDocumentStatus en @meguiars/domain).
create function private.b2b_document_status(
  p_status text,
  p_amount numeric,
  p_paid numeric,
  p_reference text,
  p_due_on date,
  p_today date
) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_status = 'anulada' then 'anulado'
    when p_paid >= p_amount then 'cobrado'
    when p_due_on < p_today then 'vencido'
    when p_paid > 0 then 'parcial'
    when p_reference is not null then 'facturado_externo'
    else 'por_facturar'
  end;
$$;

-- Hoy del centro gestor de la cuenta.
create function private.b2b_account_today(p_account_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select private.center_today(a.home_detail_center_id) from public.b2b_accounts a where a.id = p_account_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Aplicación de pagos (FIFO o explícita)
-- ---------------------------------------------------------------------------

-- Aplica hasta el saldo sin aplicar del pago. p_allocations = [{invoice_id, amount}]
-- (explícito) o null (automático: documentos abiertos del compromiso más antiguo
-- al más reciente). Devuelve lo aplicado en esta llamada.
create function private.b2b_apply_payment(p_payment public.b2b_payments, p_allocations jsonb) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  remaining numeric := private.b2b_payment_unapplied(p_payment.id);
  applied numeric := 0;
  item jsonb;
  v_invoice public.b2b_invoices;
  v_invoice_id uuid;
  v_amount numeric;
  v_open numeric;
begin
  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Aplicación inválida' using errcode = '22023';
  end if;
  if p_allocations is null then
    for v_invoice in
      select i.* from public.b2b_invoices i
       where i.account_id = p_payment.account_id and i.status = 'emitida'
       order by i.due_on, i.issued_on, i.folio_number
    loop
      exit when remaining <= 0;
      v_open := v_invoice.amount - private.b2b_invoice_paid(v_invoice.id);
      continue when v_open <= 0;
      v_amount := least(v_open, remaining);
      insert into public.b2b_payment_allocations (organization_id, payment_id, invoice_id, amount)
      values (p_payment.organization_id, p_payment.id, v_invoice.id, v_amount);
      remaining := remaining - v_amount;
      applied := applied + v_amount;
    end loop;
    return applied;
  end if;
  for item in select * from jsonb_array_elements(p_allocations) loop
    begin
      v_amount := round((item ->> 'amount')::numeric, 2);
      v_invoice_id := (item ->> 'invoice_id')::uuid;
    exception when others then
      raise exception 'Aplicación inválida: documento e importe' using errcode = '22023';
    end;
    select * into v_invoice from public.b2b_invoices where id = v_invoice_id;
    if not found or v_invoice.account_id <> p_payment.account_id or v_invoice.status <> 'emitida' then
      raise exception 'El pago sólo se aplica a documentos vigentes de la misma cuenta' using errcode = 'MG002';
    end if;
    v_open := v_invoice.amount - private.b2b_invoice_paid(v_invoice.id);
    if v_amount is null or v_amount <= 0 or v_amount > v_open then
      raise exception 'El importe aplicado a % debe ser mayor que 0 y no superar su saldo (%)',
        v_invoice.folio, to_char(v_open, 'FM$999,999,990.00') using errcode = 'MG002';
    end if;
    if v_amount > remaining then
      raise exception 'Lo aplicado no puede superar el pago sin aplicar (%)',
        to_char(remaining, 'FM$999,999,990.00') using errcode = 'MG002';
    end if;
    insert into public.b2b_payment_allocations (organization_id, payment_id, invoice_id, amount)
    values (p_payment.organization_id, p_payment.id, v_invoice.id, v_amount);
    remaining := remaining - v_amount;
    applied := applied + v_amount;
  end loop;
  return applied;
end;
$$;

-- Pagos previos: se aplican a su corte (si lo tenían) y el resto en orden de compromiso.
do $$
declare
  pay public.b2b_payments;
  v_open numeric;
begin
  perform set_config('app.change_reason', 'CxC B2B: aplicación de pagos previos', true);
  for pay in select * from public.b2b_payments where voided_at is null order by paid_on, created_at, id loop
    if pay.invoice_id is not null then
      select i.amount - private.b2b_invoice_paid(i.id) into v_open
        from public.b2b_invoices i where i.id = pay.invoice_id and i.status = 'emitida';
      if coalesce(v_open, 0) > 0 then
        insert into public.b2b_payment_allocations (organization_id, payment_id, invoice_id, amount)
        values (pay.organization_id, pay.id, pay.invoice_id, least(v_open, pay.amount));
      end if;
    end if;
    perform private.b2b_apply_payment(pay, null);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Documentos: alta, datos de la factura externa y anulación
-- ---------------------------------------------------------------------------

create function private.next_b2b_document_number(p_organization_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.b2b_document_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update set last_number = private.b2b_document_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

-- Agrupa las OS entregadas de la cuenta en el periodo (fecha de entrega del
-- centro de cada OS) que aún no tienen documento, o las indicadas, más la cuota
-- devengada pendiente que se indique. Idempotente por request_id.
create function public.create_b2b_billing_batch(
  p_account_id uuid,
  p_request_id uuid,
  p_period_from date,
  p_period_to date,
  p_order_ids uuid[] default null,
  p_fee_amount numeric default 0,
  p_due_on date default null,
  p_external_ref text default null,
  p_external_invoiced_on date default null,
  p_notes text default null
) returns public.b2b_invoices
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  bal record;
  today date;
  v_orders uuid[];
  v_orders_amount numeric;
  terms smallint;
  n integer;
  result public.b2b_invoices;
begin
  select * into acc from public.b2b_accounts where id = p_account_id for update;
  if not found or not private.can_bill_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso para facturar' using errcode = '42501';
  end if;
  select * into result from public.b2b_invoices where organization_id = acc.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  today := private.center_today(acc.home_detail_center_id);
  if p_period_from is null or p_period_to is null or p_period_to < p_period_from or p_period_to > today then
    raise exception 'Periodo inválido: del inicio al fin, sin fechas futuras' using errcode = '22023';
  end if;
  if p_order_ids is null then
    select coalesce(array_agg(o.id order by o.delivered_at), '{}') into v_orders
      from public.service_orders o join public.detail_centers c on c.id = o.detail_center_id
     where o.b2b_account_id = acc.id and o.status = 'entregada' and o.b2b_invoice_id is null
       and (o.delivered_at at time zone c.timezone)::date between p_period_from and p_period_to;
  else
    v_orders := p_order_ids;
    if exists (select 1 from unnest(v_orders) x
                where not exists (
                  select 1 from public.service_orders o join public.detail_centers c on c.id = o.detail_center_id
                   where o.id = x and o.b2b_account_id = acc.id and o.status = 'entregada' and o.b2b_invoice_id is null
                     and (o.delivered_at at time zone c.timezone)::date between p_period_from and p_period_to)) then
      raise exception 'Sólo se agrupan OS entregadas de la cuenta, en el periodo y sin documento' using errcode = 'MG002';
    end if;
  end if;
  select * into bal from private.b2b_account_balance(acc.id);
  if coalesce(p_fee_amount, 0) < 0 or coalesce(p_fee_amount, 0) > greatest(0, bal.fees_accrued - bal.fees_invoiced) then
    raise exception 'La cuota facturada supera la devengada pendiente' using errcode = 'MG002';
  end if;
  select coalesce(sum(o.total), 0) into v_orders_amount from public.service_orders o where o.id = any (v_orders);
  if v_orders_amount + coalesce(p_fee_amount, 0) <= 0 then
    raise exception 'No hay OS entregadas por agrupar ni cuota en el periodo' using errcode = 'MG002';
  end if;
  if p_due_on is not null and p_due_on < today then
    raise exception 'La fecha compromiso no puede ser anterior a hoy' using errcode = '22023';
  end if;
  if p_external_invoiced_on is not null and nullif(btrim(p_external_ref), '') is null then
    raise exception 'La fecha de la factura externa requiere su referencia' using errcode = '22023';
  end if;
  select g.payment_terms_days into terms from public.b2b_agreements g
   where g.account_id = acc.id order by (g.status = 'activo') desc, g.starts_on desc limit 1;
  n := private.next_b2b_document_number(acc.organization_id);
  perform private.set_change_reason('Documento de cobro CXC-' || lpad(n::text, 6, '0'));
  insert into public.b2b_invoices (organization_id, account_id, folio, folio_number, reference, issued_on, due_on,
    period_from, period_to, external_invoiced_on, orders_amount, fee_amount, notes, request_id)
  values (acc.organization_id, acc.id, 'CXC-' || lpad(n::text, 6, '0'), n, nullif(btrim(p_external_ref), ''), today,
    coalesce(p_due_on, today + coalesce(terms, 0)), p_period_from, p_period_to,
    case when nullif(btrim(p_external_ref), '') is null then null else coalesce(p_external_invoiced_on, today) end,
    v_orders_amount, coalesce(p_fee_amount, 0), nullif(btrim(p_notes), ''), p_request_id)
  returning * into result;
  perform set_config('app.b2b_invoice', 'on', true);
  update public.service_orders set b2b_invoice_id = result.id where id = any (v_orders);
  perform set_config('app.b2b_invoice', 'off', true);
  return result;
exception
  when unique_violation then
    raise exception 'Ya existe un documento de la cuenta con esa referencia de factura' using errcode = 'MG002';
  when check_violation then
    raise exception 'Documento inválido: revisa referencia, fechas y notas' using errcode = '22023';
end;
$$;

-- Factura externa (referencia y fecha) y fecha compromiso de un documento vigente.
-- Cambiar la fecha compromiso exige motivo (queda en el documento y en la auditoría).
create function public.update_b2b_billing_batch(
  p_invoice_id uuid,
  p_external_ref text,
  p_external_invoiced_on date,
  p_due_on date,
  p_reason text
) returns public.b2b_invoices
language plpgsql security definer set search_path = '' as $$
declare
  result public.b2b_invoices;
  v_ref text := nullif(btrim(p_external_ref), '');
begin
  perform private.set_change_reason(p_reason);
  select * into result from public.b2b_invoices where id = p_invoice_id for update;
  if not found or not private.b2b_account_billable(result.account_id) then
    raise exception 'Documento inexistente o sin permiso' using errcode = '42501';
  end if;
  if result.status = 'anulada' then
    raise exception 'El documento está anulado' using errcode = 'MG002';
  end if;
  if p_due_on is null or p_due_on < result.issued_on then
    raise exception 'La fecha compromiso no puede ser anterior a la del documento' using errcode = '22023';
  end if;
  if p_external_invoiced_on is not null and v_ref is null then
    raise exception 'La fecha de la factura externa requiere su referencia' using errcode = '22023';
  end if;
  update public.b2b_invoices
     set reference = v_ref,
         external_invoiced_on = case when v_ref is null then null
                                     else coalesce(p_external_invoiced_on, external_invoiced_on,
                                                   private.b2b_account_today(account_id)) end,
         due_on = p_due_on,
         due_on_reason = case when p_due_on is distinct from due_on then btrim(p_reason) else due_on_reason end
   where id = result.id
  returning * into result;
  return result;
exception
  when unique_violation then
    raise exception 'Ya existe un documento de la cuenta con esa referencia de factura' using errcode = 'MG002';
  when check_violation then
    raise exception 'Datos inválidos: referencia de hasta 80 caracteres y motivo de 3 a 500' using errcode = '22023';
end;
$$;

-- Anular un documento libera sus OS; sólo sin pagos aplicados vigentes.
create or replace function public.void_b2b_invoice(p_invoice_id uuid, p_reason text) returns public.b2b_invoices
language plpgsql security definer set search_path = '' as $$
declare
  result public.b2b_invoices;
begin
  perform private.set_change_reason(p_reason);
  select * into result from public.b2b_invoices where id = p_invoice_id for update;
  if not found or not private.b2b_account_billable(result.account_id) then
    raise exception 'Corte inexistente o sin permiso' using errcode = '42501';
  end if;
  if result.status = 'anulada' then
    return result;
  end if;
  if private.b2b_invoice_paid(result.id) > 0 then
    raise exception 'El documento tiene pagos aplicados; anúlalos primero' using errcode = 'MG002';
  end if;
  perform set_config('app.b2b_invoice', 'on', true);
  update public.service_orders set b2b_invoice_id = null where b2b_invoice_id = result.id;
  perform set_config('app.b2b_invoice', 'off', true);
  update public.b2b_invoices set status = 'anulada', void_reason = btrim(p_reason) where id = result.id
  returning * into result;
  return result;
end;
$$;

-- Interfaz de C3 (misma firma): la referencia es la de la factura externa y el
-- periodo, el de las entregas de las OS indicadas.
create or replace function public.create_b2b_invoice(
  p_account_id uuid,
  p_request_id uuid,
  p_reference text,
  p_issued_on date,
  p_order_ids uuid[],
  p_fee_amount numeric,
  p_notes text
) returns public.b2b_invoices
language plpgsql security definer set search_path = '' as $$
declare
  v_from date;
  v_to date;
  today date;
begin
  today := private.b2b_account_today(p_account_id);
  select min((o.delivered_at at time zone c.timezone)::date), max((o.delivered_at at time zone c.timezone)::date)
    into v_from, v_to
    from public.service_orders o join public.detail_centers c on c.id = o.detail_center_id
   where o.id = any (coalesce(p_order_ids, '{}')) and o.b2b_account_id = p_account_id;
  return public.create_b2b_billing_batch(p_account_id, p_request_id, coalesce(v_from, today), coalesce(v_to, today),
    coalesce(p_order_ids, '{}'), p_fee_amount, null, p_reference, p_issued_on, p_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Pagos
-- ---------------------------------------------------------------------------

-- Pago de la cuenta aplicado a uno o varios documentos (o automático). El pago
-- no supera el saldo por cobrar de la cuenta; lo no aplicado queda a favor.
create function public.register_b2b_payment(
  p_account_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_paid_on date,
  p_allocations jsonb default null
) returns public.b2b_payments
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  bal record;
  today date;
  result public.b2b_payments;
begin
  select * into acc from public.b2b_accounts where id = p_account_id for update;
  if not found or not private.can_bill_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso para registrar pagos' using errcode = '42501';
  end if;
  select * into result from public.b2b_payments where organization_id = acc.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  today := private.center_today(acc.home_detail_center_id);
  select * into bal from private.b2b_account_balance(acc.id);
  if p_amount is null or p_amount <= 0 or p_amount > bal.receivable then
    raise exception 'El pago debe ser mayor que 0 y no superar el saldo por cobrar (%)',
      to_char(bal.receivable, 'FM$999,999,990.00') using errcode = 'MG002';
  end if;
  if p_paid_on is not null and p_paid_on > today then
    raise exception 'La fecha del pago no puede ser futura' using errcode = '22023';
  end if;
  perform private.set_change_reason('Pago B2B');
  insert into public.b2b_payments (organization_id, account_id, amount, method, reference, paid_on, request_id)
  values (acc.organization_id, acc.id, round(p_amount, 2), p_method, nullif(btrim(p_reference), ''),
    coalesce(p_paid_on, today), p_request_id)
  returning * into result;
  perform private.b2b_apply_payment(result, p_allocations);
  -- Referencia simple al documento cuando el pago se aplica a uno solo (compatibilidad con C3).
  update public.b2b_payments p
     set invoice_id = (select min(a.invoice_id::text)::uuid from public.b2b_payment_allocations a where a.payment_id = p.id)
   where p.id = result.id
     and (select count(distinct a.invoice_id) from public.b2b_payment_allocations a where a.payment_id = p.id) = 1;
  select * into result from public.b2b_payments where id = result.id;
  return result;
exception
  when check_violation then
    raise exception 'Forma de pago inválida' using errcode = '22023';
end;
$$;

-- Aplicar el saldo a favor de un pago (p. ej. un anticipo) a documentos posteriores.
create function public.allocate_b2b_payment(p_payment_id uuid, p_allocations jsonb default null)
returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  pay public.b2b_payments;
  applied numeric;
begin
  select * into pay from public.b2b_payments where id = p_payment_id;
  if not found or not private.b2b_account_billable(pay.account_id) then
    raise exception 'Pago inexistente o sin permiso' using errcode = '42501';
  end if;
  perform 1 from public.b2b_accounts where id = pay.account_id for update;
  select * into pay from public.b2b_payments where id = p_payment_id for update;
  if pay.voided_at is not null then
    raise exception 'El pago está anulado' using errcode = 'MG002';
  end if;
  if private.b2b_payment_unapplied(pay.id) <= 0 then
    raise exception 'El pago ya está aplicado por completo' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Aplicación de pago B2B');
  applied := private.b2b_apply_payment(pay, p_allocations);
  if applied = 0 then
    raise exception 'No hay documentos con saldo para aplicar el pago' using errcode = 'MG002';
  end if;
  return applied;
end;
$$;

-- Interfaz de C3 (misma firma): con corte, se aplica a ese documento hasta su
-- saldo y el resto en orden; sin corte, en orden de compromiso.
create or replace function public.record_b2b_payment(
  p_account_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_paid_on date,
  p_invoice_id uuid default null
) returns public.b2b_payments
language plpgsql security definer set search_path = '' as $$
declare
  v_open numeric;
  result public.b2b_payments;
begin
  if p_invoice_id is not null then
    if not exists (select 1 from public.b2b_invoices i where i.id = p_invoice_id and i.account_id = p_account_id
                                                          and i.status = 'emitida') then
      raise exception 'Corte inexistente o anulado' using errcode = 'MG002';
    end if;
    select i.amount - private.b2b_invoice_paid(i.id) into v_open from public.b2b_invoices i where i.id = p_invoice_id;
  end if;
  result := public.register_b2b_payment(p_account_id, p_request_id, p_amount, p_method, p_reference, p_paid_on,
    case when coalesce(v_open, 0) > 0
         then jsonb_build_array(jsonb_build_object('invoice_id', p_invoice_id, 'amount', least(v_open, p_amount)))
    end);
  if p_invoice_id is not null and coalesce(v_open, 0) > 0 and private.b2b_payment_unapplied(result.id) > 0 then
    perform private.set_change_reason('Pago B2B');
    perform private.b2b_apply_payment(result, null);
  end if;
  return result;
end;
$$;

-- OS de la cuenta (C3): la columna de factura muestra el folio del documento y,
-- si ya existe, la referencia de la factura externa.
create or replace function public.b2b_account_orders(p_account_id uuid, p_from date, p_to date)
returns table (
  id uuid,
  folio text,
  detail_center_id uuid,
  center_name text,
  status public.service_order_status,
  created_at timestamptz,
  finished_at timestamptz,
  vehicle_label text,
  purchase_order text,
  agreement_name text,
  total numeric,
  cost_total numeric,
  invoice_id uuid,
  invoice_reference text,
  evidence_count integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.b2b_account_visible(p_account_id, false) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  return query
  select o.id, o.folio, o.detail_center_id, c.name, o.status, o.created_at, o.finished_at,
         o.vehicle_make || ' ' || o.vehicle_model || ' · ' || o.vehicle_plate, o.channel_reference, g.name,
         o.total, o.cost_total, o.b2b_invoice_id, i.folio || coalesce(' · ' || i.reference, ''),
         (select count(*)::integer from public.service_order_evidence e
           where e.service_order_id = o.id and e.deleted_at is null)
    from public.service_orders o
    join public.detail_centers c on c.id = o.detail_center_id
    left join public.b2b_agreements g on g.id = o.b2b_agreement_id
    left join public.b2b_invoices i on i.id = o.b2b_invoice_id
   where o.b2b_account_id = p_account_id
     and private.can_read_b2b(o.detail_center_id)
     and (o.created_at at time zone c.timezone)::date between p_from and p_to
   order by o.created_at desc
   limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Consultas (sin datos personales: cuentas empresariales y OS de flotilla)
-- ---------------------------------------------------------------------------

-- Cuentas de los centros gestores pedidos que el usuario puede consultar.
create function private.b2b_receivable_accounts(p_detail_center_ids uuid[], p_account_id uuid default null)
returns setof public.b2b_accounts
language sql stable security definer set search_path = '' as $$
  select a.* from public.b2b_accounts a
   where a.home_detail_center_id = any (p_detail_center_ids)
     and private.can_read_b2b(a.home_detail_center_id)
     and (p_account_id is null or a.id = p_account_id);
$$;

-- Resumen por cuenta: sin agrupar, documentos por estado, saldo a favor y saldo.
-- Traza: saldo = consumo (OS entregadas + cuotas devengadas) − pagos vigentes
--              = sin agrupar + saldo de documentos − saldo a favor.
create function public.b2b_receivables(p_detail_center_ids uuid[])
returns table (
  account_id uuid,
  account_name text,
  home_detail_center_id uuid,
  status text,
  unbilled_orders numeric,
  unbilled_orders_count integer,
  unbilled_fees numeric,
  documents_balance numeric,
  por_facturar numeric,
  facturado_externo numeric,
  parcial numeric,
  vencido numeric,
  unapplied numeric,
  consumption numeric,
  paid numeric,
  balance numeric,
  oldest_unbilled_on date,
  credit_limit numeric
)
language sql stable security definer set search_path = '' as $$
  with acc as (
    select a.*, private.center_today(a.home_detail_center_id) as today
      from private.b2b_receivable_accounts(p_detail_center_ids) a
  ), docs as (
    select i.account_id, i.status, i.amount, private.b2b_invoice_paid(i.id) as paid, i.reference, i.due_on, acc.today
      from public.b2b_invoices i join acc on acc.id = i.account_id
     where i.status = 'emitida'
  ), docs_s as (
    select d.account_id,
           sum(d.amount - d.paid) as balance,
           coalesce(sum(d.amount - d.paid) filter (where s.status = 'por_facturar'), 0) as por_facturar,
           coalesce(sum(d.amount - d.paid) filter (where s.status = 'facturado_externo'), 0) as facturado_externo,
           coalesce(sum(d.amount - d.paid) filter (where s.status = 'parcial'), 0) as parcial,
           coalesce(sum(d.amount - d.paid) filter (where s.status = 'vencido'), 0) as vencido
      from docs d
      cross join lateral (select private.b2b_document_status(d.status, d.amount, d.paid, d.reference, d.due_on, d.today)
                            as status) s
     group by d.account_id
  ), unbilled as (
    select o.b2b_account_id as account_id, sum(o.total) as amount, count(*)::integer as n,
           min((o.delivered_at at time zone c.timezone)::date) as oldest
      from public.service_orders o join public.detail_centers c on c.id = o.detail_center_id
     where o.b2b_account_id in (select id from acc) and o.status = 'entregada' and o.b2b_invoice_id is null
     group by o.b2b_account_id
  ), pays as (
    select p.account_id, sum(private.b2b_payment_unapplied(p.id)) as unapplied
      from public.b2b_payments p where p.account_id in (select id from acc) and p.voided_at is null
     group by p.account_id
  )
  select acc.id, acc.name, acc.home_detail_center_id, acc.status,
         coalesce(u.amount, 0), coalesce(u.n, 0),
         greatest(0, b.fees_accrued - b.fees_invoiced),
         coalesce(d.balance, 0), coalesce(d.por_facturar, 0), coalesce(d.facturado_externo, 0),
         coalesce(d.parcial, 0), coalesce(d.vencido, 0),
         coalesce(p.unapplied, 0),
         b.consumption, b.paid, b.consumption - b.paid,
         u.oldest, b.credit_limit
    from acc
    cross join lateral private.b2b_account_balance(acc.id) b
    left join docs_s d on d.account_id = acc.id
    left join unbilled u on u.account_id = acc.id
    left join pays p on p.account_id = acc.id
   order by b.consumption - b.paid desc, acc.name;
$$;

-- Documentos de cobro con saldo, estado y antigüedad. Por defecto sólo los
-- abiertos; con p_include_closed, también cobrados y anulados emitidos en el rango.
create function public.b2b_billing_documents(
  p_detail_center_ids uuid[],
  p_account_id uuid default null,
  p_include_closed boolean default false,
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  account_id uuid,
  account_name text,
  home_detail_center_id uuid,
  folio text,
  period_from date,
  period_to date,
  issued_on date,
  external_ref text,
  external_invoiced_on date,
  due_on date,
  due_on_reason text,
  orders_amount numeric,
  fee_amount numeric,
  amount numeric,
  paid numeric,
  balance numeric,
  status text,
  age_days integer,
  days_overdue integer,
  orders_count integer,
  notes text,
  void_reason text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select i.id, a.id, a.name, a.home_detail_center_id, i.folio, i.period_from, i.period_to, i.issued_on, i.reference,
         i.external_invoiced_on, i.due_on, i.due_on_reason, i.orders_amount, i.fee_amount, i.amount, x.paid,
         case when i.status = 'anulada' then 0 else i.amount - x.paid end,
         private.b2b_document_status(i.status, i.amount, x.paid, i.reference, i.due_on, x.today),
         (x.today - i.issued_on),
         case when i.status = 'emitida' and i.amount > x.paid then greatest(0, x.today - i.due_on) else 0 end,
         (select count(*)::integer from public.service_orders o where o.b2b_invoice_id = i.id),
         i.notes, i.void_reason, i.created_at
    from private.b2b_receivable_accounts(p_detail_center_ids, p_account_id) a
    join public.b2b_invoices i on i.account_id = a.id
    cross join lateral (select private.b2b_invoice_paid(i.id) as paid,
                               private.center_today(a.home_detail_center_id) as today) x
   where (i.status = 'emitida' and i.amount > x.paid)
      or (p_include_closed and i.issued_on between coalesce(p_from, '2000-01-01') and coalesce(p_to, '2999-12-31'))
   order by i.due_on, i.folio_number
   limit 1000;
$$;

-- OS entregadas sin documento (por agrupar), con antigüedad desde la entrega.
create function public.b2b_unbilled_orders(p_detail_center_ids uuid[], p_account_id uuid default null)
returns table (
  id uuid,
  account_id uuid,
  account_name text,
  folio text,
  detail_center_id uuid,
  center_name text,
  delivered_on date,
  vehicle_label text,
  purchase_order text,
  total numeric,
  age_days integer
)
language sql stable security definer set search_path = '' as $$
  select o.id, a.id, a.name, o.folio, o.detail_center_id, c.name, (o.delivered_at at time zone c.timezone)::date,
         o.vehicle_make || ' ' || o.vehicle_model || ' · ' || o.vehicle_plate, o.channel_reference, o.total,
         (private.center_today(a.home_detail_center_id) - (o.delivered_at at time zone c.timezone)::date)
    from private.b2b_receivable_accounts(p_detail_center_ids, p_account_id) a
    join public.service_orders o on o.b2b_account_id = a.id
    join public.detail_centers c on c.id = o.detail_center_id
   where o.status = 'entregada' and o.b2b_invoice_id is null
   order by o.delivered_at
   limit 1000;
$$;

-- Pagos de la cuenta con lo aplicado, el saldo a favor y sus aplicaciones.
create function public.b2b_account_payments(p_account_id uuid)
returns table (
  id uuid,
  amount numeric,
  method text,
  reference text,
  paid_on date,
  voided_at timestamptz,
  void_reason text,
  applied numeric,
  unapplied numeric,
  allocations jsonb,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.b2b_account_visible(p_account_id, false) then
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
$$;

-- Detalle de un documento: encabezado, OS, cuota y pagos aplicados.
create function public.b2b_billing_document(p_invoice_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.b2b_invoices;
  acc public.b2b_accounts;
  today date;
  v_paid numeric;
begin
  select * into inv from public.b2b_invoices where id = p_invoice_id;
  if not found or not private.b2b_account_visible(inv.account_id, false) then
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
$$;

-- Soporte para el contador / facturación externa: una fila por OS (o cuota) de
-- cada documento emitido en el rango, con los datos fiscales de la cuenta.
create function public.b2b_receivables_export(
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_account_id uuid default null
)
returns table (
  folio text,
  status text,
  account_name text,
  legal_name text,
  rfc text,
  tax_regime text,
  fiscal_zip text,
  billing_email text,
  period_from date,
  period_to date,
  issued_on date,
  external_ref text,
  external_invoiced_on date,
  due_on date,
  line_kind text,
  order_folio text,
  center_name text,
  delivered_on date,
  vehicle_label text,
  purchase_order text,
  line_amount numeric,
  document_amount numeric,
  document_paid numeric,
  document_balance numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Rango inválido (máximo un año)' using errcode = '22023';
  end if;
  return query
  with docs as (
    select i.*, a.name as account_name, a.legal_name, a.rfc, a.tax_regime, a.fiscal_zip, a.billing_email,
           private.b2b_invoice_paid(i.id) as paid, private.center_today(a.home_detail_center_id) as today
      from private.b2b_receivable_accounts(p_detail_center_ids, p_account_id) a
      join public.b2b_invoices i on i.account_id = a.id
     where i.status = 'emitida' and i.issued_on between p_from and p_to
  ), lines as (
    select d.id as doc_id, 'os'::text as kind, o.folio, c.name as center_name,
           (o.delivered_at at time zone c.timezone)::date as delivered_on,
           o.vehicle_make || ' ' || o.vehicle_model || ' · ' || o.vehicle_plate as vehicle, o.channel_reference,
           o.total as amount, o.delivered_at as sort_at
      from docs d join public.service_orders o on o.b2b_invoice_id = d.id
      join public.detail_centers c on c.id = o.detail_center_id
    union all
    select d.id, 'cuota', null, null, null, null, null, d.fee_amount, 'infinity'::timestamptz
      from docs d where d.fee_amount > 0
  )
  select d.folio, private.b2b_document_status(d.status, d.amount, d.paid, d.reference, d.due_on, d.today),
         d.account_name, d.legal_name, d.rfc, d.tax_regime, d.fiscal_zip, d.billing_email,
         d.period_from, d.period_to, d.issued_on, d.reference, d.external_invoiced_on, d.due_on,
         l.kind, l.folio, l.center_name, l.delivered_on, l.vehicle, l.channel_reference, l.amount,
         d.amount, d.paid, d.amount - d.paid
    from docs d join lines l on l.doc_id = d.id
   order by d.folio_number, l.sort_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Permisos de ejecución
-- ---------------------------------------------------------------------------

revoke all on function private.b2b_invoice_paid(uuid), private.b2b_payment_unapplied(uuid),
  private.b2b_document_status(text, numeric, numeric, text, date, date), private.b2b_account_today(uuid),
  private.b2b_apply_payment(public.b2b_payments, jsonb), private.next_b2b_document_number(uuid),
  private.b2b_receivable_accounts(uuid[], uuid), private.forbid_b2b_allocation_changes() from public;
grant execute on function private.b2b_document_status(text, numeric, numeric, text, date, date) to authenticated;

revoke all on function public.create_b2b_billing_batch(uuid, uuid, date, date, uuid[], numeric, date, text, date, text),
  public.update_b2b_billing_batch(uuid, text, date, date, text),
  public.register_b2b_payment(uuid, uuid, numeric, text, text, date, jsonb),
  public.allocate_b2b_payment(uuid, jsonb),
  public.b2b_receivables(uuid[]),
  public.b2b_billing_documents(uuid[], uuid, boolean, date, date),
  public.b2b_unbilled_orders(uuid[], uuid),
  public.b2b_account_payments(uuid),
  public.b2b_billing_document(uuid),
  public.b2b_receivables_export(uuid[], date, date, uuid) from public, anon;
grant execute on function public.create_b2b_billing_batch(uuid, uuid, date, date, uuid[], numeric, date, text, date, text),
  public.update_b2b_billing_batch(uuid, text, date, date, text),
  public.register_b2b_payment(uuid, uuid, numeric, text, text, date, jsonb),
  public.allocate_b2b_payment(uuid, jsonb),
  public.b2b_receivables(uuid[]),
  public.b2b_billing_documents(uuid[], uuid, boolean, date, date),
  public.b2b_unbilled_orders(uuid[], uuid),
  public.b2b_account_payments(uuid),
  public.b2b_billing_document(uuid),
  public.b2b_receivables_export(uuid[], date, date, uuid) to authenticated;
