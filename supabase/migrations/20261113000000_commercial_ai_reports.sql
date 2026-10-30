-- Reportes comerciales escritos por IA (ADR 0051).
--
-- La IA (Claude) redacta un resumen ejecutivo con hallazgos, riesgos y acciones
-- a partir de los KPIs comerciales ya calculados con @meguiars/analytics; no
-- calcula cifras propias. Se guarda un historial inmutable por centro.
--
-- Dos pasos para que nadie publique un texto como si fuera de la IA:
-- 1. start_commercial_ai_report (sesión del usuario): valida que pueda ver las
--    métricas de todos los centros del alcance y deja el reporte «pendiente».
-- 2. complete_commercial_ai_report / fail_commercial_ai_report (sólo servidor,
--    service_role): guarda el texto de la IA o el error.

create table public.commercial_ai_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  detail_center_id uuid not null references public.detail_centers (id) on delete cascade,
  center_ids uuid[] not null check (cardinality(center_ids) between 1 and 50),
  period_from date not null,
  period_to date not null check (period_to >= period_from and period_to - period_from <= 366),
  period_label text not null check (length(period_label) between 1 and 80),
  scope_label text not null check (length(scope_label) between 1 and 400),
  request_id uuid not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'listo', 'fallido')),
  summary text check (length(summary) <= 2000),
  highlights text[] not null default '{}' check (cardinality(highlights) <= 6),
  risks text[] not null default '{}' check (cardinality(risks) <= 6),
  actions text[] not null default '{}' check (cardinality(actions) <= 6),
  model text,
  error text check (length(error) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (created_by, request_id)
);
create index commercial_ai_reports_center_idx on public.commercial_ai_reports (detail_center_id, created_at desc);
comment on table public.commercial_ai_reports is
  'Reportes comerciales redactados por IA a partir de los KPIs de @meguiars/analytics (ADR 0051).';

alter table public.commercial_ai_reports enable row level security;
-- Se ve si se pueden ver las métricas de todos los centros que cubre.
create policy commercial_ai_reports_select on public.commercial_ai_reports
  for select to authenticated using (
    private.can_read_commercial_metrics(detail_center_id)
    and (select bool_and(private.can_read_commercial_metrics(c)) from unnest(center_ids) c)
  );
revoke all on public.commercial_ai_reports from anon;
revoke insert, update, delete, truncate on public.commercial_ai_reports from authenticated;
grant select on public.commercial_ai_reports to authenticated;

create function public.start_commercial_ai_report(
  p_detail_center_id uuid,
  p_center_ids uuid[],
  p_from date,
  p_to date,
  p_period_label text,
  p_scope_label text,
  p_request_id uuid
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  rid uuid;
begin
  if (select auth.uid()) is null or p_request_id is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if p_center_ids is null or cardinality(p_center_ids) = 0 or not (p_detail_center_id = any (p_center_ids)) then
    raise exception 'El alcance debe incluir el centro activo' using errcode = '22023';
  end if;
  select organization_id into org from public.detail_centers where id = p_detail_center_id;
  if org is null
     or exists (select 1 from unnest(p_center_ids) c
                 where not private.can_read_commercial_metrics(c)
                    or not exists (select 1 from public.detail_centers d where d.id = c and d.organization_id = org)) then
    raise exception 'Sin permiso para las métricas comerciales de algún centro' using errcode = '42501';
  end if;
  -- Idempotente: el mismo request_id devuelve el mismo reporte.
  select id into rid from public.commercial_ai_reports
   where created_by = (select auth.uid()) and request_id = p_request_id;
  if rid is not null then return rid; end if;
  -- Límite de costo: 20 reportes por persona al día.
  if (select count(*) from public.commercial_ai_reports
       where created_by = (select auth.uid()) and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Llegaste al límite de 20 reportes por día' using errcode = 'MG002';
  end if;
  insert into public.commercial_ai_reports
    (organization_id, detail_center_id, center_ids, period_from, period_to, period_label, scope_label, request_id)
  values (org, p_detail_center_id, (select array_agg(distinct c) from unnest(p_center_ids) c),
          p_from, p_to, p_period_label, p_scope_label, p_request_id)
  returning id into rid;
  return rid;
end;
$$;

create function public.complete_commercial_ai_report(
  p_id uuid,
  p_summary text,
  p_highlights text[],
  p_risks text[],
  p_actions text[],
  p_model text
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.commercial_ai_reports
     set status = 'listo', summary = p_summary, highlights = coalesce(p_highlights, '{}'),
         risks = coalesce(p_risks, '{}'), actions = coalesce(p_actions, '{}'), model = p_model,
         completed_at = now()
   where id = p_id and status = 'pendiente';
  if not found then
    raise exception 'Reporte inexistente o ya terminado' using errcode = 'P0002';
  end if;
end;
$$;

create function public.fail_commercial_ai_report(p_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.commercial_ai_reports
     set status = 'fallido', error = left(p_error, 500), completed_at = now()
   where id = p_id and status = 'pendiente';
end;
$$;

revoke all on function public.start_commercial_ai_report(uuid, uuid[], date, date, text, text, uuid) from public, anon;
grant execute on function public.start_commercial_ai_report(uuid, uuid[], date, date, text, text, uuid) to authenticated;
revoke all on function public.complete_commercial_ai_report(uuid, text, text[], text[], text[], text) from public, anon, authenticated;
grant execute on function public.complete_commercial_ai_report(uuid, text, text[], text[], text[], text) to service_role;
revoke all on function public.fail_commercial_ai_report(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_commercial_ai_report(uuid, text) to service_role;
