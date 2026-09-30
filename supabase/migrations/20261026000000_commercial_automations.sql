-- CR2 fase 4 — Automatizaciones comerciales y hechos del panel comercial.
--
-- Automatizaciones configurables (disparador, condiciones, acción,
-- responsable, límites de frecuencia e historial):
-- * automations: regla por organización o centro. Disparadores: prospecto
--   nuevo, cotización sin respuesta, reserva próxima, servicio entregado
--   (valoración), mantenimiento/recompra y cliente inactivo. Las dos últimas son
--   PROMOCIONALES y exigen consentimiento del canal; las demás son OPERATIVAS.
-- * La acción crea una tarea en la cola del CRM (crm_tasks, origen
--   'automatizacion') con el mensaje sugerido y el horario de contacto, y en
--   prospectos nuevos puede asignar al responsable. La plataforma NO envía
--   mensajes por su cuenta (igual que C2): escribir fuera de la ventana de 24 h
--   de WhatsApp exige plantillas aprobadas por Meta, que no están configuradas.
-- * Límites: una sola acción por sujeto y regla (llave única), enfriamiento por
--   cliente (y entre todas las promocionales), tope por corrida.
-- * Paro de secuencias: la tarea pendiente se cancela con motivo cuando el
--   cliente responde en la bandeja, reserva, retira el consentimiento, se decide
--   la cotización, cambia la cita o se desactiva la regla.
-- * automation_runs / automation_executions: historial de corridas (programada
--   diaria por pg_cron, manual o vista previa) y de cada acción o paro.
--
-- Panel comercial:
-- * commercial_funnel_facts suma campaña y etapa actual del prospecto.
-- * commercial_sales_facts: una fila por OS entregada (no B2B) en el periodo,
--   con cliente nuevo/recurrente y el prospecto, canal, responsable y campaña
--   que la ganaron (una OS gana a lo más un prospecto: no se atribuye dos veces).
-- * campaign_spend_facts: inversión registrada por campaña, canal y origen
--   (ligada a egreso o capturada a mano). No hay datos del proveedor de anuncios.
--
-- Escrituras sólo por RPC con permiso explícito, motivo y auditoría.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- automations.manage: admin de la organización, o admin/encargado del centro.
create function private.can_manage_automations(p_organization_id uuid, p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[])
      or (p_detail_center_id is not null
          and exists (select 1 from public.detail_centers c where c.id = p_detail_center_id and c.organization_id = p_organization_id)
          and private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]));
$$;

-- automations.read: además, el comercial. El historial trae nombres de clientes:
-- el contador no lo ve.
create function private.can_read_automations(p_organization_id uuid, p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[])
      or exists (
        select 1 from public.detail_centers c
         where c.organization_id = p_organization_id
           and (p_detail_center_id is null or c.id = p_detail_center_id)
           and private.has_center_role(c.id, array['admin_socio', 'encargado', 'comercial_b2b']::public.app_role[]));
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- null = todos los centros activos de la organización.
  detail_center_id uuid,
  name text not null check (length(btrim(name)) between 3 and 120),
  trigger text not null check (trigger in (
    'prospecto_nuevo', 'cotizacion_pendiente', 'reserva_proxima', 'servicio_entregado', 'mantenimiento',
    'cliente_inactivo')),
  purpose text not null check (purpose in ('operativa', 'promocional')),
  -- Días del disparador: cotización enviada hace N días, cita dentro de N días,
  -- entregado hace N días, N días desde la última visita.
  delay_days integer not null check (delay_days between 0 and 730),
  -- Condiciones.
  service_ids uuid[] not null default '{}',
  lead_sources text[] not null default '{}'
    check (lead_sources <@ array['instagram', 'facebook', 'whatsapp', 'google', 'recomendacion', 'sitio_web', 'otro']::text[]),
  -- Acción.
  assign_to uuid references auth.users (id) on delete set null,
  due_in_days integer not null default 0 check (due_in_days between 0 and 30),
  message_template text check (message_template is null or length(message_template) <= 1000),
  -- Límites.
  cooldown_days integer not null default 30 check (cooldown_days between 1 and 365),
  max_per_run integer not null default 50 check (max_per_run between 1 and 500),
  contact_from time not null default '09:00',
  contact_to time not null default '19:00',
  active boolean not null default false,
  -- Sólo actúa sobre prospectos registrados después de activarla.
  activated_at timestamptz,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (purpose = case when trigger in ('mantenimiento', 'cliente_inactivo') then 'promocional' else 'operativa' end),
  check (contact_from < contact_to),
  check (active = (activated_at is not null)),
  check (trigger = 'prospecto_nuevo' or cardinality(lead_sources) = 0),
  check (trigger not in ('reserva_proxima', 'cliente_inactivo') or cardinality(service_ids) = 0),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create index automations_org_idx on public.automations (organization_id, active);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  automation_id uuid not null,
  mode text not null check (mode in ('programada', 'manual', 'vista_previa')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  evaluated integer not null default 0,
  created integer not null default 0,
  stopped integer not null default 0,
  -- Candidatos omitidos por motivo (sin_consentimiento, sin_canal, limite_frecuencia, tope_corrida).
  skipped jsonb not null default '{}'::jsonb,
  error text,
  run_by uuid references auth.users (id) on delete set null,
  foreign key (organization_id, automation_id) references public.automations (organization_id, id) on delete cascade
);
create index automation_runs_automation_idx on public.automation_runs (automation_id, started_at desc);

create table public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  automation_id uuid not null,
  run_id uuid references public.automation_runs (id) on delete set null,
  subject_key text not null,
  client_id uuid,
  lead_id uuid,
  quote_id uuid,
  appointment_id uuid,
  service_order_id uuid,
  task_id uuid references public.crm_tasks (id) on delete set null,
  outcome text not null check (outcome in ('tarea_creada', 'detenida')),
  detail text check (detail is null or length(detail) <= 300),
  created_at timestamptz not null default now(),
  foreign key (organization_id, automation_id) references public.automations (organization_id, id) on delete cascade,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
-- Una sola acción por regla y sujeto (reintentos y corridas repetidas no duplican).
create unique index automation_executions_once_idx on public.automation_executions (automation_id, subject_key)
  where outcome = 'tarea_creada';
create index automation_executions_client_idx on public.automation_executions (client_id, created_at desc)
  where client_id is not null;
create index automation_executions_automation_idx on public.automation_executions (automation_id, created_at desc);

create trigger automations_updated_at before update on public.automations
  for each row execute function private.set_updated_at();
create trigger automations_version before update on public.automations
  for each row execute function private.bump_row_version();
create trigger automations_require_reason before insert or update or delete on public.automations
  for each row execute function private.require_change_reason();
create trigger automations_audit after insert or update or delete on public.automations
  for each row execute function private.audit_row();

-- Tareas creadas por automatizaciones.
alter table public.crm_tasks
  add column automation_id uuid,
  add constraint crm_tasks_automation_fk foreign key (organization_id, automation_id)
    references public.automations (organization_id, id) on delete restrict;
alter table public.crm_tasks drop constraint crm_tasks_source_check;
alter table public.crm_tasks add constraint crm_tasks_source_check
  check (source in ('manual', 'os_terminada', 'proxima_visita', 'membresia', 'oportunidad', 'prospecto', 'automatizacion'));
alter table public.crm_tasks drop constraint crm_tasks_lead_source;
alter table public.crm_tasks add constraint crm_tasks_lead_source
  check ((source = 'prospecto' and lead_id is not null)
      or (source = 'automatizacion')
      or (source not in ('prospecto', 'automatizacion') and lead_id is null));
alter table public.crm_tasks add constraint crm_tasks_automation_source
  check ((automation_id is not null) = (source = 'automatizacion'));
create index crm_tasks_automation_idx on public.crm_tasks (automation_id, status) where automation_id is not null;

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_executions enable row level security;

create policy automations_select on public.automations
  for select to authenticated using (private.can_read_automations(organization_id, detail_center_id));
create policy automation_runs_select on public.automation_runs
  for select to authenticated using (
    exists (select 1 from public.automations a where a.id = automation_id
             and private.can_read_automations(a.organization_id, a.detail_center_id)));
create policy automation_executions_select on public.automation_executions
  for select to authenticated using (private.can_read_automations(organization_id, detail_center_id));

revoke all on public.automations, public.automation_runs, public.automation_executions from anon;
revoke insert, update, delete, truncate on public.automations, public.automation_runs, public.automation_executions
  from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reglas
-- ---------------------------------------------------------------------------

-- Canal para una comunicación OPERATIVA con un cliente (sobre su propia cita o
-- servicio): el preferido con consentimiento; si no hay, llamada o WhatsApp al
-- teléfono registrado salvo que el cliente lo haya rechazado expresamente.
create function private.operational_channel(p_client_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when private.best_contact_channel(p_client_id) <> 'presencial' then private.best_contact_channel(p_client_id)
    when exists (select 1 from public.clients c where c.id = p_client_id and c.phone is not null)
         and not exists (select 1 from public.contact_preferences cp
                          where cp.client_id = p_client_id and cp.channel = 'llamada' and not cp.opted_in)
      then 'llamada'
    else null
  end;
$$;

-- Canal para contestar a un prospecto (él escribió primero): WhatsApp si lo
-- autorizó, si no llamada o email con el dato que dejó.
create function private.lead_channel(l public.leads) returns text
language sql immutable set search_path = '' as $$
  select case
    when 'whatsapp' = any (l.consent_channels) and l.phone is not null then 'whatsapp'
    when l.phone is not null then 'llamada'
    when l.email is not null then 'email'
    else null
  end;
$$;

-- Mensaje sugerido: sólo reemplaza datos reales ({nombre}, {servicio},
-- {centro}, {fecha}, {folio}); nunca inventa precios ni promociones.
create function private.render_automation_message(
  p_template text, p_name text, p_service text, p_center text, p_date date, p_folio text
) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(p_template,
           '{nombre}', coalesce(split_part(btrim(p_name), ' ', 1), '')),
           '{servicio}', coalesce(p_service, 'tu servicio')),
           '{centro}', coalesce(p_center, '')),
           '{fecha}', coalesce(to_char(p_date, 'DD/MM/YYYY'), '')),
           '{folio}', coalesce(p_folio, ''));
$$;

-- Candidatos de una regla en un centro (sin datos de contacto: sólo llaves y
-- lo necesario para el mensaje).
create function private.automation_candidates(a public.automations, p_detail_center_id uuid, p_today date)
returns table (
  subject_key text,
  client_id uuid,
  lead_id uuid,
  vehicle_id uuid,
  quote_id uuid,
  appointment_id uuid,
  service_order_id uuid,
  owner_id uuid,
  contact_name text,
  service_name text,
  folio text,
  event_on date
)
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := (select c.timezone from public.detail_centers c where c.id = p_detail_center_id);
begin
  if a.trigger = 'prospecto_nuevo' then
    return query
    select 'lead:' || l.id, null::uuid, l.id, null::uuid, null::uuid, null::uuid, null::uuid, l.owner_id, l.full_name,
           (select s.name from public.lead_services ls join public.services s on s.id = ls.service_id
             where ls.lead_id = l.id order by s.name limit 1),
           null::text, (l.created_at at time zone tz)::date
      from public.leads l
     where l.detail_center_id = p_detail_center_id and l.status = 'abierta'
       -- Activa: desde que se activó; vista previa de una inactiva: últimos 7 días.
       and l.created_at >= coalesce(a.activated_at, now() - interval '7 days')
       and (cardinality(a.lead_sources) = 0 or l.source_channel = any (a.lead_sources))
       and (cardinality(a.service_ids) = 0
            or exists (select 1 from public.lead_services ls where ls.lead_id = l.id and ls.service_id = any (a.service_ids)))
     order by l.created_at;
  elsif a.trigger = 'cotizacion_pendiente' then
    return query
    select 'quote:' || q.id, case when q.lead_id is null then q.client_id end, q.lead_id, q.vehicle_id, q.id,
           null::uuid, null::uuid, coalesce(l.owner_id, q.created_by), q.contact_name,
           (select i.service_name from public.quote_items i where i.quote_id = q.id order by i.position limit 1),
           q.folio, q.valid_until
      from public.quotes q
      left join public.leads l on l.id = q.lead_id
     where q.detail_center_id = p_detail_center_id and q.status = 'enviada' and q.appointment_id is null
       and not private.quote_expired(q)
       and (q.lead_id is not null or q.client_id is not null)
       and (l.id is null or l.status = 'abierta')
       and q.sent_at <= now() - make_interval(days => a.delay_days)
       and q.sent_at >= now() - interval '60 days'
       and (cardinality(a.service_ids) = 0
            or exists (select 1 from public.quote_items i where i.quote_id = q.id and i.service_id = any (a.service_ids)))
     order by q.sent_at;
  elsif a.trigger = 'reserva_proxima' then
    return query
    select 'appt:' || ap.id, ap.client_id, null::uuid, ap.vehicle_id, null::uuid, ap.id, null::uuid, null::uuid,
           c.full_name, null::text, null::text, (ap.starts_at at time zone tz)::date
      from public.appointments ap
      join public.clients c on c.id = ap.client_id
     where ap.detail_center_id = p_detail_center_id and ap.status = 'programada' and not ap.is_walk_in
       and ap.starts_at > now()
       and (ap.starts_at at time zone tz)::date between p_today and p_today + a.delay_days
     order by ap.starts_at;
  elsif a.trigger = 'servicio_entregado' then
    return query
    select 'os:' || o.id, o.client_id, null::uuid, o.vehicle_id, null::uuid, null::uuid, o.id, null::uuid,
           o.client_name,
           (select i.service_name from public.service_order_items i where i.service_order_id = o.id and i.kind = 'servicio'
             order by i.position limit 1),
           o.folio, (o.delivered_at at time zone tz)::date
      from public.service_orders o
     where o.detail_center_id = p_detail_center_id and o.status = 'entregada' and o.channel <> 'b2b'
       and (o.delivered_at at time zone tz)::date between p_today - a.delay_days - 7 and p_today - a.delay_days
       and (cardinality(a.service_ids) = 0
            or exists (select 1 from public.service_order_items i where i.service_order_id = o.id and i.service_id = any (a.service_ids)))
     order by o.delivered_at;
  elsif a.trigger in ('mantenimiento', 'cliente_inactivo') then
    return query
    with last_visit as (
      select distinct on (o.client_id) o.*
        from public.service_orders o
        join public.clients c on c.id = o.client_id
       where o.detail_center_id = p_detail_center_id and o.status = 'entregada' and o.channel <> 'b2b'
         and c.kind = 'person' and c.active
         and (a.trigger = 'cliente_inactivo'
              or exists (select 1 from public.service_order_items i join public.services s on s.id = i.service_id
                          where i.service_order_id = o.id
                            and (case when cardinality(a.service_ids) = 0 then s.revenue_engine = 'recurrente'
                                      else i.service_id = any (a.service_ids) end)))
       order by o.client_id, o.delivered_at desc
    )
    select case when a.trigger = 'mantenimiento' then 'mant:' else 'inact:' end || lv.id, lv.client_id, null::uuid,
           lv.vehicle_id, null::uuid, null::uuid, lv.id, null::uuid, lv.client_name,
           (select i.service_name from public.service_order_items i where i.service_order_id = lv.id and i.kind = 'servicio'
             order by i.position limit 1),
           lv.folio, (lv.delivered_at at time zone tz)::date
      from last_visit lv
     where (lv.delivered_at at time zone tz)::date between p_today - a.delay_days - 30 and p_today - a.delay_days
       -- Ya volvió (cualquier OS posterior) o ya tiene cita: no aplica.
       and not exists (select 1 from public.service_orders o2
                        where o2.client_id = lv.client_id and o2.status <> 'cancelada' and o2.created_at > lv.delivered_at)
       and not exists (select 1 from public.appointments ap
                        where ap.client_id = lv.client_id and ap.status = 'programada' and ap.starts_at > now())
     order by lv.delivered_at;
  end if;
end;
$$;

-- Cancela las tareas pendientes de automatizaciones de un cliente o prospecto
-- (el cliente respondió, reservó...). p_only_promotional_or_quote limita el paro
-- a las reglas que una reserva vuelve innecesarias.
create function private.stop_automation_tasks(
  p_client_id uuid, p_lead_id uuid, p_reason text, p_after timestamptz, p_booking boolean default false
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  n integer := 0;
begin
  for t in
    select ct.id, ct.organization_id, ct.detail_center_id, ct.automation_id, ct.client_id, ct.lead_id, ct.dedupe_key
      from public.crm_tasks ct
      join public.automations a on a.id = ct.automation_id
     where ct.source = 'automatizacion' and ct.status = 'pendiente'
       and ((p_client_id is not null and ct.client_id = p_client_id) or (p_lead_id is not null and ct.lead_id = p_lead_id))
       and ct.created_at <= p_after
       and (not p_booking or a.trigger in ('prospecto_nuevo', 'cotizacion_pendiente', 'mantenimiento', 'cliente_inactivo'))
     for update of ct
  loop
    perform set_config('app.change_reason', 'Automatización detenida: ' || p_reason, true);
    update public.crm_tasks set status = 'cancelada', cancel_reason = p_reason where id = t.id;
    insert into public.automation_executions (organization_id, detail_center_id, automation_id, subject_key, client_id,
                                              lead_id, task_id, outcome, detail)
    values (t.organization_id, t.detail_center_id, t.automation_id,
            coalesce(substr(t.dedupe_key, 43), 'tarea:' || t.id), t.client_id, t.lead_id, t.id, 'detenida', p_reason);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- El cliente respondió en la bandeja: se detienen sus secuencias.
create function private.automation_stop_on_inbound() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cv public.conversations;
begin
  if new.direction <> 'entrante' then
    return null;
  end if;
  select * into cv from public.conversations where id = new.conversation_id;
  if cv.client_id is not null or cv.lead_id is not null then
    perform private.stop_automation_tasks(cv.client_id, cv.lead_id, 'El cliente respondió', new.occurred_at);
  end if;
  return null;
end;
$$;
create trigger messages_stop_automations after insert on public.messages
  for each row execute function private.automation_stop_on_inbound();

-- El cliente reservó: se detienen recordatorios de cotización y promociones.
create function private.automation_stop_on_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('cancelada', 'no_show') then
    return null;
  end if;
  perform private.stop_automation_tasks(new.client_id,
    (select q.lead_id from public.quotes q where q.id = new.quote_id), 'El cliente ya reservó', new.created_at, true);
  return null;
end;
$$;
create trigger appointments_stop_automations after insert on public.appointments
  for each row execute function private.automation_stop_on_booking();

-- Corre una regla. Vista previa: cuenta sin crear nada. Programada/manual:
-- primero detiene lo que ya no aplica, luego crea tareas.
create function private.run_automation(p_automation_id uuid, p_mode text, p_run_by uuid) returns public.automation_runs
language plpgsql security definer set search_path = '' as $$
declare
  a public.automations;
  run public.automation_runs;
  c record;
  r record;
  t record;
  today date;
  v_channel text;
  v_kind text;
  v_reason text;
  v_task public.crm_tasks;
  v_evaluated integer := 0;
  v_created integer := 0;
  v_stopped integer := 0;
  v_skipped jsonb := '{}'::jsonb;
  v_lead public.leads;
  v_notes text;
  v_assign uuid;
begin
  select * into a from public.automations where id = p_automation_id;
  insert into public.automation_runs (organization_id, automation_id, mode, run_by)
  values (a.organization_id, a.id, p_mode, p_run_by)
  returning * into run;

  for c in
    select d.id, d.name from public.detail_centers d
     where d.organization_id = a.organization_id and d.active
       and (a.detail_center_id is null or d.id = a.detail_center_id)
     order by d.id
  loop
    today := private.center_today(c.id);

    -- Paro: lo que dejó de aplicar desde la última corrida.
    if p_mode <> 'vista_previa' then
      for t in
        select ct.*, e.quote_id as e_quote, e.appointment_id as e_appt
          from public.crm_tasks ct
          left join public.automation_executions e on e.task_id = ct.id and e.outcome = 'tarea_creada'
         where ct.automation_id = a.id and ct.detail_center_id = c.id and ct.status = 'pendiente'
         for update of ct
      loop
        v_reason := case
          when t.lead_id is not null and (select l.status from public.leads l where l.id = t.lead_id) <> 'abierta'
            then 'El prospecto ya se cerró'
          when a.trigger = 'cotizacion_pendiente'
               and exists (select 1 from public.quotes q where q.id = t.e_quote
                            and (q.status <> 'enviada' or q.appointment_id is not null or private.quote_expired(q)))
            then 'La cotización ya se decidió, reservó o venció'
          when a.trigger = 'reserva_proxima'
               and exists (select 1 from public.appointments ap where ap.id = t.e_appt and ap.status <> 'programada')
            then 'La cita cambió de estado'
          when a.purpose = 'promocional' and t.client_id is not null and not private.has_consent(t.client_id, t.channel)
            then 'El cliente retiró el consentimiento'
        end;
        if v_reason is not null then
          perform set_config('app.change_reason', 'Automatización detenida: ' || v_reason, true);
          update public.crm_tasks set status = 'cancelada', cancel_reason = v_reason where id = t.id;
          insert into public.automation_executions (organization_id, detail_center_id, automation_id, run_id, subject_key,
                                                    client_id, lead_id, quote_id, appointment_id, task_id, outcome, detail)
          values (a.organization_id, c.id, a.id, run.id, coalesce(substr(t.dedupe_key, 43), 'tarea:' || t.id),
                  t.client_id, t.lead_id, t.e_quote, t.e_appt, t.id, 'detenida', v_reason);
          v_stopped := v_stopped + 1;
        end if;
      end loop;
    end if;

    for r in select * from private.automation_candidates(a, c.id, today) loop
      v_lead := null;
      if exists (select 1 from public.automation_executions e
                  where e.automation_id = a.id and e.subject_key = r.subject_key and e.outcome = 'tarea_creada') then
        continue;
      end if;
      v_evaluated := v_evaluated + 1;
      if v_created >= a.max_per_run then
        v_skipped := jsonb_set(v_skipped, '{tope_corrida}', to_jsonb(coalesce((v_skipped ->> 'tope_corrida')::integer, 0) + 1));
        continue;
      end if;
      -- Canal.
      if r.lead_id is not null then
        select * into v_lead from public.leads where id = r.lead_id;
        v_channel := private.lead_channel(v_lead);
      elsif a.purpose = 'promocional' then
        v_channel := nullif(private.best_contact_channel(r.client_id), 'presencial');
      else
        v_channel := private.operational_channel(r.client_id);
      end if;
      if v_channel is null then
        v_reason := case when a.purpose = 'promocional' then 'sin_consentimiento' else 'sin_canal' end;
        v_skipped := jsonb_set(v_skipped, array[v_reason], to_jsonb(coalesce((v_skipped ->> v_reason)::integer, 0) + 1));
        continue;
      end if;
      -- Frecuencia: la misma regla con el mismo cliente/prospecto, y cualquier
      -- promocional con el mismo cliente, dentro del enfriamiento.
      if exists (
        select 1 from public.automation_executions e
          join public.automations a2 on a2.id = e.automation_id
         where e.outcome = 'tarea_creada' and e.created_at > now() - make_interval(days => a.cooldown_days)
           and ((r.client_id is not null and e.client_id = r.client_id) or (r.lead_id is not null and e.lead_id = r.lead_id))
           and (e.automation_id = a.id or (a.purpose = 'promocional' and a2.purpose = 'promocional'))) then
        v_skipped := jsonb_set(v_skipped, '{limite_frecuencia}',
                               to_jsonb(coalesce((v_skipped ->> 'limite_frecuencia')::integer, 0) + 1));
        continue;
      end if;
      v_created := v_created + 1;
      if p_mode = 'vista_previa' then
        continue;
      end if;

      v_kind := case v_channel when 'llamada' then 'llamar' else v_channel end;
      v_notes := left(a.name
        || coalesce(' · Mensaje sugerido: '
                    || private.render_automation_message(a.message_template, r.contact_name, r.service_name, c.name,
                                                         r.event_on, r.folio), '')
        || ' · Contactar entre ' || to_char(a.contact_from, 'HH24:MI') || ' y ' || to_char(a.contact_to, 'HH24:MI')
        || case when a.purpose = 'promocional' then ' · Promocional: respeta la baja si la pide' else '' end, 1000);
      v_assign := coalesce(a.assign_to, r.owner_id);
      if v_assign is not null and not private.user_has_center_role(
           v_assign, c.id, array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]) then
        v_assign := null;
      end if;
      perform set_config('app.change_reason', 'Automatización: ' || a.name, true);
      insert into public.crm_tasks (organization_id, detail_center_id, client_id, lead_id, vehicle_id, kind, channel, due_on,
                                    notes, source, service_order_id, assigned_to, automation_id, dedupe_key)
      values (a.organization_id, c.id, r.client_id, r.lead_id, r.vehicle_id, v_kind, v_channel, today + a.due_in_days,
              v_notes, 'automatizacion', r.service_order_id, v_assign, a.id, 'auto:' || a.id || ':' || r.subject_key)
      on conflict (organization_id, dedupe_key) do nothing
      returning * into v_task;
      if v_task.id is null then
        v_created := v_created - 1;
        continue;
      end if;
      insert into public.automation_executions (organization_id, detail_center_id, automation_id, run_id, subject_key,
                                                client_id, lead_id, quote_id, appointment_id, service_order_id, task_id, outcome)
      values (a.organization_id, c.id, a.id, run.id, r.subject_key, r.client_id, r.lead_id, r.quote_id, r.appointment_id,
              r.service_order_id, v_task.id, 'tarea_creada');
      -- Prospecto sin responsable: se asigna al de la regla.
      if a.trigger = 'prospecto_nuevo' and a.assign_to is not null and v_lead.owner_id is null and v_assign is not null then
        perform set_config('app.change_reason', 'Asignado por la automatización ' || a.name, true);
        update public.leads set owner_id = v_assign where id = v_lead.id returning * into v_lead;
        perform private.lead_event(v_lead, 'responsable', null, null, null, 'Asignado por la automatización ' || a.name);
      end if;
      v_task := null;
    end loop;
  end loop;

  update public.automation_runs
     set finished_at = now(), evaluated = v_evaluated, created = v_created, stopped = v_stopped, skipped = v_skipped
   where id = run.id
   returning * into run;
  return run;
end;
$$;

-- Todas las reglas activas (pg_cron). Un error en una regla no detiene a las demás.
create function private.run_automations_all() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  total integer := 0;
  run public.automation_runs;
begin
  for a in select id, organization_id from public.automations where active order by created_at loop
    begin
      run := private.run_automation(a.id, 'programada', null);
      total := total + run.created;
    exception when others then
      insert into public.automation_runs (organization_id, automation_id, mode, finished_at, error)
      values (a.organization_id, a.id, 'programada', now(), left(sqlerrm, 300));
    end;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------------

create function public.upsert_automation(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_detail_center_id uuid,
  p_name text,
  p_trigger text,
  p_delay_days integer,
  p_service_ids uuid[],
  p_lead_sources text[],
  p_assign_to uuid,
  p_due_in_days integer,
  p_message_template text,
  p_cooldown_days integer,
  p_max_per_run integer,
  p_contact_from time,
  p_contact_to time,
  p_reason text
) returns public.automations
language plpgsql security definer set search_path = '' as $$
declare
  a public.automations;
  v_services uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(p_service_ids) x), '{}');
  v_sources text[] := coalesce((select array_agg(distinct x order by x) from unnest(p_lead_sources) x), '{}');
  v_template text := nullif(btrim(p_message_template), '');
begin
  if not private.can_manage_automations(p_organization_id, p_detail_center_id) then
    raise exception 'Sin permiso para configurar automatizaciones aquí' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  if exists (select 1 from unnest(v_services) s
              where not exists (select 1 from public.services x where x.id = s and x.organization_id = p_organization_id)) then
    raise exception 'Servicio inexistente' using errcode = '22023';
  end if;
  if p_assign_to is not null then
    if p_detail_center_id is null then
      raise exception 'Para asignar un responsable elige el centro de la automatización' using errcode = 'MG002';
    end if;
    perform private.check_lead_owner(p_assign_to, p_detail_center_id);
  end if;
  if v_template is not null and v_template ~ '\{(?!(nombre|servicio|centro|fecha|folio)\})[^}]*\}' then
    raise exception 'El mensaje sólo admite {nombre}, {servicio}, {centro}, {fecha} y {folio}' using errcode = 'MG002';
  end if;
  if p_id is null then
    insert into public.automations (organization_id, detail_center_id, name, trigger, purpose, delay_days, service_ids,
                                    lead_sources, assign_to, due_in_days, message_template, cooldown_days, max_per_run,
                                    contact_from, contact_to)
    values (p_organization_id, p_detail_center_id, btrim(p_name), p_trigger,
            case when p_trigger in ('mantenimiento', 'cliente_inactivo') then 'promocional' else 'operativa' end,
            p_delay_days, v_services, v_sources, p_assign_to, coalesce(p_due_in_days, 0), v_template,
            coalesce(p_cooldown_days, 30), coalesce(p_max_per_run, 50), coalesce(p_contact_from, '09:00'),
            coalesce(p_contact_to, '19:00'))
    returning * into a;
    return a;
  end if;
  select * into a from public.automations where id = p_id and organization_id = p_organization_id for update;
  if not found or not private.can_manage_automations(a.organization_id, a.detail_center_id) then
    raise exception 'Automatización inexistente o sin permiso' using errcode = '42501';
  end if;
  if a.version <> p_version then
    raise exception 'La automatización cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if a.trigger <> p_trigger then
    raise exception 'El disparador no se cambia: crea otra automatización' using errcode = 'MG002';
  end if;
  update public.automations
     set detail_center_id = p_detail_center_id, name = btrim(p_name), delay_days = p_delay_days, service_ids = v_services,
         lead_sources = v_sources, assign_to = p_assign_to, due_in_days = coalesce(p_due_in_days, 0),
         message_template = v_template, cooldown_days = coalesce(p_cooldown_days, 30),
         max_per_run = coalesce(p_max_per_run, 50), contact_from = coalesce(p_contact_from, '09:00'),
         contact_to = coalesce(p_contact_to, '19:00')
   where id = a.id
   returning * into a;
  return a;
end;
$$;

-- Activar / desactivar. Al desactivar se cancelan sus tareas pendientes.
create function public.set_automation_active(p_id uuid, p_version integer, p_active boolean, p_reason text)
returns public.automations
language plpgsql security definer set search_path = '' as $$
declare
  a public.automations;
  t record;
begin
  select * into a from public.automations where id = p_id for update;
  if not found or not private.can_manage_automations(a.organization_id, a.detail_center_id) then
    raise exception 'Automatización inexistente o sin permiso' using errcode = '42501';
  end if;
  if a.version <> p_version then
    raise exception 'La automatización cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  perform private.set_change_reason(p_reason);
  if a.active = p_active then
    return a;
  end if;
  update public.automations
     set active = p_active, activated_at = case when p_active then now() end
   where id = a.id
   returning * into a;
  if not p_active then
    for t in select * from public.crm_tasks where automation_id = a.id and status = 'pendiente' for update loop
      perform private.set_change_reason(p_reason);
      update public.crm_tasks set status = 'cancelada', cancel_reason = 'Automatización desactivada' where id = t.id;
      insert into public.automation_executions (organization_id, detail_center_id, automation_id, subject_key, client_id,
                                                lead_id, task_id, outcome, detail)
      values (t.organization_id, t.detail_center_id, a.id, coalesce(substr(t.dedupe_key, 43), 'tarea:' || t.id),
              t.client_id, t.lead_id, t.id, 'detenida', 'Automatización desactivada');
    end loop;
  end if;
  return a;
end;
$$;

-- Ejecutar ahora o vista previa (qué haría hoy, sin crear nada).
create function public.run_automation_now(p_id uuid, p_preview boolean) returns public.automation_runs
language plpgsql security definer set search_path = '' as $$
declare
  a public.automations;
begin
  select * into a from public.automations where id = p_id;
  if not found or not private.can_manage_automations(a.organization_id, a.detail_center_id) then
    raise exception 'Automatización inexistente o sin permiso' using errcode = '42501';
  end if;
  if not p_preview and not a.active then
    raise exception 'Activa la automatización antes de ejecutarla' using errcode = 'MG002';
  end if;
  return private.run_automation(a.id, case when p_preview then 'vista_previa' else 'manual' end, auth.uid());
end;
$$;

create function public.list_automations(p_organization_id uuid)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  name text,
  trigger text,
  purpose text,
  delay_days integer,
  service_ids uuid[],
  service_names text[],
  lead_sources text[],
  assign_to uuid,
  assign_to_name text,
  due_in_days integer,
  message_template text,
  cooldown_days integer,
  max_per_run integer,
  contact_from text,
  contact_to text,
  active boolean,
  activated_at timestamptz,
  version integer,
  last_run_at timestamptz,
  last_run_mode text,
  last_run_created integer,
  last_run_error text,
  tasks_created integer,
  tasks_pending integer,
  tasks_done integer,
  tasks_stopped integer,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.detail_center_id, dc.name, a.name, a.trigger, a.purpose, a.delay_days, a.service_ids,
         coalesce((select array_agg(s.name order by s.name) from public.services s where s.id = any (a.service_ids)), '{}'),
         a.lead_sources, a.assign_to,
         (select p.full_name from public.profiles p where p.id = a.assign_to),
         a.due_in_days, a.message_template, a.cooldown_days, a.max_per_run,
         to_char(a.contact_from, 'HH24:MI'), to_char(a.contact_to, 'HH24:MI'), a.active, a.activated_at, a.version,
         lr.started_at, lr.mode, lr.created, lr.error,
         (select count(*)::integer from public.crm_tasks t where t.automation_id = a.id),
         (select count(*)::integer from public.crm_tasks t where t.automation_id = a.id and t.status = 'pendiente'),
         (select count(*)::integer from public.crm_tasks t where t.automation_id = a.id and t.status = 'hecha'),
         (select count(*)::integer from public.crm_tasks t where t.automation_id = a.id and t.status = 'cancelada'),
         private.can_manage_automations(a.organization_id, a.detail_center_id)
    from public.automations a
    left join public.detail_centers dc on dc.id = a.detail_center_id
    left join lateral (select r.* from public.automation_runs r where r.automation_id = a.id and r.mode <> 'vista_previa'
                        order by r.started_at desc limit 1) lr on true
   where a.organization_id = p_organization_id
     and private.can_read_automations(a.organization_id, a.detail_center_id)
   order by a.active desc, a.name;
$$;

create function public.automation_runs_list(p_automation_id uuid, p_limit integer default 20)
returns setof public.automation_runs
language sql stable security definer set search_path = '' as $$
  select r.* from public.automation_runs r
    join public.automations a on a.id = r.automation_id
   where r.automation_id = p_automation_id
     and private.can_read_automations(a.organization_id, a.detail_center_id)
   order by r.started_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create function public.automation_executions_list(p_automation_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  created_at timestamptz,
  detail_center_name text,
  outcome text,
  detail text,
  subject_key text,
  contact_name text,
  client_id uuid,
  lead_id uuid,
  task_id uuid,
  task_status text,
  task_outcome text,
  task_due_on date,
  task_channel text,
  assigned_to_name text
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.created_at, dc.name, e.outcome, e.detail, e.subject_key,
         coalesce((select l.full_name from public.leads l where l.id = e.lead_id),
                  (select c.full_name from public.clients c where c.id = e.client_id)),
         e.client_id, e.lead_id, e.task_id, t.status, t.outcome, t.due_on, t.channel,
         (select p.full_name from public.profiles p where p.id = t.assigned_to)
    from public.automation_executions e
    join public.detail_centers dc on dc.id = e.detail_center_id
    left join public.crm_tasks t on t.id = e.task_id
   where e.automation_id = p_automation_id
     and private.can_read_automations(e.organization_id, e.detail_center_id)
   order by e.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- 5. Hechos del panel comercial
-- ---------------------------------------------------------------------------

drop function public.commercial_funnel_facts(uuid[], date, date);
create function public.commercial_funnel_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  lead_id uuid,
  detail_center_id uuid,
  source_channel text,
  owner_id uuid,
  created_at timestamptz,
  first_contact_minutes numeric,
  quoted_at timestamptz,
  booked_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  loss_reason text,
  status text,
  sale_total numeric,
  sale_cost numeric,
  sale_margin numeric,
  interest_service_ids uuid[],
  campaign_id uuid,
  stage_name text,
  stage_position integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo 366 días)' using errcode = '22023';
  end if;
  return query
  select l.id, l.detail_center_id, l.source_channel, l.owner_id, l.created_at,
         case when l.first_contact_at is null then null
              else round(extract(epoch from (l.first_contact_at - l.created_at)) / 60, 1) end,
         (select min(e.occurred_at) from public.lead_events e where e.lead_id = l.id and e.kind = 'cotizacion'),
         (select min(e.occurred_at) from public.lead_events e where e.lead_id = l.id and e.kind = 'reserva'),
         case when l.status = 'ganada' then l.closed_at end,
         case when l.status = 'perdida' then l.closed_at end,
         l.loss_reason, l.status,
         o.total, o.cost_total, o.total - o.cost_total,
         coalesce((select array_agg(ls.service_id) from public.lead_services ls where ls.lead_id = l.id), '{}'),
         l.campaign_id, st.name, st.position::integer
    from public.leads l
    join public.detail_centers dc on dc.id = l.detail_center_id
    join public.lead_stages st on st.id = l.stage_id
    left join public.service_orders o on o.id = l.service_order_id
   where l.detail_center_id = any (p_detail_center_ids)
     and private.can_read_commercial_metrics(l.detail_center_id)
     and (l.created_at at time zone dc.timezone)::date between p_from and p_to
   order by l.created_at;
end;
$$;

-- Una fila por OS entregada (no B2B) en el periodo. first_purchase: primera OS
-- entregada del cliente en la organización. El prospecto que la ganó (a lo más
-- uno) aporta canal, responsable y campaña.
create function public.commercial_sales_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  service_order_id uuid,
  detail_center_id uuid,
  delivered_on date,
  total numeric,
  cost_total numeric,
  margin numeric,
  discount_total numeric,
  client_id uuid,
  first_purchase boolean,
  lead_id uuid,
  source_channel text,
  owner_id uuid,
  campaign_id uuid,
  service_ids uuid[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo 366 días)' using errcode = '22023';
  end if;
  return query
  select o.id, o.detail_center_id, (o.delivered_at at time zone dc.timezone)::date, o.total, o.cost_total,
         o.total - o.cost_total, o.discount_total, o.client_id,
         not exists (select 1 from public.service_orders p
                      where p.client_id = o.client_id and p.status = 'entregada' and p.channel <> 'b2b'
                        and (p.delivered_at, p.id) < (o.delivered_at, o.id)),
         l.id, l.source_channel, l.owner_id, l.campaign_id,
         coalesce((select array_agg(distinct i.service_id) from public.service_order_items i
                    where i.service_order_id = o.id and i.kind = 'servicio'), '{}')
    from public.service_orders o
    join public.detail_centers dc on dc.id = o.detail_center_id
    left join public.leads l on l.service_order_id = o.id and l.status = 'ganada'
   where o.detail_center_id = any (p_detail_center_ids)
     and private.can_read_commercial_metrics(o.detail_center_id)
     and o.status = 'entregada' and o.channel <> 'b2b'
     and (o.delivered_at at time zone dc.timezone)::date between p_from and p_to
   order by o.delivered_at;
end;
$$;

-- Inversión registrada (no anulada) por campaña y canal, con su origen.
create function public.campaign_spend_facts(p_organization_id uuid, p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  spend_id uuid,
  campaign_id uuid,
  campaign_detail_center_id uuid,
  channel text,
  spent_on date,
  amount numeric,
  origin text
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
  )
  select s.id, s.campaign_id, c.detail_center_id, s.channel, s.spent_on, s.amount,
         case when s.expense_id is not null then 'egreso' else 'manual' end
    from public.campaign_spend s
    join public.campaigns c on c.id = s.campaign_id
   where c.organization_id = p_organization_id
     and exists (select 1 from vis)
     and (c.detail_center_id is null or c.detail_center_id in (select id from vis))
     and s.voided_at is null and s.spent_on between p_from and p_to
   order by s.spent_on;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Programación diaria y grants
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron no está disponible: las automatizaciones no se programan en esta base';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  if exists (select 1 from cron.job where jobname = 'automatizaciones-comerciales') then
    perform cron.unschedule('automatizaciones-comerciales');
  end if;
  -- 14:00 UTC = 08:00 en Ciudad de México y Monterrey (después de los pendientes del CRM).
  perform cron.schedule('automatizaciones-comerciales', '0 14 * * *', 'select private.run_automations_all()');
end $$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_manage_automations(uuid, uuid)', 'private.can_read_automations(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Sólo el sistema o las RPC que ya validaron permisos.
  foreach fn in array array[
    'private.operational_channel(uuid)', 'private.lead_channel(public.leads)',
    'private.render_automation_message(text, text, text, text, date, text)',
    'private.automation_candidates(public.automations, uuid, date)',
    'private.stop_automation_tasks(uuid, uuid, text, timestamptz, boolean)',
    'private.automation_stop_on_inbound()', 'private.automation_stop_on_booking()',
    'private.run_automation(uuid, text, uuid)', 'private.run_automations_all()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_automation(uuid, uuid, integer, uuid, text, text, integer, uuid[], text[], uuid, integer, text, integer, integer, time, time, text)',
    'public.set_automation_active(uuid, integer, boolean, text)',
    'public.run_automation_now(uuid, boolean)',
    'public.list_automations(uuid)',
    'public.automation_runs_list(uuid, integer)',
    'public.automation_executions_list(uuid, integer)',
    'public.commercial_funnel_facts(uuid[], date, date)',
    'public.commercial_sales_facts(uuid[], date, date)',
    'public.campaign_spend_facts(uuid, uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
