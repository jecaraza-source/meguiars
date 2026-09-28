-- D1 — Dirección / Generador de tableros ejecutivos.
--
-- * Registro de métricas (public.metric_registry): catálogo versionado de las
--   métricas que un tablero puede mostrar. La definición vive en código
--   (@meguiars/analytics, METRIC_CATALOG) y se refleja aquí con
--   private.register_metric desde migraciones; una prueba de paridad exige que
--   ambos coincidan. No hay SQL libre: un widget sólo referencia un id
--   registrado y el tipo de widget debe estar entre los que admite la métrica.
-- * Tableros (public.dashboard_definitions) y widgets (public.dashboard_widgets):
--   nombre, audiencia (rol), centros permitidos, periodo por defecto, orden y
--   tamaño de cada widget (rejilla de 4 columnas × 1–2 filas). Un tablero
--   corporativo por defecto por organización. Los configura el admin
--   corporativo (dashboards.manage) con RPC, motivo y auditoría.
-- * Preferencias por usuario (public.user_dashboard_preferences): orden y
--   visibilidad de widgets, filtros guardados y tablero favorito. Son datos del
--   propio usuario (sin auditoría de negocio).
-- * Datos: public.dashboard_facts devuelve en UNA llamada (jsonb, sin el límite
--   de filas de PostgREST) los hechos agregados por periodo de las fuentes que
--   usan los widgets (P&L, cobranza, pipeline, membresías). Reutiliza las
--   funciones de hechos existentes, así cada fuente conserva sus permisos por
--   centro; las fórmulas viven en @meguiars/analytics (mismo valor en web y
--   móvil).
-- * Permisos: dashboards.read (admin, encargado, contador, comercial B2B) ve los
--   tableros de su organización dirigidos a su rol (o a todos) y a alguno de sus
--   centros; cada widget además exige la capacidad de su métrica en el centro.

-- ---------------------------------------------------------------------------
-- 1. Registro de métricas
-- ---------------------------------------------------------------------------

create table public.metric_registry (
  id text primary key check (id ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  version integer not null check (version >= 1),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text not null check (length(btrim(description)) between 10 and 400),
  unit text not null check (unit in ('count', 'percent', 'currency', 'minutes', 'hours', 'ratio')),
  formula text not null check (length(btrim(formula)) >= 5),
  -- Fuente de hechos de public.dashboard_facts.
  source text not null check (source in ('pnl', 'payments', 'pipeline', 'memberships')),
  -- Tablas de origen (trazabilidad).
  source_tables text[] not null check (cardinality(source_tables) > 0),
  -- Capacidad requerida en el centro (espejo de ROLE_CAPABILITIES).
  capability text not null check (capability ~ '^[a-z_]+(\.[a-z_]+)+$'),
  widget_types text[] not null check (
    cardinality(widget_types) > 0
    and widget_types <@ array['kpi', 'timeseries', 'bars', 'ranking', 'funnel', 'distribution']),
  -- Filtros globales que la métrica respeta (los demás se ignoran y se avisa).
  filters text[] not null default '{}' check (filters <@ array['canal', 'motor']),
  -- Desgloses admitidos por el widget de distribución.
  breakdowns text[] not null default '{}' check (breakdowns <@ array['motor', 'canal', 'forma_pago']),
  drill boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (('distribution' = any (widget_types)) = (cardinality(breakdowns) > 0))
);

alter table public.metric_registry enable row level security;
create policy metric_registry_select on public.metric_registry for select to authenticated using (true);
revoke all on public.metric_registry from anon;
revoke insert, update, delete, truncate on public.metric_registry from authenticated;

-- Alta o nueva versión de una métrica (sólo desde migraciones). Una versión
-- menor que la registrada no cambia nada.
create function private.register_metric(
  p_id text,
  p_version integer,
  p_name text,
  p_description text,
  p_unit text,
  p_formula text,
  p_source text,
  p_source_tables text[],
  p_capability text,
  p_widget_types text[],
  p_filters text[],
  p_breakdowns text[],
  p_drill boolean
) returns void
language sql security definer set search_path = '' as $$
  insert into public.metric_registry (id, version, name, description, unit, formula, source, source_tables,
    capability, widget_types, filters, breakdowns, drill)
  values (p_id, p_version, p_name, p_description, p_unit, p_formula, p_source, p_source_tables,
    p_capability, p_widget_types, p_filters, p_breakdowns, p_drill)
  on conflict (id) do update
    set version = excluded.version, name = excluded.name, description = excluded.description,
        unit = excluded.unit, formula = excluded.formula, source = excluded.source,
        source_tables = excluded.source_tables, capability = excluded.capability,
        widget_types = excluded.widget_types, filters = excluded.filters, breakdowns = excluded.breakdowns,
        drill = excluded.drill, active = true, updated_at = now()
  where public.metric_registry.version <= excluded.version;
$$;

-- Catálogo inicial (versión 1). Mismo texto que METRIC_CATALOG de @meguiars/analytics.
select private.register_metric('pnl.revenue', 1, 'Ventas',
  'Venta devengada del periodo: OS entregadas (no cobros), venta de membresías y cuotas B2B.',
  'currency',
  'Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas',
  'pnl', '{public.service_orders,public.service_order_items,public.membership_events,public.b2b_agreements}',
  'pnl.read', '{kpi,timeseries,bars,ranking,distribution}', '{canal,motor}', '{motor,canal}', true);
select private.register_metric('pnl.direct_cost', 1, 'Costo directo',
  'Costo de lo vendido: costo estándar de las OS, variación de insumos y egresos de costo directo.',
  'currency',
  'Costo estándar congelado de las OS entregadas + variación real de insumos + egresos aprobados de costo directo',
  'pnl', '{public.service_order_items,public.service_order_consumptions,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', true);
select private.register_metric('pnl.gross_profit', 1, 'Utilidad bruta',
  'Lo que queda de las ventas después del costo directo.',
  'currency', 'Ventas − costo directo',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', false);
select private.register_metric('pnl.gross_margin', 1, 'Margen bruto',
  'Utilidad bruta como porcentaje de las ventas.',
  'percent', 'Utilidad bruta ÷ ventas × 100 (0 si no hay ventas)',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', false);
select private.register_metric('pnl.ebitda', 1, 'EBITDA gerencial',
  'Resultado operativo antes de depreciación, intereses e impuestos.',
  'currency',
  'Utilidad bruta − gastos de personal − gastos operativos (operativo, administrativo, marketing y otros) aprobados',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', false);
select private.register_metric('pnl.ebitda_margin', 1, 'Margen EBITDA',
  'EBITDA gerencial como porcentaje de las ventas.',
  'percent', 'EBITDA gerencial ÷ ventas × 100 (0 si no hay ventas)',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', false);
select private.register_metric('pnl.net_before_tax', 1, 'Utilidad antes de impuestos',
  'EBITDA gerencial menos gastos financieros.',
  'currency', 'EBITDA gerencial − gastos financieros aprobados (comisiones bancarias e intereses)',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,bars,ranking}', '{}', '{}', false);
select private.register_metric('expenses.cash_out', 1, 'Salidas de caja',
  'Egresos aprobados del periodo, incluida la compra de insumos.',
  'currency', 'Σ egresos aprobados del periodo, incluida la compra de insumos (que no es gasto del P&L)',
  'pnl', '{public.expenses}',
  'pnl.read', '{kpi,timeseries,bars}', '{}', '{}', false);
select private.register_metric('payments.collected', 1, 'Cobrado',
  'Cobranza del periodo en recibos válidos, por la fecha del recibo.',
  'currency', 'Σ formas de pago de recibos válidos del periodo (sin recibos revertidos)',
  'payments', '{public.payments,public.payment_tenders,public.payment_reversals}',
  'payments.read', '{kpi,timeseries,bars,ranking,distribution}', '{}', '{forma_pago}', true);
select private.register_metric('payments.cash_in', 1, 'En caja y banco',
  'Cobranza que entra a caja o banco (efectivo, tarjeta y transferencia).',
  'currency', 'Cobrado válido en efectivo, tarjeta y transferencia (el cambio entregado ya está descontado)',
  'payments', '{public.payments,public.payment_tenders,public.payment_reversals}',
  'payments.read', '{kpi,timeseries,bars}', '{}', '{}', true);
select private.register_metric('pipeline.created', 1, 'Oportunidades nuevas',
  'Oportunidades comerciales dadas de alta en el periodo (B2B y B2C premium).',
  'count', 'Oportunidades con evento «creada» en el rango',
  'pipeline', '{public.opportunity_events}',
  'pipeline.metrics.read', '{kpi,timeseries,bars,funnel}', '{canal}', '{}', true);
select private.register_metric('pipeline.won_value', 1, 'Valor ganado',
  'Valor de las oportunidades ganadas en el periodo.',
  'currency', 'Σ valor del evento «ganada» de las oportunidades ganadas en el rango',
  'pipeline', '{public.opportunity_events}',
  'pipeline.metrics.read', '{kpi,timeseries,bars,ranking}', '{canal}', '{}', true);
select private.register_metric('pipeline.conversion_rate', 1, 'Conversión',
  'Porcentaje de oportunidades cerradas en el periodo que se ganaron.',
  'percent', 'Ganadas ÷ (ganadas + perdidas) cerradas en el rango × 100 (0 sin cierres)',
  'pipeline', '{public.opportunity_events}',
  'pipeline.metrics.read', '{kpi,bars}', '{canal}', '{}', true);
select private.register_metric('membership.active_count', 1, 'Membresías activas',
  'Membresías vigentes al cierre del periodo.',
  'count', 'Membresías activas o próximas a vencer al corte (sin suspendidas, vencidas ni canceladas)',
  'memberships', '{public.memberships,public.membership_events,public.membership_redemptions}',
  'memberships.metrics.read', '{kpi,bars,ranking}', '{}', '{}', false);
select private.register_metric('membership.new_count', 1, 'Altas de membresía',
  'Membresías nuevas en el periodo.',
  'count', 'Membresías con evento de alta dentro del rango',
  'memberships', '{public.memberships,public.membership_events,public.membership_redemptions}',
  'memberships.metrics.read', '{kpi,bars}', '{}', '{}', false);
select private.register_metric('membership.mrr', 1, 'MRR',
  'Ingreso mensual recurrente de las membresías vigentes al cierre del periodo.',
  'currency',
  'Σ (precio congelado del periodo ÷ meses del periodo) de las membresías activas o próximas a vencer al corte. Ej.: mensual $849 aporta $849; trimestral $3,900 aporta $1,300. Suspendidas, vencidas y canceladas aportan $0.',
  'memberships', '{public.memberships,public.membership_events,public.membership_redemptions}',
  'memberships.metrics.read', '{kpi,bars,ranking}', '{}', '{}', false);

-- ---------------------------------------------------------------------------
-- 2. Tableros, widgets y preferencias
-- ---------------------------------------------------------------------------

-- Opciones de un widget: serie (grain), tope del ranking (limit) y desglose.
create function private.valid_widget_options(p_options jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_options) = 'object'
     and (p_options - array['grain', 'limit', 'breakdown']) = '{}'::jsonb
     and (not p_options ? 'grain' or p_options ->> 'grain' in ('auto', 'dia', 'semana', 'mes'))
     and (not p_options ? 'limit'
          or (jsonb_typeof(p_options -> 'limit') = 'number' and (p_options ->> 'limit') ~ '^\d+$'
              and (p_options ->> 'limit')::integer between 3 and 20))
     and (not p_options ? 'breakdown' or p_options ->> 'breakdown' in ('motor', 'canal', 'forma_pago'));
$$;

-- Filtros guardados (mismas claves que la URL): centros, periodo, desde, hasta, canal, motor.
create function private.valid_dashboard_filters(p_filters jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_filters) = 'object'
     and (p_filters - array['centros', 'periodo', 'desde', 'hasta', 'canal', 'motor']) = '{}'::jsonb
     and (not p_filters ? 'centros'
          or (jsonb_typeof(p_filters -> 'centros') = 'array'
              and jsonb_array_length(p_filters -> 'centros') between 1 and 50
              and not exists (
                select 1 from jsonb_array_elements(p_filters -> 'centros') c
                 where jsonb_typeof(c) <> 'string'
                    or c #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))
     and (not p_filters ? 'periodo' or p_filters ->> 'periodo' in ('hoy', 'semana', 'mes', 'anio', 'personalizado'))
     and (not p_filters ? 'desde' or p_filters ->> 'desde' ~ '^\d{4}-\d{2}-\d{2}$')
     and (not p_filters ? 'hasta' or p_filters ->> 'hasta' ~ '^\d{4}-\d{2}-\d{2}$')
     and (not p_filters ? 'canal' or p_filters ->> 'canal' in ('b2c', 'membresia', 'b2b'))
     and (not p_filters ? 'motor'
          or p_filters ->> 'motor' in ('recurrente', 'valor_medio', 'premium', 'producto_complemento', 'membresia', 'cuota_b2b'));
$$;

create table public.dashboard_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 3 and 80),
  description text check (description is null or length(description) <= 280),
  -- Rol al que va dirigido (null = todos los roles con dashboards.read).
  audience_role public.app_role,
  -- Centros permitidos (null = todos los de la organización).
  center_ids uuid[] check (center_ids is null or cardinality(center_ids) between 1 and 50),
  default_range text not null default 'mes' check (default_range in ('hoy', 'semana', 'mes', 'anio')),
  -- Tablero corporativo por defecto (uno por organización, para todos).
  is_default boolean not null default false,
  version integer not null default 1 check (version >= 1),
  request_id uuid,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  check (not is_default or (audience_role is null and center_ids is null and archived_at is null))
);
create unique index dashboard_definitions_default_idx on public.dashboard_definitions (organization_id)
  where is_default;
create index dashboard_definitions_org_idx on public.dashboard_definitions (organization_id)
  where archived_at is null;

create table public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dashboard_id uuid not null,
  metric_id text not null references public.metric_registry (id),
  widget_type text not null check (widget_type in ('kpi', 'timeseries', 'bars', 'ranking', 'funnel', 'distribution')),
  title text check (title is null or length(btrim(title)) between 2 and 60),
  position smallint not null check (position between 1 and 24),
  col_span smallint not null default 1 check (col_span between 1 and 4),
  row_span smallint not null default 1 check (row_span between 1 and 2),
  options jsonb not null default '{}' check (private.valid_widget_options(options)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, dashboard_id)
    references public.dashboard_definitions (organization_id, id) on delete cascade,
  constraint dashboard_widgets_position_key unique (dashboard_id, position) deferrable initially deferred
);
create index dashboard_widgets_metric_idx on public.dashboard_widgets (metric_id);

create table public.user_dashboard_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dashboard_id uuid not null references public.dashboard_definitions (id) on delete cascade,
  widget_order uuid[] not null default '{}' check (cardinality(widget_order) <= 24),
  hidden_widget_ids uuid[] not null default '{}' check (cardinality(hidden_widget_ids) <= 24),
  filters jsonb not null default '{}' check (private.valid_dashboard_filters(filters)),
  is_favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, dashboard_id)
);
create unique index user_dashboard_preferences_favorite_idx on public.user_dashboard_preferences (user_id)
  where is_favorite;
create index user_dashboard_preferences_dashboard_idx on public.user_dashboard_preferences (dashboard_id);

create trigger dashboard_definitions_updated_at before update on public.dashboard_definitions
  for each row execute function private.set_updated_at();
create trigger dashboard_widgets_updated_at before update on public.dashboard_widgets
  for each row execute function private.set_updated_at();
create trigger user_dashboard_preferences_updated_at before update on public.user_dashboard_preferences
  for each row execute function private.set_updated_at();
create trigger dashboard_definitions_require_reason before insert or update or delete on public.dashboard_definitions
  for each row execute function private.require_change_reason();
create trigger dashboard_widgets_require_reason before insert or update or delete on public.dashboard_widgets
  for each row execute function private.require_change_reason();
create trigger dashboard_definitions_audit after insert or update or delete on public.dashboard_definitions
  for each row execute function private.audit_row();
create trigger dashboard_widgets_audit after insert or update or delete on public.dashboard_widgets
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 3. Permisos (espejo en el dominio: dashboards.read / dashboards.manage)
-- ---------------------------------------------------------------------------

-- Roles del usuario en la organización: corporativos ∪ roles en sus centros activos.
create function private.org_all_roles(p_organization_id uuid) returns public.app_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct r.role), '{}')
    from (
      select unnest(private.org_roles(p_organization_id)) as role
      union all
      select m.role
        from public.user_detail_centers m
        join public.detail_centers c on c.id = m.detail_center_id and c.active
        join public.organizations o on o.id = c.organization_id and o.active
       where c.organization_id = p_organization_id and m.user_id = auth.uid() and m.active
         and private.is_active_user()
    ) r;
$$;

-- dashboards.manage: admin corporativo.
create function private.can_manage_dashboards(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- dashboards.read: admin, encargado, contador y comercial B2B.
create function private.can_read_dashboards(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.org_all_roles(p_organization_id)
         && array['admin_socio', 'encargado', 'contador', 'comercial_b2b']::public.app_role[];
$$;

-- Tablero visible: quien lo administra; o, si no está archivado, quien lee
-- tableros, tiene el rol de la audiencia y algún centro permitido.
create function private.can_view_dashboard(
  p_organization_id uuid,
  p_audience_role public.app_role,
  p_center_ids uuid[],
  p_archived_at timestamptz
) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_dashboards(p_organization_id)
      or (p_archived_at is null
          and private.can_read_dashboards(p_organization_id)
          and (p_audience_role is null or p_audience_role = any (private.org_all_roles(p_organization_id)))
          and (p_center_ids is null
               or exists (select 1 from unnest(p_center_ids) c where private.has_center_role(c))));
$$;

alter table public.dashboard_definitions enable row level security;
alter table public.dashboard_widgets enable row level security;
alter table public.user_dashboard_preferences enable row level security;

create policy dashboard_definitions_select on public.dashboard_definitions
  for select to authenticated
  using (private.can_view_dashboard(organization_id, audience_role, center_ids, archived_at));
create policy dashboard_widgets_select on public.dashboard_widgets
  for select to authenticated
  using (exists (select 1 from public.dashboard_definitions d where d.id = dashboard_id));
create policy user_dashboard_preferences_select on public.user_dashboard_preferences
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.dashboard_definitions, public.dashboard_widgets, public.user_dashboard_preferences from anon;
revoke insert, update, delete, truncate
  on public.dashboard_definitions, public.dashboard_widgets, public.user_dashboard_preferences from authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de escritura
-- ---------------------------------------------------------------------------

-- Alta o edición de un tablero con su rejilla completa de widgets (orden =
-- posición en p_widgets). Widgets con "id" existente se conservan (las
-- preferencias de los usuarios siguen valiendo); los que faltan se borran.
-- Alta idempotente por request_id; edición con versión (40001 si cambió).
create function public.save_dashboard(
  p_organization_id uuid,
  p_id uuid,
  p_request_id uuid,
  p_version integer,
  p_name text,
  p_description text,
  p_audience_role public.app_role,
  p_center_ids uuid[],
  p_default_range text,
  p_is_default boolean,
  p_widgets jsonb,
  p_reason text
) returns public.dashboard_definitions
language plpgsql security definer set search_path = '' as $$
declare
  result public.dashboard_definitions;
  w jsonb;
  m public.metric_registry;
  v_opts jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_pos integer := 0;
  v_centers uuid[] := nullif(p_center_ids, '{}');
begin
  if not private.can_manage_dashboards(p_organization_id) then
    raise exception 'Sólo el admin corporativo configura tableros' using errcode = '42501';
  end if;
  if p_widgets is null or jsonb_typeof(p_widgets) <> 'array' or jsonb_array_length(p_widgets) not between 1 and 24 then
    raise exception 'El tablero lleva de 1 a 24 widgets' using errcode = '22023';
  end if;
  if v_centers is not null and exists (
       select 1 from unnest(v_centers) c
        where not exists (select 1 from public.detail_centers d where d.id = c and d.organization_id = p_organization_id)) then
    raise exception 'Centro fuera de la organización' using errcode = '22023';
  end if;
  if coalesce(p_is_default, false) and (p_audience_role is not null or v_centers is not null) then
    raise exception 'El tablero corporativo por defecto es para todos los roles y centros' using errcode = 'MG002';
  end if;

  if p_id is null then
    if p_request_id is null then
      raise exception 'Falta el identificador de la solicitud' using errcode = '22023';
    end if;
    select * into result from public.dashboard_definitions
     where organization_id = p_organization_id and request_id = p_request_id;
    if found then
      return result;
    end if;
    perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Alta de tablero'));
  else
    perform private.set_change_reason(p_reason);
    select * into result from public.dashboard_definitions
     where id = p_id and organization_id = p_organization_id for update;
    if not found then
      raise exception 'Tablero inexistente' using errcode = '22023';
    end if;
    if result.archived_at is not null then
      raise exception 'El tablero está archivado' using errcode = 'MG002';
    end if;
    if p_version is null or result.version <> p_version then
      raise exception 'Otro usuario modificó el tablero; recarga e intenta de nuevo' using errcode = '40001';
    end if;
    if result.is_default and not coalesce(p_is_default, false) then
      raise exception 'Marca otro tablero como corporativo por defecto antes de quitárselo a este' using errcode = 'MG002';
    end if;
  end if;

  if coalesce(p_is_default, false) then
    update public.dashboard_definitions set is_default = false, version = version + 1
     where organization_id = p_organization_id and is_default and id is distinct from p_id;
  end if;

  begin
    if p_id is null then
      insert into public.dashboard_definitions (organization_id, name, description, audience_role, center_ids,
        default_range, is_default, request_id)
      values (p_organization_id, btrim(p_name), nullif(btrim(p_description), ''), p_audience_role, v_centers,
        coalesce(p_default_range, 'mes'), coalesce(p_is_default, false), p_request_id)
      returning * into result;
    else
      update public.dashboard_definitions
         set name = btrim(p_name), description = nullif(btrim(p_description), ''), audience_role = p_audience_role,
             center_ids = v_centers, default_range = coalesce(p_default_range, default_range),
             is_default = coalesce(p_is_default, false), version = version + 1
       where id = p_id
      returning * into result;
    end if;

    for w in select value from jsonb_array_elements(p_widgets) loop
      v_pos := v_pos + 1;
      if jsonb_typeof(w) <> 'object' then
        raise exception 'Widget inválido' using errcode = '22023';
      end if;
      select * into m from public.metric_registry where id = w ->> 'metric_id' and active;
      if not found then
        raise exception 'Métrica no registrada: %', coalesce(w ->> 'metric_id', '(vacía)') using errcode = '22023';
      end if;
      if not coalesce(w ->> 'widget_type' = any (m.widget_types), false) then
        raise exception 'La métrica «%» no admite el widget %', m.name, coalesce(w ->> 'widget_type', '(vacío)')
          using errcode = '22023';
      end if;
      v_opts := coalesce(w -> 'options', '{}'::jsonb);
      if not private.valid_widget_options(v_opts)
         or (v_opts ? 'breakdown' and not (v_opts ->> 'breakdown' = any (m.breakdowns))) then
        raise exception 'Opciones inválidas en el widget %', v_pos using errcode = '22023';
      end if;
      if w ->> 'widget_type' = 'distribution' and not v_opts ? 'breakdown' then
        v_opts := v_opts || jsonb_build_object('breakdown', m.breakdowns[1]);
      end if;
      v_id := nullif(w ->> 'id', '')::uuid;
      if v_id = any (v_ids) then
        raise exception 'Widget repetido' using errcode = '22023';
      end if;
      update public.dashboard_widgets
         set metric_id = m.id, widget_type = w ->> 'widget_type', title = nullif(btrim(w ->> 'title'), ''),
             position = v_pos, col_span = coalesce((w ->> 'col_span')::smallint, 1),
             row_span = coalesce((w ->> 'row_span')::smallint, 1), options = v_opts
       where id = v_id and dashboard_id = result.id;
      if v_id is null or not found then
        insert into public.dashboard_widgets (organization_id, dashboard_id, metric_id, widget_type, title, position,
          col_span, row_span, options)
        values (p_organization_id, result.id, m.id, w ->> 'widget_type', nullif(btrim(w ->> 'title'), ''), v_pos,
          coalesce((w ->> 'col_span')::smallint, 1), coalesce((w ->> 'row_span')::smallint, 1), v_opts)
        returning id into v_id;
      end if;
      v_ids := v_ids || v_id;
    end loop;
    delete from public.dashboard_widgets where dashboard_id = result.id and not (id = any (v_ids));
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Widget inválido: revisa el tamaño y el identificador' using errcode = '22023';
    when check_violation then
      raise exception 'Tablero inválido: nombre de 3 a 80 caracteres; widgets de 1 a 4 columnas × 1 a 2 filas y título de 2 a 60 caracteres'
        using errcode = '22023';
  end;
  return result;
end;
$$;

-- Archiva un tablero (deja de mostrarse; el corporativo por defecto no se archiva).
create function public.archive_dashboard(p_id uuid, p_version integer, p_reason text)
returns public.dashboard_definitions
language plpgsql security definer set search_path = '' as $$
declare
  result public.dashboard_definitions;
begin
  perform private.set_change_reason(p_reason);
  select * into result from public.dashboard_definitions where id = p_id for update;
  if not found or not private.can_manage_dashboards(result.organization_id) then
    raise exception 'Sólo el admin corporativo archiva tableros' using errcode = '42501';
  end if;
  if result.is_default then
    raise exception 'No se puede archivar el tablero corporativo por defecto' using errcode = 'MG002';
  end if;
  if result.archived_at is not null then
    return result;
  end if;
  if p_version is null or result.version <> p_version then
    raise exception 'Otro usuario modificó el tablero; recarga e intenta de nuevo' using errcode = '40001';
  end if;
  update public.dashboard_definitions set archived_at = now(), version = version + 1
   where id = p_id returning * into result;
  return result;
end;
$$;

-- Vista personal: orden y visibilidad de widgets, filtros guardados y favorito.
-- Los ids que no son del tablero se descartan.
create function public.save_dashboard_preferences(
  p_dashboard_id uuid,
  p_widget_order uuid[],
  p_hidden_widget_ids uuid[],
  p_filters jsonb,
  p_is_favorite boolean
) returns public.user_dashboard_preferences
language plpgsql security definer set search_path = '' as $$
declare
  d public.dashboard_definitions;
  result public.user_dashboard_preferences;
  v_order uuid[];
  v_hidden uuid[];
begin
  select * into d from public.dashboard_definitions where id = p_dashboard_id;
  if not found or d.archived_at is not null
     or not private.can_view_dashboard(d.organization_id, d.audience_role, d.center_ids, d.archived_at) then
    raise exception 'No tienes acceso a este tablero' using errcode = '42501';
  end if;
  if not private.valid_dashboard_filters(coalesce(p_filters, '{}'::jsonb)) then
    raise exception 'Filtros inválidos' using errcode = '22023';
  end if;
  select coalesce(array_agg(x.id order by x.n), '{}') into v_order
    from unnest(coalesce(p_widget_order, '{}')) with ordinality x(id, n)
   where exists (select 1 from public.dashboard_widgets w where w.id = x.id and w.dashboard_id = p_dashboard_id);
  select coalesce(array_agg(distinct x.id), '{}') into v_hidden
    from unnest(coalesce(p_hidden_widget_ids, '{}')) x(id)
   where exists (select 1 from public.dashboard_widgets w where w.id = x.id and w.dashboard_id = p_dashboard_id);
  if coalesce(p_is_favorite, false) then
    update public.user_dashboard_preferences set is_favorite = false
     where user_id = auth.uid() and is_favorite and dashboard_id <> p_dashboard_id;
  end if;
  insert into public.user_dashboard_preferences (user_id, dashboard_id, widget_order, hidden_widget_ids, filters,
    is_favorite)
  values (auth.uid(), p_dashboard_id, v_order, v_hidden, coalesce(p_filters, '{}'::jsonb), coalesce(p_is_favorite, false))
  on conflict (user_id, dashboard_id) do update
    set widget_order = excluded.widget_order, hidden_widget_ids = excluded.hidden_widget_ids,
        filters = excluded.filters, is_favorite = excluded.is_favorite
  returning * into result;
  return result;
end;
$$;

-- Vuelve a la vista del tablero (borra la vista personal).
create function public.reset_dashboard_preferences(p_dashboard_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.user_dashboard_preferences where user_id = auth.uid() and dashboard_id = p_dashboard_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Hechos de los widgets (una llamada por tablero y filtro)
-- ---------------------------------------------------------------------------

-- Inicio del periodo de la serie al que pertenece un día (el primero se recorta al rango).
create function private.dashboard_bucket(p_day date, p_from date, p_grain text) returns date
language sql immutable set search_path = '' as $$
  select case p_grain
    when 'total' then p_from
    when 'dia' then p_day
    when 'semana' then greatest(p_from, date_trunc('week', p_day)::date)
    when 'mes' then greatest(p_from, date_trunc('month', p_day)::date)
  end;
$$;

-- Hechos agregados de las fuentes pedidas, por centro y periodo de la serie.
-- Cada fuente aplica sus propios permisos por centro (pnl.read, payments.read,
-- pipeline.metrics.read, membresías): un centro sin permiso no aporta filas.
-- Sin datos personales.
create function public.dashboard_facts(
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
     or not (p_sources <@ array['pnl', 'payments', 'pipeline', 'memberships']) then
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
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Tablero corporativo por defecto de cada organización
-- ---------------------------------------------------------------------------

create function private.seed_default_dashboard(p_organization_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.dashboard_definitions where organization_id = p_organization_id and is_default) then
    return;
  end if;
  perform set_config('app.change_reason', 'Tablero corporativo por defecto', true);
  insert into public.dashboard_definitions (organization_id, name, description, default_range, is_default)
  values (p_organization_id, 'Tablero corporativo',
          'Resultados, cobranza, pipeline y membresías de todos los centros.', 'mes', true)
  returning id into v_id;
  insert into public.dashboard_widgets (organization_id, dashboard_id, metric_id, widget_type, position, col_span,
    row_span, options)
  values
    (p_organization_id, v_id, 'pnl.revenue', 'kpi', 1, 1, 1, '{}'),
    (p_organization_id, v_id, 'pnl.gross_profit', 'kpi', 2, 1, 1, '{}'),
    (p_organization_id, v_id, 'pnl.ebitda', 'kpi', 3, 1, 1, '{}'),
    (p_organization_id, v_id, 'pnl.ebitda_margin', 'kpi', 4, 1, 1, '{}'),
    (p_organization_id, v_id, 'pnl.revenue', 'timeseries', 5, 2, 2, '{"grain": "auto"}'),
    (p_organization_id, v_id, 'pnl.revenue', 'distribution', 6, 2, 2, '{"breakdown": "motor"}'),
    (p_organization_id, v_id, 'pnl.ebitda', 'ranking', 7, 2, 1, '{"limit": 10}'),
    (p_organization_id, v_id, 'payments.collected', 'kpi', 8, 1, 1, '{}'),
    (p_organization_id, v_id, 'pipeline.won_value', 'kpi', 9, 1, 1, '{}'),
    (p_organization_id, v_id, 'membership.mrr', 'kpi', 10, 1, 1, '{}'),
    (p_organization_id, v_id, 'membership.active_count', 'bars', 11, 2, 1, '{}'),
    (p_organization_id, v_id, 'pipeline.created', 'funnel', 12, 2, 1, '{}');
end;
$$;

do $$
declare
  org uuid;
begin
  for org in select id from public.organizations loop
    perform private.seed_default_dashboard(org);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function private.register_metric(text, integer, text, text, text, text, text, text[], text, text[], text[], text[], boolean)
  from public, anon, authenticated;
revoke all on function private.seed_default_dashboard(uuid) from public, anon, authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.valid_widget_options(jsonb)',
    'private.valid_dashboard_filters(jsonb)',
    'private.org_all_roles(uuid)',
    'private.can_manage_dashboards(uuid)',
    'private.can_read_dashboards(uuid)',
    'private.can_view_dashboard(uuid, public.app_role, uuid[], timestamptz)',
    'private.dashboard_bucket(date, date, text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.save_dashboard(uuid, uuid, uuid, integer, text, text, public.app_role, uuid[], text, boolean, jsonb, text)',
    'public.archive_dashboard(uuid, integer, text)',
    'public.save_dashboard_preferences(uuid, uuid[], uuid[], jsonb, boolean)',
    'public.reset_dashboard_preferences(uuid)',
    'public.dashboard_facts(text[], uuid[], date, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
