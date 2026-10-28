-- Recepción ve sólo lo de su trabajo (definición del dueño, 2026-10-28):
--
-- * Cobra desde la OS y la membresía (payments.write, recibo e impresión), pero no
--   ve la cobranza del centro: lista de recibos, cuentas por cobrar, conciliación,
--   hechos por forma de pago ni «Cobrado hoy» / venta del día en Operación del día.
--   Esas lecturas pasan a private.can_list_payments (admin, encargado, contador).
--   Los recibos de una OS o membresía (order_payments, payment_receipt,
--   membership_payments) siguen con private.can_read_payments.
-- * No ve el corte de caja: private.can_read_cash deja de incluir a recepción. El
--   candado de corte cerrado (private.guard_cash_window) es security definer y no
--   depende de este permiso.
-- * Ve las campañas, pero no su dinero: presupuesto, inversión y gasto sólo para
--   quien gestiona marketing o lee métricas comerciales
--   (private.can_read_campaign_money). La columna campaigns.budget deja de leerse
--   directo y campaign_spend sólo la ve quien puede ver el dinero.
--
-- Compatible con el código en producción: mismas firmas y columnas; los valores
-- ocultos llegan en null (budget, delivered_today.total / pending) o en 0 (spend).

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

create function private.can_list_payments(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id,
    array['admin_socio', 'encargado', 'contador']::public.app_role[]);
$$;

create or replace function private.can_read_cash(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_list_payments(p_detail_center_id);
$$;

-- Dinero de campañas: quien las gestiona o lee métricas comerciales (no recepción).
create function private.can_read_campaign_money(p_organization_id uuid, p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_marketing(p_organization_id, p_detail_center_id)
      or private.has_org_role(p_organization_id, array['admin_socio', 'contador']::public.app_role[])
      or exists (
        select 1 from public.detail_centers c
         where c.organization_id = p_organization_id
           and (p_detail_center_id is null or c.id = p_detail_center_id)
           and private.can_read_commercial_metrics(c.id));
$$;

revoke all on function private.can_list_payments(uuid) from public, anon;
revoke all on function private.can_read_campaign_money(uuid, uuid) from public, anon;
grant execute on function private.can_list_payments(uuid) to authenticated;
grant execute on function private.can_read_campaign_money(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cobranza del centro (sin recepción)
-- ---------------------------------------------------------------------------

create or replace function public.list_payments(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  id uuid,
  detail_center_id uuid,
  receipt_folio text,
  received_at timestamptz,
  amount numeric,
  status text,
  client_name text,
  order_folios text,
  methods text,
  received_by_name text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.detail_center_id, p.receipt_folio, p.received_at, p.amount, p.status,
         case when private.can_read_clients(p.detail_center_id) then cl.full_name end,
         (select string_agg(f, ', ' order by f) from (
            select o.folio as f from public.payment_allocations a
              join public.service_orders o on o.id = a.service_order_id where a.payment_id = p.id
            union all
            select mb.number from public.payment_allocations a
              join public.membership_events e on e.id = a.membership_event_id
              join public.memberships mb on mb.id = e.membership_id where a.payment_id = p.id) s),
         (select string_agg(m.name, ' + ' order by m.position) from public.payment_tenders t
            join public.payment_methods m on m.code = t.method where t.payment_id = p.id),
         rb.full_name
    from public.payments p
    join public.detail_centers c on c.id = p.detail_center_id
    left join public.clients cl on cl.id = p.client_id
    left join public.profiles rb on rb.id = p.received_by
   where p.detail_center_id = any (p_detail_center_ids)
     and private.can_list_payments(p.detail_center_id)
     and (p.received_at at time zone c.timezone)::date between p_from and p_to
   order by p.received_at desc
   limit 500;
$$;

create or replace function public.payment_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  day date,
  method text,
  method_name text,
  collects_cash boolean,
  valid_amount numeric,
  valid_count integer,
  reversed_amount numeric,
  reversed_count integer,
  change_amount numeric
)
language sql stable security definer set search_path = '' as $$
  select p.detail_center_id, (p.received_at at time zone c.timezone)::date, t.method, m.name, m.collects_cash,
         coalesce(sum(t.amount) filter (where p.status = 'valido'), 0),
         (count(distinct p.id) filter (where p.status = 'valido'))::integer,
         coalesce(sum(t.amount) filter (where p.status = 'revertido'), 0),
         (count(distinct p.id) filter (where p.status = 'revertido'))::integer,
         coalesce(sum(p.change_amount) filter (where p.status = 'valido' and m.allows_change), 0)
    from public.payments p
    join public.detail_centers c on c.id = p.detail_center_id
    join public.payment_tenders t on t.payment_id = p.id
    join public.payment_methods m on m.code = t.method
   where p.detail_center_id = any (p_detail_center_ids)
     and private.can_list_payments(p.detail_center_id)
     and (p.received_at at time zone c.timezone)::date between p_from and p_to
   group by p.detail_center_id, (p.received_at at time zone c.timezone)::date, t.method, m.name, m.collects_cash
   order by 2, 1, min(m.position);
$$;

create or replace function public.receivable_orders(p_detail_center_ids uuid[])
returns table (
  id uuid,
  detail_center_id uuid,
  folio text,
  client_name text,
  channel public.sales_channel,
  status public.service_order_status,
  b2b_account_id uuid,
  total numeric,
  paid_amount numeric,
  balance numeric,
  payment_status text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.detail_center_id, o.folio,
         case when private.can_read_clients(o.detail_center_id) then o.client_name end, o.channel, o.status, o.b2b_account_id, o.total,
         o.paid_amount, o.total - o.paid_amount, o.payment_status, o.created_at
    from public.service_orders o
   where o.detail_center_id = any (p_detail_center_ids)
     and private.can_list_payments(o.detail_center_id)
     and o.status not in ('abierta', 'cancelada')
     and o.paid_amount < o.total
   order by o.created_at
   limit 500;
$$;

create or replace function public.sales_reconciliation(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  delivered_orders integer,
  sales_total numeric,
  collected_for_sales numeric,
  pending_for_sales numeric,
  collected_in_range numeric,
  cash_in_range numeric,
  reversed_in_range numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_list_payments(c.id)
  ), sales as (
    select o.detail_center_id, count(*)::integer as n, sum(o.total) as total, sum(o.paid_amount) as paid
      from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
     group by o.detail_center_id
  ), coll as (
    select p.detail_center_id,
           sum(t.amount) filter (where p.status = 'valido') as valid,
           sum(t.amount) filter (where p.status = 'valido' and m.collects_cash) as cash,
           sum(t.amount) filter (where p.status = 'revertido') as reversed
      from public.payments p join centers c on c.id = p.detail_center_id
      join public.payment_tenders t on t.payment_id = p.id
      join public.payment_methods m on m.code = t.method
     where (p.received_at at time zone c.timezone)::date between p_from and p_to
     group by p.detail_center_id
  )
  select c.id, coalesce(s.n, 0), coalesce(s.total, 0), coalesce(s.paid, 0),
         coalesce(s.total, 0) - coalesce(s.paid, 0),
         coalesce(k.valid, 0), coalesce(k.cash, 0), coalesce(k.reversed, 0)
    from centers c
    left join sales s on s.detail_center_id = c.id
    left join coll k on k.detail_center_id = c.id
   order by c.id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Operación del día: sin venta ni cobrado para recepción
-- ---------------------------------------------------------------------------

create or replace function public.center_day_summary(p_detail_center_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text;
  day date;
  day_from timestamptz;
  day_to timestamptz;
  orders jsonb;
  agenda jsonb;
  payments jsonb;
  can_money boolean;
begin
  select c.timezone into tz from public.detail_centers c where c.id = p_detail_center_id;
  if tz is null or not private.has_center_role(p_detail_center_id) then
    raise exception 'Centro inexistente o sin acceso' using errcode = '42501';
  end if;
  day := private.center_today(p_detail_center_id);
  can_money := private.can_list_payments(p_detail_center_id);
  day_from := day::timestamp at time zone tz;
  day_to := (day + 1)::timestamp at time zone tz;

  if private.can_use_orders(p_detail_center_id) then
    select jsonb_build_object(
      'by_status', coalesce((
        select jsonb_object_agg(s.status, s.n) from (
          select o.status::text as status, count(*) as n from public.service_orders o
           where o.detail_center_id = p_detail_center_id
             and o.status in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada')
           group by o.status) s), '{}'::jsonb),
      'active', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.rank, a.created_at) from (
          select o.id, o.folio, o.status::text as status, o.client_name,
                 concat_ws(' · ', concat_ws(' ', o.vehicle_make, o.vehicle_model), o.vehicle_plate) as vehicle,
                 o.total, o.paid_amount, o.promised_at, o.created_at, b.name as bay_name, t.full_name as technician_name,
                 array_position(array['terminada', 'en_proceso', 'pausada', 'autorizada', 'abierta'], o.status::text) as rank
            from public.service_orders o
            left join public.bays b on b.id = o.bay_id
            left join public.technicians t on t.id = o.technician_id
           where o.detail_center_id = p_detail_center_id
             and o.status in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada')
           order by rank, o.created_at
           limit 50) a), '[]'::jsonb),
      'delivered_today', (
        select jsonb_build_object('count', count(*),
                                  'total', case when can_money then coalesce(sum(o.total), 0) end,
                                  'pending', case when can_money then coalesce(sum(greatest(o.total - o.paid_amount, 0)), 0) end)
          from public.service_orders o
         where o.detail_center_id = p_detail_center_id and o.status = 'entregada'
           and o.delivered_at >= day_from and o.delivered_at < day_to),
      'opened_today', (
        select count(*) from public.service_orders o
         where o.detail_center_id = p_detail_center_id and o.created_at >= day_from and o.created_at < day_to)
    ) into orders;
  end if;

  if private.can_use_agenda(p_detail_center_id) then
    select jsonb_build_object(
      'by_status', coalesce((
        select jsonb_object_agg(s.status, s.n) from (
          select a.status::text as status, count(*) as n from public.appointments a
           where a.detail_center_id = p_detail_center_id and a.starts_at >= day_from and a.starts_at < day_to
           group by a.status) s), '{}'::jsonb),
      'upcoming', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
          select a.id, a.starts_at, a.status::text as status, c.full_name as client_name,
                 concat_ws(' · ', concat_ws(' ', v.make, v.model), v.plate) as vehicle, b.name as bay_name
            from public.appointments a
            join public.clients c on c.id = a.client_id
            join public.vehicles v on v.id = a.vehicle_id
            left join public.bays b on b.id = a.bay_id
           where a.detail_center_id = p_detail_center_id and a.starts_at >= day_from and a.starts_at < day_to
             and a.status in ('programada', 'recibida')
           order by a.starts_at
           limit 20) x), '[]'::jsonb)
    ) into agenda;
  end if;

  if can_money then
    select jsonb_build_object(
      'count', count(*), 'total', coalesce(sum(p.amount), 0)
    ) into payments
      from public.payments p
     where p.detail_center_id = p_detail_center_id and p.status = 'valido'
       and p.received_at >= day_from and p.received_at < day_to;
  end if;

  return jsonb_build_object('day', day, 'orders', orders, 'agenda', agenda, 'payments', payments);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Campañas: presupuesto e inversión sólo con private.can_read_campaign_money
-- ---------------------------------------------------------------------------

create or replace function public.list_campaigns(p_organization_id uuid, p_id uuid default null)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  name text,
  objective text,
  channels text[],
  starts_on date,
  ends_on date,
  budget numeric,
  status text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_url text,
  notes text,
  spend numeric,
  leads integer,
  promotions integer,
  posts integer,
  version integer,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.detail_center_id, dc.name, c.name, c.objective, c.channels, c.starts_on, c.ends_on,
         case when private.can_read_campaign_money(c.organization_id, c.detail_center_id) then c.budget end, c.status,
         c.utm_source, c.utm_medium, c.utm_campaign, c.landing_url, c.notes,
         case when private.can_read_campaign_money(c.organization_id, c.detail_center_id)
              then coalesce((select sum(s.amount) from public.campaign_spend s
                              where s.campaign_id = c.id and s.voided_at is null), 0)
              else 0 end,
         (select count(*)::integer from public.leads l where l.campaign_id = c.id),
         (select count(*)::integer from public.promotions p where p.campaign_id = c.id),
         (select count(*)::integer from public.content_posts p where p.campaign_id = c.id and p.status <> 'cancelada'),
         c.version, private.can_manage_marketing(c.organization_id, c.detail_center_id)
    from public.campaigns c
    left join public.detail_centers dc on dc.id = c.detail_center_id
   where c.organization_id = p_organization_id
     and (p_id is null or c.id = p_id)
     and private.can_read_marketing(c.organization_id, c.detail_center_id)
   order by c.starts_on desc, c.name;
$$;

create or replace function public.campaign_spend_entries(p_campaign_id uuid)
returns table (
  id uuid,
  spent_on date,
  amount numeric,
  channel text,
  expense_id uuid,
  expense_folio text,
  note text,
  voided_at timestamptz,
  void_reason text,
  created_by_name text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.spent_on, s.amount, s.channel, s.expense_id, e.folio, s.note, s.voided_at, s.void_reason,
         (select p.full_name from public.profiles p where p.id = s.created_by)
    from public.campaign_spend s
    join public.campaigns c on c.id = s.campaign_id
    left join public.expenses e on e.id = s.expense_id
   where s.campaign_id = p_campaign_id
     and private.can_read_campaign_money(c.organization_id, c.detail_center_id)
   order by s.spent_on desc, s.created_at desc;
$$;

-- Lectura directa de tablas: el gasto sólo con permiso de dinero y la columna
-- budget sólo por list_campaigns (que la filtra).
drop policy campaign_spend_select on public.campaign_spend;
create policy campaign_spend_select on public.campaign_spend
  for select to authenticated using (
    exists (select 1 from public.campaigns c
             where c.id = campaign_id and private.can_read_campaign_money(c.organization_id, c.detail_center_id)));

revoke select on public.campaigns from authenticated;
grant select (id, organization_id, detail_center_id, name, objective, channels, starts_on, ends_on, status,
              utm_source, utm_medium, utm_campaign, landing_url, notes, version, created_by, created_at, updated_at)
  on public.campaigns to authenticated;
