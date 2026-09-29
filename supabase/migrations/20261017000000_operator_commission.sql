-- CR1 — Servicios adicionales: pago al operador como % del precio.
--
-- "Lavado manual detallado" (y cualquier servicio que se configure así) paga al
-- operador un porcentaje del precio de venta. El porcentaje es editable por
-- servicio (y, opcionalmente, por centro); no hay valor fijo.
--
-- * Catálogo: services.operator_commission_pct (null = el servicio no paga
--   porcentaje) y service_center_config.operator_commission_pct_override
--   (null = usa el del servicio). Cada cambio queda en service_price_history
--   con su motivo.
-- * Cada línea de OS congela el porcentaje vigente al venderse
--   (operator_commission_pct) y calcula el pago (operator_commission_amount):
--     pago = redondeo(precio aplicado de la línea × % ÷ 100, 2)
--   Base del porcentaje = precio aplicado de la línea: cantidad × precio
--   unitario congelado − descuentos de esa línea (incluido el de membresía), con
--   IVA incluido como todos los importes del proyecto. El descuento general de
--   la OS (no ligado a una línea) no reduce la base. Si después cambian el
--   precio o el porcentaje del catálogo, las líneas ya vendidas no cambian.
-- * El operador es el técnico de la línea (service_order_items.technician_id).
-- * Costo: la OS suma el pago al operador a su costo directo (cost_total =
--   costo estándar + pago al operador). El costo estándar del servicio son los
--   OTROS costos directos (productos y consumibles): para un servicio con
--   porcentaje no debe incluir mano de obra (se evita duplicarla).
-- * P&L: renglón propio "Pago a operadores" dentro del costo directo (por
--   motor); entra en la utilidad bruta y en el margen de contribución. El margen
--   de contribución no es utilidad neta: faltan gastos de personal y operativos.
-- * Ventas por servicio (D3): el margen por servicio resta también el pago al
--   operador.

-- ---------------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------------

alter table public.services
  add column operator_commission_pct numeric(5, 2)
    check (operator_commission_pct is null or operator_commission_pct between 0 and 100);
alter table public.service_center_config
  add column operator_commission_pct_override numeric(5, 2)
    check (operator_commission_pct_override is null or operator_commission_pct_override between 0 and 100);
alter table public.service_price_history add column operator_commission_pct numeric(5, 2);

comment on column public.services.operator_commission_pct is
  'Pago al operador como % del precio aplicado de cada línea (null = sin porcentaje). El costo estándar es sin mano de obra.';

-- Historial de precio, costo y % del operador (base y por centro).
create or replace function private.record_service_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'services' then
    if tg_op = 'INSERT'
       or new.base_price is distinct from old.base_price
       or new.standard_direct_cost is distinct from old.standard_direct_cost
       or new.operator_commission_pct is distinct from old.operator_commission_pct then
      insert into public.service_price_history
        (organization_id, service_id, price, direct_cost, operator_commission_pct, reason)
      values (new.organization_id, new.id, new.base_price, new.standard_direct_cost, new.operator_commission_pct,
              nullif(current_setting('app.change_reason', true), ''));
    end if;
  elsif tg_op = 'INSERT'
     or new.price_override is distinct from old.price_override
     or new.direct_cost_override is distinct from old.direct_cost_override
     or new.operator_commission_pct_override is distinct from old.operator_commission_pct_override then
    if tg_op = 'INSERT' and new.price_override is null and new.direct_cost_override is null
       and new.operator_commission_pct_override is null then
      return null;
    end if;
    insert into public.service_price_history
      (organization_id, service_id, detail_center_id, price, direct_cost, operator_commission_pct, reason)
    values (new.organization_id, new.service_id, new.detail_center_id, new.price_override,
            new.direct_cost_override, new.operator_commission_pct_override,
            nullif(current_setting('app.change_reason', true), ''));
  end if;
  return null;
end;
$$;

drop function public.create_service(uuid, text, text, text, public.revenue_engine, integer, numeric, numeric, text);
create function public.create_service(
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_revenue_engine public.revenue_engine,
  p_standard_duration_minutes integer,
  p_base_price numeric,
  p_standard_direct_cost numeric,
  p_reason text default 'Alta de servicio',
  p_operator_commission_pct numeric default null
) returns public.services
language plpgsql security invoker set search_path = '' as $$
declare
  result public.services;
begin
  perform private.set_change_reason(p_reason);
  insert into public.services (
    organization_id, code, name, description, revenue_engine, standard_duration_minutes,
    base_price, standard_direct_cost, operator_commission_pct
  ) values (
    p_organization_id, upper(btrim(p_code)), regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
    nullif(btrim(p_description), ''), p_revenue_engine, p_standard_duration_minutes,
    p_base_price, p_standard_direct_cost, p_operator_commission_pct
  )
  returning * into result;
  return result;
end;
$$;

-- Edición: p_operator_commission_pct null = el servicio no paga porcentaje.
drop function public.update_service(uuid, text, text, public.revenue_engine, integer, numeric, numeric, boolean, text);
create function public.update_service(
  p_id uuid,
  p_name text,
  p_description text,
  p_revenue_engine public.revenue_engine,
  p_standard_duration_minutes integer,
  p_base_price numeric,
  p_standard_direct_cost numeric,
  p_active boolean,
  p_reason text,
  p_operator_commission_pct numeric default null
) returns public.services
language plpgsql security invoker set search_path = '' as $$
declare
  result public.services;
begin
  perform private.set_change_reason(p_reason);
  update public.services
     set name = regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
         description = nullif(btrim(p_description), ''),
         revenue_engine = p_revenue_engine,
         standard_duration_minutes = p_standard_duration_minutes,
         base_price = p_base_price,
         standard_direct_cost = p_standard_direct_cost,
         operator_commission_pct = p_operator_commission_pct,
         active = coalesce(p_active, active)
   where id = p_id
  returning * into result;
  if not found then
    raise exception 'Servicio inexistente o sin permiso para editarlo' using errcode = '42501';
  end if;
  return result;
end;
$$;

drop function public.set_service_center_config(uuid, uuid, boolean, numeric, numeric, text);
create function public.set_service_center_config(
  p_detail_center_id uuid,
  p_service_id uuid,
  p_available boolean,
  p_price_override numeric,
  p_direct_cost_override numeric,
  p_reason text,
  p_operator_commission_pct_override numeric default null
) returns public.service_center_config
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
  result public.service_center_config;
begin
  perform private.set_change_reason(p_reason);
  if not private.can_manage_center_catalog(p_detail_center_id) then
    raise exception 'Sin permiso para configurar el catálogo de este centro' using errcode = '42501';
  end if;
  select s.organization_id into org from public.services s where s.id = p_service_id;
  if org is null then
    raise exception 'Servicio inexistente' using errcode = '22023';
  end if;
  insert into public.service_center_config
    (organization_id, detail_center_id, service_id, available, price_override, direct_cost_override,
     operator_commission_pct_override)
  values (org, p_detail_center_id, p_service_id, coalesce(p_available, true), p_price_override, p_direct_cost_override,
          p_operator_commission_pct_override)
  on conflict (detail_center_id, service_id) do update
    set available = excluded.available,
        price_override = excluded.price_override,
        direct_cost_override = excluded.direct_cost_override,
        operator_commission_pct_override = excluded.operator_commission_pct_override
  returning * into result;
  return result;
end;
$$;

drop function public.center_catalog(uuid, public.revenue_engine, boolean);
create function public.center_catalog(
  p_detail_center_id uuid,
  p_revenue_engine public.revenue_engine default null,
  p_include_inactive boolean default false
)
returns table (
  id uuid,
  code text,
  name text,
  description text,
  revenue_engine public.revenue_engine,
  standard_duration_minutes integer,
  base_price numeric,
  standard_direct_cost numeric,
  price numeric,
  direct_cost numeric,
  price_source text,
  available boolean,
  active boolean,
  base_operator_commission_pct numeric,
  operator_commission_pct numeric
)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.code, s.name, s.description, s.revenue_engine, s.standard_duration_minutes,
         s.base_price, s.standard_direct_cost,
         coalesce(cfg.price_override, s.base_price),
         coalesce(cfg.direct_cost_override, s.standard_direct_cost),
         case when cfg.price_override is not null or cfg.direct_cost_override is not null
                or cfg.operator_commission_pct_override is not null then 'center' else 'base' end,
         coalesce(cfg.available, true),
         s.active,
         s.operator_commission_pct,
         coalesce(cfg.operator_commission_pct_override, s.operator_commission_pct)
  from public.detail_centers dc
  join public.services s on s.organization_id = dc.organization_id
  left join public.service_center_config cfg on cfg.detail_center_id = dc.id and cfg.service_id = s.id
  where dc.id = p_detail_center_id
    and private.has_center_role(dc.id)
    and (p_revenue_engine is null or s.revenue_engine = p_revenue_engine)
    and (coalesce(p_include_inactive, false) or (s.active and coalesce(cfg.available, true)))
  order by s.revenue_engine, s.name;
$$;

-- ---------------------------------------------------------------------------
-- 2. Línea de OS: % congelado y pago calculado
-- ---------------------------------------------------------------------------

alter table public.service_order_items
  add column operator_commission_pct numeric(5, 2)
    check (operator_commission_pct is null or operator_commission_pct between 0 and 100),
  add column operator_commission_amount numeric(12, 2) generated always as (
    greatest(round((quantity * unit_price - line_discount) * coalesce(operator_commission_pct, 0) / 100, 2), 0)
  ) stored;

-- % vigente del servicio en el centro de la OS (el del centro pisa al base).
create function private.service_commission_pct(p_service_id uuid, p_detail_center_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(cfg.operator_commission_pct_override, s.operator_commission_pct)
    from public.services s
    left join public.service_center_config cfg on cfg.service_id = s.id and cfg.detail_center_id = p_detail_center_id
   where s.id = p_service_id;
$$;

-- Al venderse, toda línea (walk-in, cita, B2B, recomendación) congela el %
-- vigente del catálogo; el cliente no lo fija.
create function private.freeze_operator_commission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.operator_commission_pct := private.service_commission_pct(
    new.service_id, (select o.detail_center_id from public.service_orders o where o.id = new.service_order_id));
  return new;
end;
$$;
create trigger service_order_items_freeze_commission before insert on public.service_order_items
  for each row execute function private.freeze_operator_commission();

-- Precio, costo, % del operador, duración, motor, precio de lista y regla del convenio quedan congelados.
create or replace function private.keep_service_order_item_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.service_order_id, new.kind, new.service_id, new.service_code, new.service_name,
      new.revenue_engine, new.unit_price, new.unit_direct_cost, new.duration_minutes, new.price_source,
      new.list_unit_price, new.b2b_price_rule_id, new.operator_commission_pct)
     is distinct from
     (old.organization_id, old.service_order_id, old.kind, old.service_id, old.service_code, old.service_name,
      old.revenue_engine, old.unit_price, old.unit_direct_cost, old.duration_minutes, old.price_source,
      old.list_unit_price, old.b2b_price_rule_id, old.operator_commission_pct) then
    raise exception 'El precio y los datos congelados de una línea no cambian' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Totales: el costo de la OS suma el pago al operador de cada línea.
create or replace function private.recalc_service_order(p_order_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_subtotal numeric(12, 2);
  v_line_discount numeric(12, 2);
  v_order_discount numeric(12, 2);
  v_cost numeric(12, 2);
  v_minutes integer;
begin
  update public.service_order_discounts d
     set amount = case when d.kind = 'percent' then round(i.line_subtotal * d.value / 100, 2) else d.value end
    from public.service_order_items i
   where d.service_order_id = p_order_id and d.item_id = i.id and d.voided_at is null
     and d.amount is distinct from
         case when d.kind = 'percent' then round(i.line_subtotal * d.value / 100, 2) else d.value end;

  update public.service_order_items i
     set line_discount = x.discount
    from (
      select it.id, least(it.line_subtotal, coalesce(sum(d.amount) filter (where d.voided_at is null), 0)) as discount
      from public.service_order_items it
      left join public.service_order_discounts d on d.item_id = it.id
      where it.service_order_id = p_order_id
      group by it.id, it.line_subtotal
    ) x
   where i.id = x.id and i.line_discount is distinct from x.discount;

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_discount), 0),
         coalesce(sum(round(quantity * unit_direct_cost, 2) + operator_commission_amount), 0),
         coalesce(sum(quantity * duration_minutes), 0)
    into v_subtotal, v_line_discount, v_cost, v_minutes
    from public.service_order_items where service_order_id = p_order_id;

  update public.service_order_discounts d
     set amount = case when d.kind = 'percent' then round((v_subtotal - v_line_discount) * d.value / 100, 2)
                       else d.value end
   where d.service_order_id = p_order_id and d.item_id is null and d.voided_at is null
     and d.amount is distinct from
         case when d.kind = 'percent' then round((v_subtotal - v_line_discount) * d.value / 100, 2) else d.value end;

  select least(v_subtotal - v_line_discount, coalesce(sum(amount), 0)) into v_order_discount
    from public.service_order_discounts
   where service_order_id = p_order_id and item_id is null and voided_at is null;

  update public.service_orders
     set subtotal = v_subtotal,
         discount_total = v_line_discount + v_order_discount,
         total = v_subtotal - v_line_discount - v_order_discount,
         cost_total = v_cost,
         estimated_minutes = v_minutes
   where id = p_order_id
     and (subtotal, discount_total, total, cost_total, estimated_minutes)
         is distinct from (v_subtotal, v_line_discount + v_order_discount,
                           v_subtotal - v_line_discount - v_order_discount, v_cost, v_minutes);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. P&L: renglón "Pago a operadores" dentro del costo directo
-- ---------------------------------------------------------------------------

create or replace function private.pnl_movements(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  section text,
  line text,
  dimension text,
  source text,
  source_id uuid,
  reference text,
  occurred_on date,
  description text,
  amount numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
  ), delivered as (
    select o.id, o.detail_center_id, o.folio, o.channel::text as channel, o.total,
           (o.delivered_at at time zone c.timezone)::date as day
      from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
  )
  -- Ventas de OS: neto de cada línea (subtotal − descuentos de la línea), por motor.
  select d.detail_center_id, 'ingreso', d.channel, i.revenue_engine::text, 'service_orders', d.id, d.folio, d.day,
         i.service_name || ' × ' || i.quantity, i.line_subtotal - i.line_discount
    from delivered d join public.service_order_items i on i.service_order_id = d.id
  union all
  -- Descuento general de la OS (no ligado a una línea): cuadra el canal con el total.
  select d.detail_center_id, 'ingreso', d.channel, 'descuento_os', 'service_orders', d.id, d.folio, d.day,
         'Descuento general de la OS', d.total - x.net
    from delivered d
    cross join lateral (select coalesce(sum(i.line_subtotal - i.line_discount), 0) as net
                          from public.service_order_items i where i.service_order_id = d.id) x
   where d.total <> x.net
  union all
  -- Venta de membresías: altas y renovaciones cobradas.
  select m.detail_center_id, 'ingreso', 'membresias', 'membresia', 'memberships', m.membership_id, ms.number,
         (m.occurred_at at time zone c.timezone)::date,
         case m.kind when 'alta' then 'Alta' else 'Renovación' end || coalesce(' · ' || m.plan_code, ''), m.amount
    from public.membership_events m
    join centers c on c.id = m.detail_center_id
    join public.memberships ms on ms.id = m.membership_id
   where m.kind in ('alta', 'renovacion') and coalesce(m.amount, 0) > 0
     and (m.occurred_at at time zone c.timezone)::date between p_from and p_to
  union all
  -- Cuotas B2B devengadas (mismo criterio que private.b2b_fee_accrued), en el centro gestor.
  select a.home_detail_center_id, 'ingreso', 'cuotas_b2b', 'cuota_b2b', 'b2b_agreements', g.id, a.name, f.day,
         g.name || case g.billing_model when 'paquete' then ' · paquete' else ' · iguala mensual' end, g.fee_amount
    from public.b2b_agreements g
    join public.b2b_accounts a on a.id = g.account_id
    join centers c on c.id = a.home_detail_center_id
    cross join lateral (
      select private.add_months(g.starts_on, k) as day
        from generate_series(0, case g.billing_model when 'iguala' then 1200 else 0 end) k
    ) f
   where g.billing_model in ('paquete', 'iguala') and g.fee_amount is not null
     and f.day between p_from and least(p_to, private.center_today(c.id))
     and (g.billing_model = 'paquete' or f.day <= g.ends_on)
  union all
  -- Costo estándar congelado de las líneas de las OS entregadas.
  select d.detail_center_id, 'costo_directo', 'estandar', i.revenue_engine::text, 'service_orders', d.id, d.folio,
         d.day, i.service_name || ' × ' || i.quantity, round(i.quantity * i.unit_direct_cost, 2)
    from delivered d join public.service_order_items i on i.service_order_id = d.id
   where i.unit_direct_cost > 0
  union all
  -- Pago al operador (CR1): % del precio aplicado de la línea, congelado en la OS.
  select d.detail_center_id, 'costo_directo', 'pago_operador', i.revenue_engine::text, 'service_orders', d.id, d.folio,
         d.day, i.service_name || ' × ' || i.quantity || ' · ' || i.operator_commission_pct || ' %', i.operator_commission_amount
    from delivered d join public.service_order_items i on i.service_order_id = d.id
   where i.operator_commission_amount > 0
  union all
  -- Variación real de insumos registrada en la ejecución de esas OS.
  select d.detail_center_id, 'costo_directo', 'variacion_insumos', null, 'service_orders', d.id, d.folio, d.day,
         inv.name || ' ' || k.actual_quantity || ' vs ' || k.standard_quantity || ' ' || k.unit,
         round((k.actual_quantity - k.standard_quantity) * k.unit_cost, 2)
    from delivered d
    join public.service_order_consumptions k on k.service_order_id = d.id
    join public.inventory_items inv on inv.id = k.inventory_item_id
   where k.actual_quantity <> k.standard_quantity
  union all
  -- Egresos aprobados (por grupo del P&L congelado) y pendientes (fuera del P&L).
  select e.detail_center_id,
         case when e.status = 'pendiente' or e.pnl_group = 'insumos' then 'fuera_pnl'
              when e.pnl_group = 'costo_directo' then 'costo_directo' else 'gasto' end,
         case when e.status = 'pendiente' then 'pendiente'
              when e.pnl_group = 'costo_directo' then 'egresos_costo_directo' else e.pnl_group end,
         case when e.status = 'pendiente' then e.pnl_group end,
         'expenses', e.id, e.folio, e.paid_on,
         e.concept || coalesce(' · ' || v.name, ''), e.amount
    from public.expenses e
    join centers c on c.id = e.detail_center_id
    left join public.vendors v on v.id = e.vendor_id
   where e.status in ('aprobado', 'pendiente') and e.paid_on between p_from and p_to;
$$;


-- ---------------------------------------------------------------------------
-- 4. Ventas por servicio (D3) con el pago al operador
-- ---------------------------------------------------------------------------

drop function public.corporate_order_lines(uuid[], date, date, text, text, uuid);
drop function private.order_line_facts(uuid[], date, date);

create function private.order_line_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  service_order_id uuid,
  folio text,
  delivered_on date,
  channel text,
  engine text,
  service_id uuid,
  service_name text,
  kind text,
  quantity integer,
  revenue numeric,
  standard_cost numeric,
  operator_pct numeric,
  operator_pay numeric,
  technician_id uuid
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
  ), delivered as (
    select o.id, o.detail_center_id, o.folio, o.channel::text as channel, o.total, o.technician_id,
           (o.delivered_at at time zone c.timezone)::date as day
      from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
  )
  -- Cada línea: neto, costo estándar (otros costos directos) y pago al operador congelados.
  select d.detail_center_id, d.id, d.folio, d.day, d.channel, i.revenue_engine::text, i.service_id,
         i.service_name, i.kind, i.quantity, i.line_subtotal - i.line_discount,
         round(i.quantity * i.unit_direct_cost, 2), i.operator_commission_pct, i.operator_commission_amount,
         coalesce(i.technician_id, d.technician_id)
    from delivered d join public.service_order_items i on i.service_order_id = d.id
  union all
  -- Descuento general de la OS (no ligado a una línea), igual que en el P&L.
  select d.detail_center_id, d.id, d.folio, d.day, d.channel, 'descuento_os', null,
         'Descuento general de la OS', 'descuento', 0, d.total - x.net, 0, null, 0, null
    from delivered d
    cross join lateral (select coalesce(sum(i.line_subtotal - i.line_discount), 0) as net
                          from public.service_order_items i where i.service_order_id = d.id) x
   where d.total <> x.net;
$$;

create function public.corporate_order_lines(
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_channel text default null,
  p_engine text default null,
  p_service_id uuid default null
) returns table (
  detail_center_id uuid,
  service_order_id uuid,
  folio text,
  delivered_on date,
  channel text,
  engine text,
  service_id uuid,
  service_name text,
  kind text,
  quantity integer,
  revenue numeric,
  standard_cost numeric,
  operator_pct numeric,
  operator_pay numeric,
  technician_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_pnl_range(p_from, p_to);
  if p_detail_center_ids is null or cardinality(p_detail_center_ids) not between 1 and 50 then
    raise exception 'Elige de 1 a 50 centros' using errcode = '22023';
  end if;
  return query
    select l.detail_center_id, l.service_order_id, l.folio, l.delivered_on, l.channel, l.engine, l.service_id,
           l.service_name, l.kind, l.quantity, l.revenue, l.standard_cost, l.operator_pct, l.operator_pay,
           t.full_name
      from private.order_line_facts(p_detail_center_ids, p_from, p_to) l
      left join public.technicians t on t.id = l.technician_id
     where (p_channel is null or l.channel = p_channel)
       and (p_engine is null or l.engine = p_engine)
       and (p_service_id is null or l.service_id = p_service_id)
     order by l.delivered_on, l.folio, l.service_name
     limit 5000;
end;
$$;

create or replace function public.dashboard_facts(
  p_sources text[],
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_grain text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform private.check_pnl_range(p_from, p_to);
  if p_grain is null or p_grain not in ('total', 'dia', 'semana', 'mes') then
    raise exception 'Periodicidad inválida' using errcode = '22023';
  end if;
  if p_grain = 'dia' and p_to - p_from > 92 then
    raise exception 'La serie diaria admite hasta 93 días; usa semanas o meses' using errcode = '22023';
  end if;
  if p_sources is null or cardinality(p_sources) = 0
     or not (p_sources <@ array['pnl', 'payments', 'pipeline', 'memberships', 'orders', 'upsell', 'customers',
                                 'services']) then
    raise exception 'Fuente de métricas inválida' using errcode = '22023';
  end if;
  if p_detail_center_ids is null or cardinality(p_detail_center_ids) not between 1 and 50 then
    raise exception 'Elige de 1 a 50 centros' using errcode = '22023';
  end if;

  result := jsonb_build_object('from', p_from, 'to', p_to, 'grain', p_grain);
  if 'pnl' = any (p_sources) then
    result := result || jsonb_build_object('pnl', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'section', x.section, 'line', x.line,
               'dimension', x.dimension, 'amount', x.amount, 'movements', x.movements)
             order by x.bucket, x.detail_center_id, x.section, x.line, x.dimension)
        from (select m.detail_center_id, private.dashboard_bucket(m.occurred_on, p_from, p_grain) as bucket,
                     m.section, m.line, m.dimension, sum(m.amount) as amount, count(*)::integer as movements
                from private.pnl_movements(p_detail_center_ids, p_from, p_to) m
               group by 1, 2, 3, 4, 5) x), '[]'::jsonb));
  end if;
  if 'payments' = any (p_sources) then
    result := result || jsonb_build_object('payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'method', x.method,
               'method_name', x.method_name, 'collects_cash', x.collects_cash, 'valid_amount', x.valid_amount,
               'valid_count', x.valid_count, 'reversed_amount', x.reversed_amount,
               'reversed_count', x.reversed_count, 'change_amount', x.change_amount)
             order by x.bucket, x.detail_center_id, x.method)
        from (select f.detail_center_id, private.dashboard_bucket(f.day, p_from, p_grain) as bucket, f.method,
                     f.method_name, f.collects_cash, sum(f.valid_amount) as valid_amount,
                     sum(f.valid_count)::integer as valid_count, sum(f.reversed_amount) as reversed_amount,
                     sum(f.reversed_count)::integer as reversed_count, sum(f.change_amount) as change_amount
                from public.payment_facts(p_detail_center_ids, p_from, p_to) f
               group by 1, 2, 3, 4, 5) x), '[]'::jsonb));
  end if;
  if 'pipeline' = any (p_sources) then
    result := result || jsonb_build_object(
      'pipeline', coalesce((select jsonb_agg(to_jsonb(f)) from public.pipeline_metric_facts(p_detail_center_ids, p_from, p_to) f), '[]'::jsonb),
      'pipeline_stages', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'position', s.position,
                                            'probability', s.probability) order by s.position)
          from public.pipeline_stages s
         where s.active
           and s.organization_id in (select c.organization_id from public.detail_centers c
                                      where c.id = any (p_detail_center_ids)
                                        and private.can_read_pipeline_metrics(c.id))), '[]'::jsonb));
  end if;
  if 'memberships' = any (p_sources) then
    result := result || jsonb_build_object('memberships', coalesce((
      select jsonb_agg(to_jsonb(f) - 'membership_id')
        from public.membership_metric_facts(p_detail_center_ids, p_from, p_to) f), '[]'::jsonb));
  end if;
  if 'orders' = any (p_sources) then
    result := result || jsonb_build_object('orders', coalesce((
      with centers as (
        select c.id, c.timezone from public.detail_centers c
         where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
      ), d as (
        select o.id, o.detail_center_id, o.channel::text as channel, o.total, o.estimated_minutes,
               case when o.started_at is not null and o.finished_at > o.started_at
                    then extract(epoch from o.finished_at - o.started_at) / 60 end as actual_minutes,
               private.dashboard_bucket((o.delivered_at at time zone c.timezone)::date, p_from, p_grain) as bucket
          from public.service_orders o join centers c on c.id = o.detail_center_id
         where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
      )
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'channel', x.channel,
               'orders', x.orders, 'sales', x.sales, 'product_sales', x.product_sales,
               'standard_minutes', x.standard_minutes, 'timed_orders', x.timed_orders,
               'actual_minutes', x.actual_minutes, 'rework_orders', x.rework_orders)
             order by x.bucket, x.detail_center_id, x.channel)
        from (select d.detail_center_id, d.bucket, d.channel, count(*)::integer as orders, sum(d.total) as sales,
                     coalesce(sum((select sum(i.line_subtotal - i.line_discount) from public.service_order_items i
                                    where i.service_order_id = d.id and i.kind = 'producto')), 0) as product_sales,
                     sum(d.estimated_minutes)::integer as standard_minutes,
                     count(d.actual_minutes)::integer as timed_orders,
                     round(coalesce(sum(d.actual_minutes), 0), 2) as actual_minutes,
                     count(*) filter (where exists (select 1 from public.service_order_incidents k
                                                     where k.service_order_id = d.id))::integer as rework_orders
                from d group by 1, 2, 3) x), '[]'::jsonb));
  end if;
  if 'orders' = any (p_sources) or 'customers' = any (p_sources) or 'services' = any (p_sources) then
    result := result || jsonb_build_object('centers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', c.id,
               'bays', (select count(*) from public.bays b where b.detail_center_id = c.id and b.active),
               'technicians', (select count(*) from public.technicians t where t.detail_center_id = c.id and t.active),
               'operating_hours_per_day', s.operating_hours_per_day,
               'operating_days_per_week', s.operating_days_per_week,
               'ltv_lifetime_years', s.ltv_lifetime_years,
               'first_activity_on', private.center_first_activity(c.id)) order by c.id)
        from public.detail_centers c
        cross join lateral private.kpi_settings_of(c.organization_id) s
       where c.id = any (p_detail_center_ids) and private.has_center_role(c.id)), '[]'::jsonb));
  end if;
  if 'services' = any (p_sources) then
    result := result || jsonb_build_object('services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'channel', x.channel,
               'engine', x.engine, 'service_id', x.service_id, 'service_name', x.service_name, 'kind', x.kind,
               'quantity', x.quantity, 'orders', x.orders, 'revenue', x.revenue, 'standard_cost', x.standard_cost,
               'operator_pay', x.operator_pay)
             order by x.bucket, x.detail_center_id, x.channel, x.engine, x.service_name)
        from (select l.detail_center_id, private.dashboard_bucket(l.delivered_on, p_from, p_grain) as bucket,
                     l.channel, l.engine, l.service_id, l.service_name, l.kind,
                     sum(l.quantity)::integer as quantity, count(distinct l.service_order_id)::integer as orders,
                     sum(l.revenue) as revenue, sum(l.standard_cost) as standard_cost,
                     sum(l.operator_pay) as operator_pay
                from private.order_line_facts(p_detail_center_ids, p_from, p_to) l
               group by 1, 2, 3, 4, 5, 6, 7) x), '[]'::jsonb));
  end if;
  if 'upsell' = any (p_sources) then
    result := result || jsonb_build_object('upsell', coalesce((
      select jsonb_agg(to_jsonb(f)) from public.upsell_metric_facts(p_detail_center_ids, p_from, p_to) f), '[]'::jsonb));
  end if;
  if 'customers' = any (p_sources) then
    result := result || jsonb_build_object('customers', coalesce((
      with centers as (
        select c.id, c.timezone from public.detail_centers c
         where c.id = any (p_detail_center_ids) and private.can_read_customer_metrics(c.id)
      ), d as (
        select o.detail_center_id, o.client_id, o.channel::text as channel, o.total, o.cost_total
          from public.service_orders o join centers c on c.id = o.detail_center_id
         where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
      )
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'client_key', x.client_key, 'channel', x.channel,
               'visits', x.visits, 'sales', x.sales, 'cost', x.cost, 'prior_visit', x.prior_visit)
             order by x.detail_center_id, x.client_key, x.channel)
        from (select d.detail_center_id, md5(d.client_id::text) as client_key, d.channel,
                     count(*)::integer as visits, sum(d.total) as sales, sum(d.cost_total) as cost,
                     exists (select 1 from public.service_orders p join centers c on c.id = p.detail_center_id
                              where p.client_id = d.client_id and p.detail_center_id = d.detail_center_id
                                and p.status = 'entregada'
                                and (p.delivered_at at time zone c.timezone)::date < p_from) as prior_visit
                from d group by d.detail_center_id, d.client_id, d.channel) x), '[]'::jsonb));
  end if;
  return result;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. Métricas cuya fórmula incluye ahora el pago al operador
-- ---------------------------------------------------------------------------

select private.register_metric('pnl.direct_cost', 2, 'Costo directo',
  'Costo de lo vendido: costo estándar de las OS, pago a operadores, variación de insumos y egresos de costo directo.',
  'currency',
  'Costo estándar congelado de las OS entregadas + pago a operadores (% del precio de la línea) + variación real de insumos + egresos aprobados de costo directo',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', true);
select private.register_metric('pnl.contribution_margin', 2, 'Margen de contribución',
  'Lo que aportan las OS después de sus costos variables (costo estándar, pago a operadores e insumos reales).',
  'currency',
  'Ventas − costo estándar de las OS entregadas − pago a operadores − variación real de insumos (sin egresos de costo directo fuera de la OS)',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking,distribution}', '{motor}', '{motor}', false);

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.order_line_facts(uuid[], date, date)',
    'private.service_commission_pct(uuid, uuid)',
    'private.freeze_operator_commission()',
    'private.pnl_movements(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.create_service(uuid, text, text, text, public.revenue_engine, integer, numeric, numeric, text, numeric)',
    'public.update_service(uuid, text, text, public.revenue_engine, integer, numeric, numeric, boolean, text, numeric)',
    'public.set_service_center_config(uuid, uuid, boolean, numeric, numeric, text, numeric)',
    'public.center_catalog(uuid, public.revenue_engine, boolean)',
    'public.corporate_order_lines(uuid[], date, date, text, text, uuid)',
    'public.dashboard_facts(text[], uuid[], date, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
