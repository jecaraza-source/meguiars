-- Dirección → Reportes por correo.
--
-- El admin corporativo programa el envío del Tablero corporativo por correo a
-- Dirección (diario, semanal, quincenal o mensual). No hay correos a clientes:
-- los destinatarios los captura sólo el admin corporativo, con motivo y
-- auditoría.
--
-- * public.report_subscriptions: qué se envía (frecuencia y centros) y a quién.
-- * public.report_deliveries: bitácora de cada envío (automático o «Enviar
--   ahora»), con el periodo, los destinatarios, el resultado y el error. Un
--   periodo se envía a lo más una vez por la vía automática (índice único
--   parcial): si el cron corre dos veces o se reintenta, no duplica correos.
--
-- Las cifras se calculan en @meguiars/analytics (mismo cálculo que el tablero)
-- en una ruta server-side de la web programada con Vercel Cron. La ruta usa la
-- llave de servicio sólo en el servidor: public.report_subscription_facts lee
-- los hechos con los permisos del AUTOR de la programación, que debe seguir
-- siendo admin corporativo (ADR 0041).

-- ---------------------------------------------------------------------------
-- 1. Programaciones
-- ---------------------------------------------------------------------------

-- Lista de correos válida: 1..20, sin repetidos, en minúsculas.
create function private.valid_report_recipients(p_emails text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_emails is not null
     and cardinality(p_emails) between 1 and 20
     and not exists (
       select 1 from unnest(p_emails) e
        where e is null or length(e) > 254 or e <> lower(btrim(e))
           or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
     and (select count(distinct e) from unnest(p_emails) e) = cardinality(p_emails);
$$;

create table public.report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 3 and 120),
  frequency text not null check (frequency in ('diario', 'semanal', 'quincenal', 'mensual')),
  -- Centros del reporte; null = todos los centros activos de la organización.
  center_ids uuid[] check (center_ids is null or cardinality(center_ids) between 1 and 50),
  recipients text[] not null check (private.valid_report_recipients(recipients)),
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_subscriptions_org_idx on public.report_subscriptions (organization_id, active);
create index report_subscriptions_created_by_idx on public.report_subscriptions (created_by);

create trigger report_subscriptions_updated_at before update on public.report_subscriptions
  for each row execute function private.set_updated_at();
create trigger report_subscriptions_require_reason before insert or update or delete on public.report_subscriptions
  for each row execute function private.require_change_reason();
create trigger report_subscriptions_audit after insert or update or delete on public.report_subscriptions
  for each row execute function private.audit_row();

alter table public.report_subscriptions enable row level security;
-- Contienen correos y llevan cifras financieras: sólo el admin corporativo.
create policy report_subscriptions_select on public.report_subscriptions
  for select to authenticated using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
revoke all on public.report_subscriptions from anon;
revoke insert, update, delete, truncate on public.report_subscriptions from authenticated;

-- Admin corporativo: crea (p_id null) o cambia una programación con versión y motivo.
create function public.save_report_subscription(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_name text,
  p_frequency text,
  p_center_ids uuid[],
  p_recipients text[],
  p_active boolean,
  p_reason text
) returns public.report_subscriptions
language plpgsql security definer set search_path = '' as $$
declare
  result public.report_subscriptions;
  centers uuid[] := case when p_center_ids is null or cardinality(p_center_ids) = 0 then null
                         else (select array_agg(distinct c order by c) from unnest(p_center_ids) c) end;
  emails text[] := (select array_agg(distinct lower(btrim(e)) order by lower(btrim(e)))
                      from unnest(coalesce(p_recipients, '{}')) e where btrim(e) <> '');
begin
  perform private.set_change_reason(p_reason);
  if not private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo programa los reportes por correo' using errcode = '42501';
  end if;
  if centers is not null and exists (
       select 1 from unnest(centers) c
        where not exists (select 1 from public.detail_centers d where d.id = c and d.organization_id = p_organization_id)) then
    raise exception 'Todos los centros deben ser de la organización' using errcode = '22023';
  end if;
  if not private.valid_report_recipients(emails) then
    raise exception 'Revisa los correos: entre 1 y 20, con formato nombre@dominio' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.report_subscriptions (organization_id, name, frequency, center_ids, recipients, active)
    values (p_organization_id, btrim(p_name), p_frequency, centers, emails, coalesce(p_active, true))
    returning * into result;
    return result;
  end if;
  select * into result from public.report_subscriptions
   where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'La programación no existe' using errcode = 'P0002';
  end if;
  if p_version is null or result.version <> p_version then
    raise exception 'Otro usuario cambió la programación; recarga e intenta de nuevo' using errcode = '40001';
  end if;
  update public.report_subscriptions
     set name = btrim(p_name), frequency = p_frequency, center_ids = centers, recipients = emails,
         active = coalesce(p_active, active),
         -- Quien la cambia queda como autor: el envío automático lee con sus permisos.
         created_by = auth.uid(),
         version = version + 1
   where id = p_id
  returning * into result;
  return result;
exception
  when check_violation or not_null_violation then
    raise exception 'Programación inválida: revisa nombre (3 a 120 letras), frecuencia y centros'
      using errcode = '22023';
end;
$$;

-- Admin corporativo: borra una programación (la bitácora de envíos se conserva).
create function public.delete_report_subscription(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  perform private.set_change_reason(p_reason);
  select organization_id into org from public.report_subscriptions where id = p_id;
  if not found then
    raise exception 'La programación no existe' using errcode = 'P0002';
  end if;
  if not private.has_org_role(org, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo programa los reportes por correo' using errcode = '42501';
  end if;
  delete from public.report_subscriptions where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Bitácora de envíos
-- ---------------------------------------------------------------------------

create table public.report_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid references public.report_subscriptions (id) on delete set null,
  -- Copia al enviar (trazabilidad aunque la programación cambie o se borre).
  subscription_name text not null,
  frequency text not null check (frequency in ('diario', 'semanal', 'quincenal', 'mensual')),
  -- cron: envío automático; manual: «Enviar ahora» del admin corporativo.
  source text not null check (source in ('cron', 'manual')),
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  recipients text[] not null,
  status text not null check (status in ('enviado', 'fallido')),
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 200),
  error text check (error is null or length(error) <= 1000),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((status = 'fallido') = (error is not null))
);
create index report_deliveries_org_idx on public.report_deliveries (organization_id, created_at desc);
create index report_deliveries_subscription_idx on public.report_deliveries (subscription_id, period_from desc);
create index report_deliveries_requested_by_idx on public.report_deliveries (requested_by);
-- Un periodo se envía a lo más una vez por la vía automática.
create unique index report_deliveries_cron_once on public.report_deliveries (subscription_id, period_from, period_to)
  where source = 'cron' and status = 'enviado';

alter table public.report_deliveries enable row level security;
create policy report_deliveries_select on public.report_deliveries
  for select to authenticated using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
revoke all on public.report_deliveries from anon;
revoke insert, update, delete, truncate on public.report_deliveries from authenticated;

-- Registra un envío. El automático (cron) sólo con la llave de servicio; el
-- manual, el admin corporativo. Devuelve null si ese periodo ya se había
-- enviado por la vía automática (corridas simultáneas).
create function public.record_report_delivery(
  p_subscription_id uuid,
  p_source text,
  p_period_from date,
  p_period_to date,
  p_status text,
  p_provider_message_id text,
  p_error text
) returns public.report_deliveries
language plpgsql security definer set search_path = '' as $$
declare
  sub public.report_subscriptions;
  result public.report_deliveries;
begin
  select * into sub from public.report_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'La programación no existe' using errcode = 'P0002';
  end if;
  if p_source = 'cron' then
    if not private.is_service_request() then
      raise exception 'Sólo el envío programado registra envíos automáticos' using errcode = '42501';
    end if;
  elsif p_source = 'manual' then
    if not private.has_org_role(sub.organization_id, array['admin_socio']::public.app_role[]) then
      raise exception 'Sólo el admin corporativo envía reportes' using errcode = '42501';
    end if;
  else
    raise exception 'Origen inválido' using errcode = '22023';
  end if;
  insert into public.report_deliveries (organization_id, subscription_id, subscription_name, frequency, source,
                                        period_from, period_to, recipients, status, provider_message_id, error,
                                        requested_by)
  values (sub.organization_id, sub.id, sub.name, sub.frequency, p_source, p_period_from, p_period_to,
          sub.recipients, p_status, left(p_provider_message_id, 200),
          case when p_status = 'fallido' then left(coalesce(nullif(btrim(p_error), ''), 'Error desconocido'), 1000) end,
          case when p_source = 'manual' then auth.uid() end)
  on conflict (subscription_id, period_from, period_to) where source = 'cron' and status = 'enviado' do nothing
  returning * into result;
  return result;
end;
$$;

-- Hechos del reporte desde el cron: la llave de servicio no tiene centros, así
-- que se leen con los permisos del AUTOR de la programación, que debe seguir
-- siendo admin corporativo de la organización. Sólo para service_role.
create function public.report_subscription_facts(
  p_subscription_id uuid,
  p_sources text[],
  p_detail_center_ids uuid[],
  p_from date,
  p_to date
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sub public.report_subscriptions;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el envío programado lee hechos por programación' using errcode = '42501';
  end if;
  select * into sub from public.report_subscriptions where id = p_subscription_id and active;
  if not found or sub.created_by is null then
    raise exception 'Programación inexistente, inactiva o sin autor' using errcode = 'P0002';
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', sub.created_by, 'role', 'authenticated')::text, true);
  if not private.has_org_role(sub.organization_id, array['admin_socio']::public.app_role[]) then
    raise exception 'Quien programó el reporte ya no es admin corporativo; vuelve a guardarlo con otro admin'
      using errcode = '42501';
  end if;
  return public.dashboard_facts(p_sources, p_detail_center_ids, p_from, p_to, 'total');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------

revoke all on function private.valid_report_recipients(text[]) from public;
grant execute on function private.valid_report_recipients(text[]) to authenticated, service_role;

revoke all on function public.save_report_subscription(uuid, uuid, integer, text, text, uuid[], text[], boolean, text) from public, anon;
grant execute on function public.save_report_subscription(uuid, uuid, integer, text, text, uuid[], text[], boolean, text) to authenticated;
revoke all on function public.delete_report_subscription(uuid, text) from public, anon;
grant execute on function public.delete_report_subscription(uuid, text) to authenticated;
revoke all on function public.record_report_delivery(uuid, text, date, date, text, text, text) from public, anon;
grant execute on function public.record_report_delivery(uuid, text, date, date, text, text, text) to authenticated, service_role;
revoke all on function public.report_subscription_facts(uuid, text[], uuid[], date, date) from public, anon, authenticated;
grant execute on function public.report_subscription_facts(uuid, text[], uuid[], date, date) to service_role;

grant select on public.report_subscriptions, public.report_deliveries to service_role;
grant select on public.kpi_thresholds to service_role;
