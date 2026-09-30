-- CR2 (fase 3) — Calendario de contenido, campañas con UTM, gasto publicitario
-- y promociones con código, con atribución hasta la venta.
--
-- * campaigns: campaña de la organización (opcionalmente de un centro) con
--   objetivo, fechas, presupuesto y parámetros UTM (utm_campaign único).
-- * campaign_spend: inversión real por fecha. Puede ligarse a un egreso del
--   grupo «marketing» (el importe se toma del egreso): así el P&L y la campaña
--   leen el mismo dinero sin capturarlo dos veces. Anular exige motivo.
-- * content_posts: calendario editorial (idea → borrador → programada →
--   publicada / cancelada) por canal y formato, con enlace UTM y URL publicada.
--   La publicación se hace en la red social; aquí se planea y se registra.
-- * promotions: código de promoción (porcentaje o importe, servicios, vigencia,
--   usos máximos, centros), aprobado por el admin. Aplicarlo en una cotización
--   o en una OS crea un descuento con origen «promoción» ya autorizado (no
--   consume el nivel de quien lo aplica); un documento lleva a lo más una
--   promoción. Si la cotización es de un prospecto sin campaña, la promoción
--   lo atribuye a su campaña.
-- * leads.campaign_id: atribución del prospecto a una campaña.
-- * campaign_facts: hechos por campaña (prospectos, cotizados, reservados,
--   ganados, ventas y margen atribuidos, inversión, usos y descuento de
--   promociones) para los indicadores; sin datos personales.
--
-- Escrituras sólo por RPC con motivo y auditoría.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- marketing.manage: campañas y calendario. Con centro: admin, encargado o
-- comercial de ese centro; sin centro (toda la organización): admin corporativo.
create function private.can_manage_marketing(p_organization_id uuid, p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[])
      or (p_detail_center_id is not null
          and exists (select 1 from public.detail_centers c where c.id = p_detail_center_id and c.organization_id = p_organization_id)
          and private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b']::public.app_role[]));
$$;

-- Lectura de campañas y calendario: quien trabaja prospectos o lee métricas comerciales en la organización.
create function private.can_read_marketing(p_organization_id uuid, p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio', 'contador']::public.app_role[])
      or exists (
        select 1 from public.detail_centers c
         where c.organization_id = p_organization_id
           and (p_detail_center_id is null or c.id = p_detail_center_id)
           and (private.can_use_leads(c.id) or private.can_read_commercial_metrics(c.id)));
$$;

-- promotions.manage: crear y aprobar promociones (admin de la organización:
-- la promoción es un descuento preautorizado).
create function private.can_manage_promotions(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- null = toda la organización.
  detail_center_id uuid,
  name text not null check (length(btrim(name)) between 3 and 120),
  objective text not null check (objective in ('prospectos', 'reservas', 'ventas', 'reactivacion', 'marca')),
  channels text[] not null default '{}'
    check (channels <@ array['instagram', 'facebook', 'whatsapp', 'tiktok', 'google', 'email', 'otro']::text[]),
  starts_on date not null,
  ends_on date not null,
  budget numeric(12, 2) check (budget is null or budget >= 0),
  status text not null default 'planeada' check (status in ('planeada', 'activa', 'pausada', 'terminada', 'cancelada')),
  utm_source text not null check (utm_source ~ '^[a-z0-9_.-]{2,40}$'),
  utm_medium text not null check (utm_medium ~ '^[a-z0-9_.-]{2,40}$'),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9_.-]{2,60}$'),
  landing_url text check (landing_url is null or (landing_url ~ '^https://[^\s]{3,}$' and length(landing_url) <= 500)),
  notes text check (notes is null or length(notes) <= 2000),
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, utm_campaign),
  check (ends_on >= starts_on),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create index campaigns_org_dates_idx on public.campaigns (organization_id, starts_on, ends_on);

create table public.campaign_spend (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  spent_on date not null,
  amount numeric(12, 2) not null check (amount > 0),
  channel text not null check (channel in ('instagram', 'facebook', 'whatsapp', 'tiktok', 'google', 'email', 'otro')),
  -- Egreso del P&L (grupo marketing) que respalda este gasto; el importe se toma de él.
  expense_id uuid unique,
  note text check (note is null or length(note) <= 500),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 3 and 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((voided_at is null) = (void_reason is null)),
  foreign key (organization_id, campaign_id) references public.campaigns (organization_id, id) on delete restrict,
  foreign key (organization_id, expense_id) references public.expenses (organization_id, id) on delete restrict
);
create index campaign_spend_campaign_idx on public.campaign_spend (campaign_id, spent_on);

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid,
  campaign_id uuid,
  channel text not null check (channel in ('instagram', 'facebook', 'whatsapp', 'tiktok', 'google', 'email', 'otro')),
  format text not null check (format in ('publicacion', 'carrusel', 'reel', 'historia', 'video', 'estado', 'correo', 'otro')),
  title text not null check (length(btrim(title)) between 3 and 120),
  copy text check (copy is null or length(copy) <= 4000),
  planned_at timestamptz not null,
  status text not null default 'idea' check (status in ('idea', 'borrador', 'programada', 'publicada', 'cancelada')),
  owner_id uuid references auth.users (id) on delete set null,
  -- Enlace con UTM que lleva la publicación (lo arma la plataforma con la campaña).
  link_url text check (link_url is null or (link_url ~ '^https://[^\s]{3,}$' and length(link_url) <= 800)),
  published_url text check (published_url is null or (published_url ~ '^https://[^\s]{3,}$' and length(published_url) <= 800)),
  published_at timestamptz,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((status = 'publicada') = (published_at is not null)),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, campaign_id) references public.campaigns (organization_id, id) on delete restrict
);
create index content_posts_org_planned_idx on public.content_posts (organization_id, planned_at);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  name text not null check (length(btrim(name)) between 3 and 120),
  kind text not null check (kind in ('percent', 'amount')),
  value numeric(12, 2) not null check (value > 0 and (kind <> 'percent' or value <= 100)),
  -- Servicios a los que aplica (vacío = a toda la cotización u OS).
  service_ids uuid[] not null default '{}',
  -- Centros donde vale (vacío = todos los de la organización).
  detail_center_ids uuid[] not null default '{}',
  starts_on date not null,
  ends_on date not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  active boolean not null default true,
  -- Nivel de autorización que representa (lo fija quien la crea: admin).
  authorization_level public.discount_level not null default 'admin',
  terms text check (terms is null or length(terms) <= 1000),
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  check (ends_on >= starts_on),
  foreign key (organization_id, campaign_id) references public.campaigns (organization_id, id) on delete restrict
);

-- Atribución del prospecto a una campaña.
alter table public.leads add column campaign_id uuid,
  add constraint leads_campaign_fk foreign key (organization_id, campaign_id)
    references public.campaigns (organization_id, id) on delete restrict;
create index leads_campaign_idx on public.leads (campaign_id) where campaign_id is not null;

-- Descuentos que vienen de una promoción (cotización y OS).
alter table public.quote_discounts
  add column source text not null default 'manual' check (source in ('manual', 'promocion')),
  add column promotion_id uuid,
  add constraint quote_discounts_promotion_fk foreign key (organization_id, promotion_id)
    references public.promotions (organization_id, id) on delete restrict,
  add constraint quote_discounts_promotion_source check ((source = 'promocion') = (promotion_id is not null));
create unique index quote_discounts_one_promotion on public.quote_discounts (quote_id)
  where promotion_id is not null and voided_at is null;

alter table public.service_order_discounts drop constraint service_order_discounts_source_check;
alter table public.service_order_discounts
  add constraint service_order_discounts_source_check check (source in ('manual', 'membresia', 'promocion')),
  add column promotion_id uuid,
  add constraint service_order_discounts_promotion_fk foreign key (organization_id, promotion_id)
    references public.promotions (organization_id, id) on delete restrict,
  add constraint service_order_discounts_promotion_source check ((source = 'promocion') = (promotion_id is not null));
create unique index service_order_discounts_one_promotion on public.service_order_discounts (service_order_id)
  where promotion_id is not null and voided_at is null;

-- ---------------------------------------------------------------------------
-- 3. Triggers y RLS
-- ---------------------------------------------------------------------------

create trigger campaigns_updated_at before update on public.campaigns for each row execute function private.set_updated_at();
create trigger campaign_spend_updated_at before update on public.campaign_spend for each row execute function private.set_updated_at();
create trigger content_posts_updated_at before update on public.content_posts for each row execute function private.set_updated_at();
create trigger promotions_updated_at before update on public.promotions for each row execute function private.set_updated_at();

create trigger campaigns_require_reason before insert or update or delete on public.campaigns
  for each row execute function private.require_change_reason();
create trigger campaign_spend_require_reason before insert or update or delete on public.campaign_spend
  for each row execute function private.require_change_reason();
create trigger content_posts_require_reason before insert or update or delete on public.content_posts
  for each row execute function private.require_change_reason();
create trigger promotions_require_reason before insert or update or delete on public.promotions
  for each row execute function private.require_change_reason();

create trigger campaigns_audit after insert or update or delete on public.campaigns for each row execute function private.audit_row();
create trigger campaign_spend_audit after insert or update or delete on public.campaign_spend for each row execute function private.audit_row();
create trigger content_posts_audit after insert or update or delete on public.content_posts for each row execute function private.audit_row();
create trigger promotions_audit after insert or update or delete on public.promotions for each row execute function private.audit_row();

create trigger campaigns_version before update on public.campaigns for each row execute function private.bump_row_version();
create trigger content_posts_version before update on public.content_posts for each row execute function private.bump_row_version();
create trigger promotions_version before update on public.promotions for each row execute function private.bump_row_version();

alter table public.campaigns enable row level security;
alter table public.campaign_spend enable row level security;
alter table public.content_posts enable row level security;
alter table public.promotions enable row level security;

create policy campaigns_select on public.campaigns
  for select to authenticated using (private.can_read_marketing(organization_id, detail_center_id));
create policy campaign_spend_select on public.campaign_spend
  for select to authenticated using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and private.can_read_marketing(c.organization_id, c.detail_center_id)));
create policy content_posts_select on public.content_posts
  for select to authenticated using (private.can_read_marketing(organization_id, detail_center_id));
-- Las promociones las ve quien puede aplicarlas o leer campañas.
create policy promotions_select on public.promotions
  for select to authenticated using (
    case when cardinality(detail_center_ids) = 0 then private.can_read_marketing(organization_id, null)
         else exists (select 1 from unnest(detail_center_ids) d where private.can_read_marketing(organization_id, d)) end);

revoke all on public.campaigns, public.campaign_spend, public.content_posts, public.promotions from anon;
revoke insert, update, delete, truncate on public.campaigns, public.campaign_spend, public.content_posts, public.promotions
  from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Campañas y gasto
-- ---------------------------------------------------------------------------

create function public.upsert_campaign(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_detail_center_id uuid,
  p_name text,
  p_objective text,
  p_channels text[],
  p_starts_on date,
  p_ends_on date,
  p_budget numeric,
  p_status text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_landing_url text,
  p_notes text,
  p_reason text
) returns public.campaigns
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  v_channels text[] := coalesce((select array_agg(distinct x order by x) from unnest(p_channels) x), '{}');
begin
  if not private.can_manage_marketing(p_organization_id, p_detail_center_id) then
    raise exception 'Sin permiso para gestionar campañas aquí' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  if exists (select 1 from public.campaigns x where x.organization_id = p_organization_id
               and x.utm_campaign = lower(btrim(p_utm_campaign)) and x.id is distinct from p_id) then
    raise exception 'Ya hay una campaña con ese utm_campaign' using errcode = 'MG002';
  end if;
  if p_id is null then
    insert into public.campaigns (organization_id, detail_center_id, name, objective, channels, starts_on, ends_on, budget,
                                  status, utm_source, utm_medium, utm_campaign, landing_url, notes)
    values (p_organization_id, p_detail_center_id, btrim(p_name), p_objective, v_channels, p_starts_on, p_ends_on, p_budget,
            coalesce(p_status, 'planeada'), lower(btrim(p_utm_source)), lower(btrim(p_utm_medium)),
            lower(btrim(p_utm_campaign)), nullif(btrim(p_landing_url), ''), nullif(btrim(p_notes), ''))
    returning * into c;
    return c;
  end if;
  select * into c from public.campaigns where id = p_id and organization_id = p_organization_id for update;
  if not found or not private.can_manage_marketing(c.organization_id, c.detail_center_id) then
    raise exception 'Campaña inexistente o sin permiso' using errcode = '42501';
  end if;
  if c.version <> p_version then
    raise exception 'La campaña cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  update public.campaigns
     set detail_center_id = p_detail_center_id, name = btrim(p_name), objective = p_objective, channels = v_channels,
         starts_on = p_starts_on, ends_on = p_ends_on, budget = p_budget, status = coalesce(p_status, status),
         utm_source = lower(btrim(p_utm_source)), utm_medium = lower(btrim(p_utm_medium)),
         utm_campaign = lower(btrim(p_utm_campaign)), landing_url = nullif(btrim(p_landing_url), ''),
         notes = nullif(btrim(p_notes), '')
   where id = c.id
   returning * into c;
  return c;
end;
$$;

-- Gasto real. Con p_expense_id el importe y la fecha vienen del egreso (grupo
-- marketing, no anulado, de la misma organización) para no capturarlo dos veces.
create function public.add_campaign_spend(
  p_campaign_id uuid,
  p_spent_on date,
  p_amount numeric,
  p_channel text,
  p_expense_id uuid,
  p_note text
) returns public.campaign_spend
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  e public.expenses;
  s public.campaign_spend;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or not private.can_manage_marketing(c.organization_id, c.detail_center_id) then
    raise exception 'Campaña inexistente o sin permiso' using errcode = '42501';
  end if;
  perform private.set_change_reason('Gasto de campaña');
  if p_expense_id is not null then
    select * into e from public.expenses where id = p_expense_id and organization_id = c.organization_id;
    if not found then
      raise exception 'Egreso inexistente' using errcode = '22023';
    end if;
    if e.pnl_group <> 'marketing' or e.status in ('rechazado', 'anulado') then
      raise exception 'Liga sólo egresos vigentes del grupo marketing' using errcode = 'MG002';
    end if;
    if exists (select 1 from public.campaign_spend x where x.expense_id = e.id) then
      raise exception 'Ese egreso ya está ligado a una campaña' using errcode = 'MG002';
    end if;
  end if;
  insert into public.campaign_spend (organization_id, campaign_id, spent_on, amount, channel, expense_id, note)
  values (c.organization_id, c.id, coalesce(e.paid_on, p_spent_on), coalesce(e.amount, p_amount), p_channel,
          e.id, nullif(btrim(p_note), ''))
  returning * into s;
  return s;
end;
$$;

create function public.void_campaign_spend(p_spend_id uuid, p_reason text) returns public.campaign_spend
language plpgsql security definer set search_path = '' as $$
declare
  s public.campaign_spend;
  c public.campaigns;
begin
  select * into s from public.campaign_spend where id = p_spend_id for update;
  select * into c from public.campaigns where id = s.campaign_id;
  if s.id is null or not private.can_manage_marketing(c.organization_id, c.detail_center_id) then
    raise exception 'Gasto inexistente o sin permiso' using errcode = '42501';
  end if;
  if s.voided_at is not null then
    raise exception 'El gasto ya está anulado' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  update public.campaign_spend set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = s.id returning * into s;
  return s;
end;
$$;

create function public.list_campaigns(p_organization_id uuid, p_id uuid default null)
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
  select c.id, c.detail_center_id, dc.name, c.name, c.objective, c.channels, c.starts_on, c.ends_on, c.budget, c.status,
         c.utm_source, c.utm_medium, c.utm_campaign, c.landing_url, c.notes,
         coalesce((select sum(s.amount) from public.campaign_spend s where s.campaign_id = c.id and s.voided_at is null), 0),
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

create function public.campaign_spend_entries(p_campaign_id uuid)
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
     and private.can_read_marketing(c.organization_id, c.detail_center_id)
   order by s.spent_on desc, s.created_at desc;
$$;

-- Atribución manual del prospecto a una campaña (o quitarla).
create function public.set_lead_campaign(p_id uuid, p_version integer, p_campaign_id uuid)
returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  if p_campaign_id is not null and not exists (
       select 1 from public.campaigns c where c.id = p_campaign_id and c.organization_id = l.organization_id
          and (c.detail_center_id is null or c.detail_center_id = l.detail_center_id)) then
    raise exception 'La campaña no es de este centro u organización' using errcode = '22023';
  end if;
  perform private.set_change_reason('Campaña del prospecto');
  update public.leads set campaign_id = p_campaign_id where id = l.id returning * into l;
  perform private.lead_event(l, 'nota', null, null, null,
    coalesce('Atribuido a la campaña ' || (select c.name from public.campaigns c where c.id = p_campaign_id), 'Sin campaña'));
  return l;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Calendario de contenido
-- ---------------------------------------------------------------------------

create function public.upsert_content_post(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_detail_center_id uuid,
  p_campaign_id uuid,
  p_channel text,
  p_format text,
  p_title text,
  p_copy text,
  p_planned_at timestamptz,
  p_owner_id uuid,
  p_link_url text,
  p_reason text
) returns public.content_posts
language plpgsql security definer set search_path = '' as $$
declare
  p public.content_posts;
begin
  if not private.can_manage_marketing(p_organization_id, p_detail_center_id) then
    raise exception 'Sin permiso para planear contenido aquí' using errcode = '42501';
  end if;
  if p_campaign_id is not null and not exists (
       select 1 from public.campaigns c where c.id = p_campaign_id and c.organization_id = p_organization_id) then
    raise exception 'Campaña inexistente' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.content_posts (organization_id, detail_center_id, campaign_id, channel, format, title, copy,
                                      planned_at, owner_id, link_url)
    values (p_organization_id, p_detail_center_id, p_campaign_id, p_channel, p_format, btrim(p_title),
            nullif(btrim(p_copy), ''), p_planned_at, coalesce(p_owner_id, auth.uid()), nullif(btrim(p_link_url), ''))
    returning * into p;
    return p;
  end if;
  select * into p from public.content_posts where id = p_id and organization_id = p_organization_id for update;
  if not found or not private.can_manage_marketing(p.organization_id, p.detail_center_id) then
    raise exception 'Publicación inexistente o sin permiso' using errcode = '42501';
  end if;
  if p.version <> p_version then
    raise exception 'La publicación cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if p.status in ('publicada', 'cancelada') then
    raise exception 'Una publicación publicada o cancelada ya no se edita' using errcode = 'MG002';
  end if;
  update public.content_posts
     set detail_center_id = p_detail_center_id, campaign_id = p_campaign_id, channel = p_channel, format = p_format,
         title = btrim(p_title), copy = nullif(btrim(p_copy), ''), planned_at = p_planned_at,
         owner_id = coalesce(p_owner_id, owner_id), link_url = nullif(btrim(p_link_url), '')
   where id = p.id returning * into p;
  return p;
end;
$$;

-- Avance del flujo editorial. Publicar registra la URL de la publicación real.
create function public.set_content_post_status(
  p_id uuid,
  p_version integer,
  p_status text,
  p_published_url text,
  p_reason text
) returns public.content_posts
language plpgsql security definer set search_path = '' as $$
declare
  p public.content_posts;
begin
  select * into p from public.content_posts where id = p_id for update;
  if not found or not private.can_manage_marketing(p.organization_id, p.detail_center_id) then
    raise exception 'Publicación inexistente o sin permiso' using errcode = '42501';
  end if;
  if p.version <> p_version then
    raise exception 'La publicación cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if p.status in ('publicada', 'cancelada') and p_status <> p.status then
    raise exception 'La publicación ya está cerrada' using errcode = 'MG002';
  end if;
  if p_status not in ('idea', 'borrador', 'programada', 'publicada', 'cancelada') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  if p_status = 'publicada' and nullif(btrim(p_published_url), '') is null then
    raise exception 'Pega el enlace de la publicación' using errcode = '22023';
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Estado de la publicación'));
  update public.content_posts
     set status = p_status,
         published_url = case when p_status = 'publicada' then btrim(p_published_url) else published_url end,
         published_at = case when p_status = 'publicada' then now() end
   where id = p.id returning * into p;
  return p;
end;
$$;

create function public.list_content_posts(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_detail_center_id uuid default null,
  p_campaign_id uuid default null
)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  campaign_id uuid,
  campaign_name text,
  channel text,
  format text,
  title text,
  copy text,
  planned_at timestamptz,
  status text,
  owner_id uuid,
  owner_name text,
  link_url text,
  published_url text,
  published_at timestamptz,
  overdue boolean,
  version integer,
  can_manage boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 190 then
    raise exception 'Periodo inválido (máximo 190 días)' using errcode = '22023';
  end if;
  return query
  select p.id, p.detail_center_id, dc.name, p.campaign_id, c.name, p.channel, p.format, p.title, p.copy, p.planned_at,
         p.status, p.owner_id, (select pr.full_name from public.profiles pr where pr.id = p.owner_id), p.link_url,
         p.published_url, p.published_at, p.status in ('idea', 'borrador', 'programada') and p.planned_at < now(),
         p.version, private.can_manage_marketing(p.organization_id, p.detail_center_id)
    from public.content_posts p
    left join public.detail_centers dc on dc.id = p.detail_center_id
    left join public.campaigns c on c.id = p.campaign_id
   where p.organization_id = p_organization_id
     and private.can_read_marketing(p.organization_id, p.detail_center_id)
     and (p_detail_center_id is null or p.detail_center_id is null or p.detail_center_id = p_detail_center_id)
     and (p_campaign_id is null or p.campaign_id = p_campaign_id)
     and p.planned_at >= p_from::timestamptz - interval '1 day'
     and p.planned_at < p_to::timestamptz + interval '2 days'
   order by p.planned_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Promociones
-- ---------------------------------------------------------------------------

create function public.upsert_promotion(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_campaign_id uuid,
  p_code text,
  p_name text,
  p_kind text,
  p_value numeric,
  p_service_ids uuid[],
  p_detail_center_ids uuid[],
  p_starts_on date,
  p_ends_on date,
  p_max_uses integer,
  p_active boolean,
  p_terms text,
  p_reason text
) returns public.promotions
language plpgsql security definer set search_path = '' as $$
declare
  p public.promotions;
  v_code text := upper(btrim(p_code));
begin
  if not private.can_manage_promotions(p_organization_id) then
    raise exception 'Sólo el admin de la organización crea promociones (son descuentos preautorizados)' using errcode = '42501';
  end if;
  if p_campaign_id is not null and not exists (
       select 1 from public.campaigns c where c.id = p_campaign_id and c.organization_id = p_organization_id) then
    raise exception 'Campaña inexistente' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_service_ids, '{}')) s
              where not exists (select 1 from public.services x where x.id = s and x.organization_id = p_organization_id))
     or exists (select 1 from unnest(coalesce(p_detail_center_ids, '{}')) d
              where not exists (select 1 from public.detail_centers x where x.id = d and x.organization_id = p_organization_id)) then
    raise exception 'Servicios o centros de otra organización' using errcode = '22023';
  end if;
  if exists (select 1 from public.promotions x where x.organization_id = p_organization_id and x.code = v_code
               and x.id is distinct from p_id) then
    raise exception 'Ya existe una promoción con ese código' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.promotions (organization_id, campaign_id, code, name, kind, value, service_ids, detail_center_ids,
                                   starts_on, ends_on, max_uses, active, terms)
    values (p_organization_id, p_campaign_id, v_code, btrim(p_name), p_kind, p_value,
            coalesce((select array_agg(distinct s) from unnest(p_service_ids) s), '{}'),
            coalesce((select array_agg(distinct d) from unnest(p_detail_center_ids) d), '{}'),
            p_starts_on, p_ends_on, p_max_uses, coalesce(p_active, true), nullif(btrim(p_terms), ''))
    returning * into p;
    return p;
  end if;
  select * into p from public.promotions where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Promoción inexistente' using errcode = '42501';
  end if;
  if p.version <> p_version then
    raise exception 'La promoción cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  -- Con usos, el descuento ya otorgado no cambia: sólo vigencia, usos, estado y textos.
  if private.promotion_uses(p.id) > 0 and (p_kind <> p.kind or p_value <> p.value or v_code <> p.code) then
    raise exception 'La promoción ya se usó: crea otra si cambia el descuento o el código' using errcode = 'MG002';
  end if;
  update public.promotions
     set campaign_id = p_campaign_id, code = v_code, name = btrim(p_name), kind = p_kind, value = p_value,
         service_ids = coalesce((select array_agg(distinct s) from unnest(p_service_ids) s), '{}'),
         detail_center_ids = coalesce((select array_agg(distinct d) from unnest(p_detail_center_ids) d), '{}'),
         starts_on = p_starts_on, ends_on = p_ends_on, max_uses = p_max_uses, active = coalesce(p_active, true),
         terms = nullif(btrim(p_terms), '')
   where id = p.id returning * into p;
  return p;
end;
$$;

-- Una promoción de toda la organización la ve quien trabaja en ella; una
-- restringida a centros, sólo quien trabaja en alguno de esos centros.
create function private.promotion_visible(p public.promotions) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when cardinality(p.detail_center_ids) = 0 then private.can_read_marketing(p.organization_id, null)
              else exists (select 1 from unnest(p.detail_center_ids) d where private.can_read_marketing(p.organization_id, d)) end;
$$;

-- Usos vigentes (descuentos no anulados en cotizaciones y OS).
create function private.promotion_uses(p_promotion_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from public.quote_discounts d where d.promotion_id = p_promotion_id and d.voided_at is null)
        + (select count(*) from public.service_order_discounts d where d.promotion_id = p_promotion_id and d.voided_at is null))::integer;
$$;

-- Busca un código vigente para el centro y la fecha del centro; explica por qué no aplica.
create function private.find_promotion(p_organization_id uuid, p_detail_center_id uuid, p_code text) returns public.promotions
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.promotions;
  today date := private.center_today(p_detail_center_id);
begin
  select * into p from public.promotions where organization_id = p_organization_id and code = upper(btrim(p_code));
  if not found then
    raise exception 'No existe una promoción con ese código' using errcode = 'MG002';
  end if;
  if not p.active then
    raise exception 'La promoción % está desactivada', p.code using errcode = 'MG002';
  end if;
  if today not between p.starts_on and p.ends_on then
    raise exception 'La promoción % vale del % al %', p.code, p.starts_on, p.ends_on using errcode = 'MG002';
  end if;
  if cardinality(p.detail_center_ids) > 0 and not (p_detail_center_id = any (p.detail_center_ids)) then
    raise exception 'La promoción % no aplica en este centro', p.code using errcode = 'MG002';
  end if;
  if p.max_uses is not null and private.promotion_uses(p.id) >= p.max_uses then
    raise exception 'La promoción % ya alcanzó sus % usos', p.code, p.max_uses using errcode = 'MG002';
  end if;
  return p;
end;
$$;

create function public.apply_promotion_to_quote(p_quote_id uuid, p_version integer, p_code text)
returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  p public.promotions;
  it record;
  applied numeric(12, 2);
  total_applied numeric(12, 2) := 0;
begin
  q := private.lock_quote(p_quote_id, p_version);
  perform private.check_quote_editable(q);
  if not private.can_use_leads(q.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  p := private.find_promotion(q.organization_id, q.detail_center_id, p_code);
  if exists (select 1 from public.quote_discounts d where d.quote_id = q.id and d.promotion_id is not null and d.voided_at is null) then
    raise exception 'La cotización ya tiene una promoción; anúlala antes de aplicar otra' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Promoción ' || p.code);
  if cardinality(p.service_ids) = 0 then
    applied := case when p.kind = 'percent' then round((q.subtotal - coalesce((select sum(i.line_discount) from public.quote_items i where i.quote_id = q.id), 0)) * p.value / 100, 2)
                    else least(p.value, q.total) end;
    if applied <= 0 then
      raise exception 'No queda importe para descontar' using errcode = 'MG002';
    end if;
    insert into public.quote_discounts (organization_id, quote_id, item_id, kind, value, amount, reason, authorization_level,
                                        authorized_by, source, promotion_id)
    values (q.organization_id, q.id, null, p.kind, case when p.kind = 'percent' then p.value else applied end, applied,
            left('Promoción ' || p.code || ': ' || p.name, 500), p.authorization_level, p.created_by, 'promocion', p.id);
  else
    for it in select i.* from public.quote_items i where i.quote_id = q.id and i.service_id = any (p.service_ids) order by i.line_subtotal desc loop
      applied := case when p.kind = 'percent' then round(it.line_subtotal * p.value / 100, 2)
                      else least(p.value - total_applied, it.line_subtotal - it.line_discount) end;
      exit when applied <= 0;
      insert into public.quote_discounts (organization_id, quote_id, item_id, kind, value, amount, reason, authorization_level,
                                          authorized_by, source, promotion_id)
      values (q.organization_id, q.id, it.id, p.kind, case when p.kind = 'percent' then p.value else applied end, applied,
              left('Promoción ' || p.code || ': ' || p.name, 500), p.authorization_level, p.created_by, 'promocion', p.id);
      total_applied := total_applied + applied;
      -- Un importe fijo se aplica una vez (repartido si no cabe en una línea); un % en cada línea.
      exit when p.kind = 'amount' and total_applied >= p.value;
    end loop;
    if not found and total_applied = 0 then
      raise exception 'La promoción % no aplica a los servicios de esta cotización', p.code using errcode = 'MG002';
    end if;
  end if;
  perform private.recalc_quote(q.id);
  -- Atribución: el prospecto sin campaña queda en la de la promoción.
  if p.campaign_id is not null and q.lead_id is not null then
    update public.leads set campaign_id = p.campaign_id where id = q.lead_id and campaign_id is null;
  end if;
  update public.quotes set updated_at = now() where id = q.id returning * into q;
  return q;
end;
$$;

create function public.apply_promotion_to_order(p_order_id uuid, p_version integer, p_code text)
returns public.service_orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders;
  p public.promotions;
  it record;
  applied numeric(12, 2);
  total_applied numeric(12, 2) := 0;
begin
  -- Permiso antes que versión: sin acceso no se revela si la OS existe.
  select * into o from public.service_orders where id = p_order_id;
  if not found or not private.can_use_orders(o.detail_center_id) or private.discount_level_of(o.detail_center_id) is null then
    raise exception 'OS inexistente o sin permiso para aplicar descuentos' using errcode = '42501';
  end if;
  o := private.lock_service_order(p_order_id, p_version);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'No se aplican promociones a una OS entregada o cancelada' using errcode = '22023';
  end if;
  if o.channel = 'b2b' then
    raise exception 'Las OS B2B usan la tarifa convenida; no llevan promociones' using errcode = 'MG002';
  end if;
  p := private.find_promotion(o.organization_id, o.detail_center_id, p_code);
  if exists (select 1 from public.service_order_discounts d where d.service_order_id = o.id and d.promotion_id is not null and d.voided_at is null) then
    raise exception 'La OS ya tiene una promoción; anúlala antes de aplicar otra' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Promoción ' || p.code);
  if cardinality(p.service_ids) = 0 then
    applied := case when p.kind = 'percent' then round((o.subtotal - coalesce((select sum(i.line_discount) from public.service_order_items i where i.service_order_id = o.id), 0)) * p.value / 100, 2)
                    else least(p.value, o.total - o.paid_amount) end;
    if applied <= 0 or applied > o.total - o.paid_amount then
      raise exception 'La promoción excede el saldo pendiente de la OS' using errcode = 'MG002';
    end if;
    insert into public.service_order_discounts (organization_id, service_order_id, item_id, kind, value, amount, reason,
                                                authorization_level, authorized_by, source, promotion_id)
    values (o.organization_id, o.id, null, p.kind, case when p.kind = 'percent' then p.value else applied end, applied,
            left('Promoción ' || p.code || ': ' || p.name, 500), p.authorization_level, p.created_by, 'promocion', p.id);
  else
    for it in select i.* from public.service_order_items i where i.service_order_id = o.id and i.service_id = any (p.service_ids) order by i.line_subtotal desc loop
      applied := case when p.kind = 'percent' then round(it.line_subtotal * p.value / 100, 2)
                      else least(p.value - total_applied, it.line_subtotal - it.line_discount) end;
      exit when applied <= 0;
      insert into public.service_order_discounts (organization_id, service_order_id, item_id, kind, value, amount, reason,
                                                  authorization_level, authorized_by, source, promotion_id)
      values (o.organization_id, o.id, it.id, p.kind, case when p.kind = 'percent' then p.value else applied end, applied,
              left('Promoción ' || p.code || ': ' || p.name, 500), p.authorization_level, p.created_by, 'promocion', p.id);
      total_applied := total_applied + applied;
      exit when p.kind = 'amount' and total_applied >= p.value;
    end loop;
    if total_applied = 0 then
      raise exception 'La promoción % no aplica a los servicios de esta OS', p.code using errcode = 'MG002';
    end if;
  end if;
  perform private.recalc_service_order(o.id);
  select * into o from public.service_orders where id = o.id;
  if o.total < o.paid_amount then
    raise exception 'La promoción deja saldo a favor del cliente' using errcode = '22023';
  end if;
  perform private.log_event(o.organization_id, o.detail_center_id, 'service_order.promotion_applied',
                            'public.service_orders', o.id::text, jsonb_build_object('promotion', p.code));
  return o;
end;
$$;

-- Los descuentos de promoción ya vienen autorizados: no consumen el nivel de
-- quien aplica un descuento manual después (igual que la membresía).
create or replace function public.add_service_order_discount(
  p_order_id uuid,
  p_version integer,
  p_item_id uuid,
  p_kind text,
  p_value numeric,
  p_reason text
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  new_id uuid := gen_random_uuid();
  base numeric(12, 2);
  remaining numeric(12, 2);
  applied numeric(12, 2);
  preauthorized numeric(12, 2);
  pct numeric;
  required public.discount_level;
  mine public.discount_level;
begin
  o := private.lock_service_order(p_order_id, p_version);
  perform private.set_change_reason(p_reason);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'No se aplican descuentos a una OS entregada o cancelada' using errcode = '22023';
  end if;
  if p_kind not in ('percent', 'amount') or p_value is null or p_value <= 0 or (p_kind = 'percent' and p_value > 100) then
    raise exception 'Descuento inválido' using errcode = '22023';
  end if;
  if p_item_id is not null then
    select i.line_subtotal, i.line_subtotal - i.line_discount into base, remaining
      from public.service_order_items i where i.id = p_item_id and i.service_order_id = o.id;
    if not found then
      raise exception 'La línea no pertenece a la OS' using errcode = '22023';
    end if;
  else
    select o.subtotal - coalesce(sum(i.line_discount), 0) into base
      from public.service_order_items i where i.service_order_id = o.id;
    remaining := o.total;
  end if;
  applied := case when p_kind = 'percent' then round(base * p_value / 100, 2) else p_value end;
  if applied > remaining then
    raise exception 'El descuento excede el importe pendiente' using errcode = '22023';
  end if;
  if applied > o.total - o.paid_amount then
    raise exception 'El descuento deja saldo a favor del cliente; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  select coalesce(sum(d.amount), 0) into preauthorized
    from public.service_order_discounts d
   where d.service_order_id = o.id and d.source in ('membresia', 'promocion') and d.voided_at is null;
  pct := case when o.subtotal > 0 then (o.discount_total - preauthorized + applied) * 100 / o.subtotal else 0 end;
  required := private.discount_required_level(pct);
  mine := private.discount_level_of(o.detail_center_id);
  if mine is null or mine < required then
    raise exception using errcode = '42501', message = format(
      'Un descuento acumulado de %s %% requiere autorización de nivel %s', round(pct, 1), required);
  end if;
  insert into public.service_order_discounts
    (id, organization_id, service_order_id, item_id, kind, value, amount, reason, authorization_level)
  values (new_id, o.organization_id, o.id, p_item_id, p_kind, p_value, applied, btrim(p_reason), required);
  perform private.recalc_service_order(o.id);
  select * into o from public.service_orders where id = o.id;
  if o.total < o.paid_amount then
    raise exception 'El descuento deja saldo a favor del cliente; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  perform private.log_event(o.organization_id, o.detail_center_id, 'service_order.discount_authorized',
                            'public.service_order_discounts', new_id::text,
                            jsonb_build_object('service_order_id', o.id, 'amount', applied, 'percent_total', round(pct, 2),
                                               'level', required));
  return o;
end;
$$;

create or replace function public.add_quote_discount(
  p_quote_id uuid,
  p_version integer,
  p_item_id uuid,
  p_kind text,
  p_value numeric,
  p_reason text
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  base numeric(12, 2);
  remaining numeric(12, 2);
  applied numeric(12, 2);
  preauthorized numeric(12, 2);
  pct numeric;
  required public.discount_level;
  mine public.discount_level;
begin
  q := private.lock_quote(p_quote_id, p_version);
  perform private.check_quote_editable(q);
  perform private.set_change_reason(p_reason);
  if p_kind not in ('percent', 'amount') or p_value is null or p_value <= 0 or (p_kind = 'percent' and p_value > 100) then
    raise exception 'Descuento inválido' using errcode = '22023';
  end if;
  if p_item_id is not null then
    select i.line_subtotal, i.line_subtotal - i.line_discount into base, remaining
      from public.quote_items i where i.id = p_item_id and i.quote_id = q.id;
    if not found then
      raise exception 'La línea no pertenece a la cotización' using errcode = '22023';
    end if;
  else
    select q.subtotal - coalesce(sum(i.line_discount), 0) into base from public.quote_items i where i.quote_id = q.id;
    remaining := q.total;
  end if;
  applied := case when p_kind = 'percent' then round(base * p_value / 100, 2) else p_value end;
  if applied > remaining then
    raise exception 'El descuento excede el importe pendiente' using errcode = '22023';
  end if;
  select coalesce(sum(d.amount), 0) into preauthorized
    from public.quote_discounts d where d.quote_id = q.id and d.source = 'promocion' and d.voided_at is null;
  pct := case when q.subtotal > 0 then (q.discount_total - preauthorized + applied) * 100 / q.subtotal else 0 end;
  required := private.discount_required_level(pct);
  mine := private.discount_level_of(q.detail_center_id);
  if mine is null or mine < required then
    raise exception using errcode = '42501', message = format(
      'Un descuento acumulado de %s %% requiere autorización de nivel %s', round(pct, 1), required);
  end if;
  insert into public.quote_discounts (organization_id, quote_id, item_id, kind, value, amount, reason, authorization_level)
  values (q.organization_id, q.id, p_item_id, p_kind, p_value, applied, btrim(p_reason), required);
  perform private.recalc_quote(q.id);
  update public.quotes set updated_at = now() where id = q.id returning * into q;
  return q;
end;
$$;

create function public.list_promotions(p_organization_id uuid, p_id uuid default null)
returns table (
  id uuid,
  campaign_id uuid,
  campaign_name text,
  code text,
  name text,
  kind text,
  value numeric,
  service_ids uuid[],
  service_names text[],
  detail_center_ids uuid[],
  starts_on date,
  ends_on date,
  max_uses integer,
  uses integer,
  discount_granted numeric,
  active boolean,
  terms text,
  version integer
)
language sql stable security definer set search_path = '' as $$
  -- La campaña sólo se muestra a quien puede verla (una promoción de toda la
  -- organización puede venir de la campaña de otro centro).
  select p.id,
         case when c.id is not null and private.can_read_marketing(c.organization_id, c.detail_center_id) then c.id end,
         case when c.id is not null and private.can_read_marketing(c.organization_id, c.detail_center_id) then c.name end,
         p.code, p.name, p.kind, p.value, p.service_ids,
         coalesce((select array_agg(s.name order by s.name) from public.services s where s.id = any (p.service_ids)), '{}'),
         p.detail_center_ids, p.starts_on, p.ends_on, p.max_uses, private.promotion_uses(p.id),
         coalesce((select sum(d.amount) from public.quote_discounts d where d.promotion_id = p.id and d.voided_at is null), 0)
         + coalesce((select sum(d.amount) from public.service_order_discounts d where d.promotion_id = p.id and d.voided_at is null), 0),
         p.active, p.terms, p.version
    from public.promotions p
    left join public.campaigns c on c.id = p.campaign_id
   where p.organization_id = p_organization_id
     and (p_id is null or p.id = p_id)
     and private.promotion_visible(p)
   order by p.active desc, p.ends_on desc, p.code;
$$;

-- ---------------------------------------------------------------------------
-- 7. Hechos por campaña (sin datos personales)
-- ---------------------------------------------------------------------------

-- Una fila por campaña de la organización visible, con el recorrido de sus
-- prospectos registrados en el periodo (centros visibles), la inversión del
-- periodo y los usos de sus promociones. Las ventas son las OS entregadas que
-- ganaron a esos prospectos (una OS, un prospecto).
create function public.campaign_facts(p_organization_id uuid, p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  campaign_id uuid,
  name text,
  objective text,
  status text,
  starts_on date,
  ends_on date,
  budget numeric,
  spend numeric,
  leads integer,
  contacted integer,
  quoted integer,
  booked integer,
  won integer,
  sales numeric,
  sales_cost numeric,
  sales_margin numeric,
  promo_uses integer,
  promo_discount numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo 366 días)' using errcode = '22023';
  end if;
  return query
  with vis as (
    select c.id from public.detail_centers c
     where c.id = any (p_detail_center_ids) and c.organization_id = p_organization_id
       and private.can_read_commercial_metrics(c.id)
  ), l as (
    select l.*, o.total as o_total, o.cost_total as o_cost
      from public.leads l
      join public.detail_centers dc on dc.id = l.detail_center_id
      left join public.service_orders o on o.id = l.service_order_id and o.status = 'entregada'
     where l.campaign_id is not null
       and l.detail_center_id in (select id from vis)
       and (l.created_at at time zone dc.timezone)::date between p_from and p_to
  )
  select c.id, c.name, c.objective, c.status, c.starts_on, c.ends_on, c.budget,
         coalesce((select sum(s.amount) from public.campaign_spend s
                    where s.campaign_id = c.id and s.voided_at is null and s.spent_on between p_from and p_to), 0),
         (select count(*)::integer from l where l.campaign_id = c.id),
         (select count(*)::integer from l where l.campaign_id = c.id and l.first_contact_at is not null),
         (select count(*)::integer from l where l.campaign_id = c.id
            and exists (select 1 from public.lead_events e where e.lead_id = l.id and e.kind = 'cotizacion')),
         (select count(*)::integer from l where l.campaign_id = c.id
            and exists (select 1 from public.lead_events e where e.lead_id = l.id and e.kind = 'reserva')),
         (select count(*)::integer from l where l.campaign_id = c.id and l.status = 'ganada'),
         (select coalesce(sum(l.o_total), 0) from l where l.campaign_id = c.id),
         (select coalesce(sum(l.o_cost), 0) from l where l.campaign_id = c.id),
         (select coalesce(sum(l.o_total - l.o_cost), 0) from l where l.campaign_id = c.id),
         ((select count(*) from public.quote_discounts d join public.promotions p on p.id = d.promotion_id
            join public.quotes q on q.id = d.quote_id
           where p.campaign_id = c.id and d.voided_at is null and q.detail_center_id in (select id from vis)
             and d.created_at::date between p_from and p_to)
        + (select count(*) from public.service_order_discounts d join public.promotions p on p.id = d.promotion_id
            join public.service_orders o on o.id = d.service_order_id
           where p.campaign_id = c.id and d.voided_at is null and o.detail_center_id in (select id from vis)
             and d.created_at::date between p_from and p_to))::integer,
         coalesce((select sum(d.amount) from public.quote_discounts d join public.promotions p on p.id = d.promotion_id
                    join public.quotes q on q.id = d.quote_id
                   where p.campaign_id = c.id and d.voided_at is null and q.detail_center_id in (select id from vis)
                     and d.created_at::date between p_from and p_to), 0)
        + coalesce((select sum(d.amount) from public.service_order_discounts d join public.promotions p on p.id = d.promotion_id
                    join public.service_orders o on o.id = d.service_order_id
                   where p.campaign_id = c.id and d.voided_at is null and o.detail_center_id in (select id from vis)
                     and d.created_at::date between p_from and p_to), 0)
    from public.campaigns c
   where c.organization_id = p_organization_id
     and exists (select 1 from vis)
     and (c.detail_center_id is null or c.detail_center_id in (select id from vis))
     and c.starts_on <= p_to and c.ends_on >= p_from
   order by c.starts_on desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_manage_marketing(uuid, uuid)', 'private.can_read_marketing(uuid, uuid)',
    'private.can_manage_promotions(uuid)', 'private.promotion_uses(uuid)', 'private.find_promotion(uuid, uuid, text)',
    'private.promotion_visible(public.promotions)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_campaign(uuid, uuid, integer, uuid, text, text, text[], date, date, numeric, text, text, text, text, text, text, text)',
    'public.add_campaign_spend(uuid, date, numeric, text, uuid, text)',
    'public.void_campaign_spend(uuid, text)',
    'public.list_campaigns(uuid, uuid)',
    'public.campaign_spend_entries(uuid)',
    'public.set_lead_campaign(uuid, integer, uuid)',
    'public.upsert_content_post(uuid, uuid, integer, uuid, uuid, text, text, text, text, timestamptz, uuid, text, text)',
    'public.set_content_post_status(uuid, integer, text, text, text)',
    'public.list_content_posts(uuid, date, date, uuid, uuid)',
    'public.upsert_promotion(uuid, uuid, integer, uuid, text, text, text, numeric, uuid[], uuid[], date, date, integer, boolean, text, text)',
    'public.apply_promotion_to_quote(uuid, integer, text)',
    'public.apply_promotion_to_order(uuid, integer, text)',
    'public.list_promotions(uuid, uuid)',
    'public.campaign_facts(uuid, uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
