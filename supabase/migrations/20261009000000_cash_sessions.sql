-- AF3 — Administración y Finanzas / Corte de caja y conciliación diaria.
--
-- Control diario de la caja por centro y turno: apertura con fondo, cierre con
-- el efectivo contado por el encargado, diferencia calculada por la base y
-- resumen informativo de tarjeta y transferencia.
--
-- * cash_sessions: la caja de un centro en un día y turno (folio
--   CDMX-01-C-000001). Una sola abierta por centro. Su ventana es
--   [opened_at, window_end): window_end se fija en el primer cierre y ya no cambia.
-- * cash_closings: cada cierre es una versión inmutable con la foto del corte
--   (esperado, contado, diferencia y desglose por forma de pago). Reabrir y
--   volver a cerrar agrega una versión; nunca reescribe la anterior.
-- * cash_reopenings: reapertura (sólo admin) con motivo obligatorio, inmutable.
--
-- Efectivo esperado (reproducible desde los pagos, sin totales guardados aparte):
--   fondo inicial
--   + Σ efectivo de los recibos emitidos en la ventana (el cambio ya está descontado)
--   − Σ efectivo de los reversos ejecutados en la ventana (reembolsos que salen de caja)
-- Un recibo cobrado y revertido en el mismo turno suma cero; uno cobrado en un
-- corte ya cerrado y revertido después se descuenta del turno del reverso, sin
-- tocar el corte cerrado.
--
-- Bloqueo: ningún cobro ni reverso puede caer dentro de la ventana de un corte
-- cerrado (trigger con candado por centro, compartido con el cierre). Por eso
-- recalcular un corte cerrado da siempre el mismo resultado.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- cash.read: cortes del centro (recepción y contador también).
create function private.can_read_cash(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_read_payments(p_detail_center_id);
$$;

-- cash.operate: abrir y cerrar (arqueo), encargado o admin del centro.
create function private.can_operate_cash(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- cash.reopen: reabrir un corte cerrado, sólo el admin.
create function private.can_reopen_cash(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table private.cash_session_counters (
  detail_center_id uuid primary key references public.detail_centers (id) on delete cascade,
  last_number integer not null
);
revoke all on private.cash_session_counters from public, anon, authenticated;
alter table private.cash_session_counters enable row level security;

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  number integer not null check (number > 0),
  folio text not null,
  -- Día de operación en el calendario del centro y turno.
  business_date date not null,
  shift text not null check (shift in ('unico', 'matutino', 'vespertino', 'nocturno')),
  opening_float numeric(12, 2) not null check (opening_float >= 0),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada', 'reabierta')),
  opened_by uuid default auth.uid() references auth.users (id) on delete set null,
  opened_at timestamptz not null default now(),
  -- Fin de la ventana: se fija en el primer cierre y no cambia al reabrir.
  window_end timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  closings_count smallint not null default 0,
  notes text check (notes is null or length(notes) <= 500),
  version integer not null default 1,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (detail_center_id, number),
  unique (detail_center_id, business_date, shift),
  check ((status = 'abierta') = (window_end is null)),
  check ((status = 'cerrada') = (closed_at is not null)),
  check (window_end is null or window_end >= opened_at),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
-- Una sola caja abierta por centro.
create unique index cash_sessions_one_open on public.cash_sessions (detail_center_id) where status = 'abierta';
create index cash_sessions_center_date_idx on public.cash_sessions (detail_center_id, business_date);

create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  session_id uuid not null,
  sequence smallint not null check (sequence > 0),
  window_from timestamptz not null,
  window_to timestamptz not null,
  opening_float numeric(12, 2) not null,
  cash_collected numeric(12, 2) not null,
  cash_refunded numeric(12, 2) not null,
  expected_cash numeric(12, 2) not null,
  counted_cash numeric(12, 2) not null check (counted_cash >= 0),
  difference numeric(12, 2) not null,
  card_total numeric(12, 2) not null,
  transfer_total numeric(12, 2) not null,
  non_cash_total numeric(12, 2) not null,
  payments_count integer not null,
  reversals_count integer not null,
  -- Desglose por forma de pago: [{method, name, kind, collects_cash, collected, collected_count, refunded, refunded_count}]
  breakdown jsonb not null,
  notes text check (notes is null or length(notes) <= 500),
  closed_by uuid default auth.uid() references auth.users (id) on delete set null,
  closed_at timestamptz not null default now(),
  request_id uuid not null,
  unique (session_id, sequence),
  unique (organization_id, request_id),
  check (expected_cash = opening_float + cash_collected - cash_refunded),
  check (difference = counted_cash - expected_cash),
  check (window_to >= window_from),
  foreign key (organization_id, session_id) references public.cash_sessions (organization_id, id) on delete restrict
);
create index cash_closings_session_idx on public.cash_closings (session_id, sequence);

create table public.cash_reopenings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  session_id uuid not null,
  -- Versión del cierre que se reabre.
  closing_id uuid not null references public.cash_closings (id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  reopened_by uuid default auth.uid() references auth.users (id) on delete set null,
  reopened_at timestamptz not null default now(),
  foreign key (organization_id, session_id) references public.cash_sessions (organization_id, id) on delete restrict
);
create index cash_reopenings_session_idx on public.cash_reopenings (session_id, reopened_at);

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

create trigger cash_sessions_updated_at before update on public.cash_sessions
  for each row execute function private.set_updated_at();

create trigger cash_sessions_require_reason before insert or update or delete on public.cash_sessions
  for each row execute function private.require_change_reason();
create trigger cash_closings_require_reason before insert or update or delete on public.cash_closings
  for each row execute function private.require_change_reason();
create trigger cash_reopenings_require_reason before insert or update or delete on public.cash_reopenings
  for each row execute function private.require_change_reason();

create trigger cash_sessions_audit after insert or update or delete on public.cash_sessions
  for each row execute function private.audit_row();
create trigger cash_closings_audit after insert or update or delete on public.cash_closings
  for each row execute function private.audit_row();
create trigger cash_reopenings_audit after insert or update or delete on public.cash_reopenings
  for each row execute function private.audit_row();

-- Versiones de cierre y reaperturas: inmutables.
create function private.forbid_cash_history_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial del corte de caja es inmutable' using errcode = '42501';
end;
$$;
create trigger cash_closings_immutable before update or delete on public.cash_closings
  for each row execute function private.forbid_cash_history_changes();
create trigger cash_reopenings_immutable before update or delete on public.cash_reopenings
  for each row execute function private.forbid_cash_history_changes();

-- Un corte cerrado queda bloqueado: sólo la reapertura (RPC del admin) lo
-- cambia. La ventana, el fondo y el turno no cambian después del primer cierre.
-- Nada se borra.
create function private.guard_cash_session() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los cortes de caja no se borran' using errcode = '42501';
  end if;
  if old.status = 'cerrada' and current_setting('app.cash_reopen', true) is distinct from 'on' then
    raise exception 'El corte está cerrado; sólo el admin puede reabrirlo' using errcode = '22023';
  end if;
  if new.opened_at is distinct from old.opened_at or new.opening_float is distinct from old.opening_float
     or new.business_date is distinct from old.business_date or new.shift is distinct from old.shift
     or new.detail_center_id is distinct from old.detail_center_id or new.number is distinct from old.number
     or (old.window_end is not null and new.window_end is distinct from old.window_end) then
    raise exception 'La ventana, el fondo y el turno del corte no cambian' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger cash_sessions_guard before update or delete on public.cash_sessions
  for each row execute function private.guard_cash_session();

-- Candado por centro compartido por el cierre y por cada cobro o reverso.
create function private.lock_cash_center(p_detail_center_id uuid) returns void
language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('cash:' || p_detail_center_id::text, 0));
$$;

-- Ningún cobro ni reverso cae dentro de la ventana de un corte cerrado o
-- reabierto: el corte se vuelve a cerrar con el mismo esperado. Si el cobro
-- empezó antes del cierre y lo alcanzó, el reintento (idempotente por
-- solicitud) queda en el siguiente turno.
create function private.guard_cash_window() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ts timestamptz := (to_jsonb(new) ->> tg_argv[0])::timestamptz;
begin
  perform private.lock_cash_center(new.detail_center_id);
  if exists (select 1 from public.cash_sessions s
              where s.detail_center_id = new.detail_center_id and s.window_end is not null
                and ts >= s.opened_at and ts < s.window_end) then
    raise exception 'El corte de caja de ese horario ya se cerró; vuelve a intentarlo' using errcode = '40001';
  end if;
  return new;
end;
$$;
create trigger payments_cash_window before insert on public.payments
  for each row execute function private.guard_cash_window('received_at');
create trigger payment_reversals_cash_window before insert on public.payment_reversals
  for each row execute function private.guard_cash_window('reversed_at');

-- ---------------------------------------------------------------------------
-- 4. Efectivo esperado (reproducible desde los pagos)
-- ---------------------------------------------------------------------------

-- Por forma de pago en la ventana [p_from, p_to): lo cobrado en recibos emitidos
-- en la ventana (sin importar si después se revirtieron) y lo reembolsado por
-- reversos ejecutados en la ventana. p_to null = hasta ahora.
create function private.cash_window_facts(p_detail_center_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  method text,
  method_name text,
  kind text,
  collects_cash boolean,
  collected numeric,
  collected_count integer,
  refunded numeric,
  refunded_count integer
)
language sql stable security definer set search_path = '' as $$
  with col as (
    select t.method, sum(t.amount) as amount, count(distinct p.id)::integer as n
      from public.payments p join public.payment_tenders t on t.payment_id = p.id
     where p.detail_center_id = p_detail_center_id
       and p.received_at >= p_from and p.received_at < coalesce(p_to, 'infinity')
     group by t.method
  ), ref as (
    select t.method, sum(t.amount) as amount, count(distinct r.payment_id)::integer as n
      from public.payment_reversals r join public.payment_tenders t on t.payment_id = r.payment_id
     where r.detail_center_id = p_detail_center_id
       and r.reversed_at >= p_from and r.reversed_at < coalesce(p_to, 'infinity')
     group by t.method
  )
  select m.code, m.name, m.kind, m.collects_cash, coalesce(col.amount, 0), coalesce(col.n, 0),
         coalesce(ref.amount, 0), coalesce(ref.n, 0)
    from public.payment_methods m
    left join col on col.method = m.code
    left join ref on ref.method = m.code
   where m.active or col.method is not null or ref.method is not null
   order by m.position;
$$;

-- Totales del corte en la ventana (espejo de cashTotals en el dominio).
create function private.cash_window_totals(p_detail_center_id uuid, p_from timestamptz, p_to timestamptz,
                                           p_opening_float numeric)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with f as (select * from private.cash_window_facts(p_detail_center_id, p_from, p_to))
  select jsonb_build_object(
    'opening_float', p_opening_float,
    'cash_collected', coalesce((select sum(collected) from f where kind = 'efectivo'), 0),
    'cash_refunded', coalesce((select sum(refunded) from f where kind = 'efectivo'), 0),
    'expected_cash', p_opening_float + coalesce((select sum(collected - refunded) from f where kind = 'efectivo'), 0),
    'card_total', coalesce((select sum(collected - refunded) from f where method = 'tarjeta'), 0),
    'transfer_total', coalesce((select sum(collected - refunded) from f where method = 'transferencia'), 0),
    'non_cash_total', coalesce((select sum(collected - refunded) from f where not collects_cash), 0),
    'payments_count', (select count(*) from public.payments p
                        where p.detail_center_id = p_detail_center_id
                          and p.received_at >= p_from and p.received_at < coalesce(p_to, 'infinity')),
    'reversals_count', (select count(*) from public.payment_reversals r
                         where r.detail_center_id = p_detail_center_id
                           and r.reversed_at >= p_from and r.reversed_at < coalesce(p_to, 'infinity')),
    'breakdown', coalesce((select jsonb_agg(jsonb_build_object(
        'method', method, 'name', method_name, 'kind', kind, 'collects_cash', collects_cash,
        'collected', collected, 'collected_count', collected_count,
        'refunded', refunded, 'refunded_count', refunded_count)) from f), '[]'::jsonb));
$$;

create function private.next_cash_session_number(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.cash_session_counters (detail_center_id, last_number) values (p_detail_center_id, 1)
  on conflict (detail_center_id) do update set last_number = private.cash_session_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

create function private.lock_cash_session(p_session_id uuid, p_version integer) returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare
  s public.cash_sessions;
begin
  select * into s from public.cash_sessions where id = p_session_id for update;
  if not found or not private.can_read_cash(s.detail_center_id) then
    raise exception 'Corte inexistente o sin permiso' using errcode = '42501';
  end if;
  if s.version <> p_version then
    raise exception 'El corte cambió en otro dispositivo; recarga para ver la versión actual' using errcode = '40001';
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS (sólo lectura; escrituras por RPC)
-- ---------------------------------------------------------------------------

alter table public.cash_sessions enable row level security;
alter table public.cash_closings enable row level security;
alter table public.cash_reopenings enable row level security;

create policy cash_sessions_select on public.cash_sessions
  for select to authenticated using (private.can_read_cash(detail_center_id));
create policy cash_closings_select on public.cash_closings
  for select to authenticated using (private.can_read_cash(detail_center_id));
create policy cash_reopenings_select on public.cash_reopenings
  for select to authenticated using (private.can_read_cash(detail_center_id));

revoke all on public.cash_sessions, public.cash_closings, public.cash_reopenings from anon;
revoke insert, update, delete, truncate on public.cash_sessions, public.cash_closings, public.cash_reopenings
  from authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC de escritura
-- ---------------------------------------------------------------------------

-- Apertura de caja del turno (encargado o admin) con fondo inicial. Una sola
-- abierta por centro y un corte por día y turno. Idempotente por p_request_id.
create function public.open_cash_session(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_shift text,
  p_opening_float numeric,
  p_notes text default null
) returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare
  result public.cash_sessions;
  org uuid;
  v_code text;
  today date;
  n integer;
begin
  if not private.can_operate_cash(p_detail_center_id) then
    raise exception 'Sólo el encargado o el admin del centro abren la caja' using errcode = '42501';
  end if;
  select dc.organization_id, dc.code into org, v_code from public.detail_centers dc where dc.id = p_detail_center_id;
  select * into result from public.cash_sessions where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  if p_shift is null or p_shift not in ('unico', 'matutino', 'vespertino', 'nocturno') then
    raise exception 'Turno inválido' using errcode = '22023';
  end if;
  if p_opening_float is null or p_opening_float < 0 or p_opening_float <> round(p_opening_float, 2) then
    raise exception 'Fondo inicial inválido' using errcode = '22023';
  end if;
  perform private.lock_cash_center(p_detail_center_id);
  if exists (select 1 from public.cash_sessions s where s.detail_center_id = p_detail_center_id and s.status = 'abierta') then
    raise exception 'Ya hay una caja abierta en el centro; ciérrala antes de abrir otra' using errcode = 'MG002';
  end if;
  today := private.center_today(p_detail_center_id);
  if exists (select 1 from public.cash_sessions s
              where s.detail_center_id = p_detail_center_id and s.business_date = today and s.shift = p_shift) then
    raise exception 'Ya existe el corte de ese turno hoy' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Apertura de caja');
  n := private.next_cash_session_number(p_detail_center_id);
  insert into public.cash_sessions (organization_id, detail_center_id, number, folio, business_date, shift,
                                    opening_float, notes, request_id)
  values (org, p_detail_center_id, n, v_code || '-C-' || lpad(n::text, 6, '0'), today, p_shift,
          p_opening_float, nullif(btrim(p_notes), ''), p_request_id)
  returning * into result;
  return result;
end;
$$;

-- Cierre (arqueo): el encargado captura el efectivo contado; la base calcula el
-- esperado desde los pagos y la diferencia. Una diferencia distinta de cero
-- exige nota. Crea la versión del cierre (la primera fija la ventana).
-- Idempotente por p_request_id.
create function public.close_cash_session(
  p_session_id uuid,
  p_version integer,
  p_request_id uuid,
  p_counted_cash numeric,
  p_notes text default null
) returns public.cash_closings
language plpgsql security definer set search_path = '' as $$
declare
  s public.cash_sessions;
  result public.cash_closings;
  w_end timestamptz;
  t jsonb;
  diff numeric;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found or not private.can_operate_cash(s.detail_center_id) then
    raise exception 'Sólo el encargado o el admin del centro cierran la caja' using errcode = '42501';
  end if;
  select * into result from public.cash_closings where organization_id = s.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if p_counted_cash is null or p_counted_cash < 0 or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'Efectivo contado inválido' using errcode = '22023';
  end if;
  -- Candado del centro antes del de la fila: los cobros en curso terminan antes
  -- de calcular el esperado y los que lleguen después quedan fuera de la ventana.
  perform private.lock_cash_center(s.detail_center_id);
  s := private.lock_cash_session(p_session_id, p_version);
  if s.status = 'cerrada' then
    raise exception 'El corte ya está cerrado' using errcode = '22023';
  end if;
  w_end := coalesce(s.window_end, now());
  t := private.cash_window_totals(s.detail_center_id, s.opened_at, w_end, s.opening_float);
  diff := p_counted_cash - (t ->> 'expected_cash')::numeric;
  if diff <> 0 and (p_notes is null or length(btrim(p_notes)) < 3) then
    raise exception 'Explica la diferencia (faltante o sobrante) en la nota' using errcode = '22023';
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_notes), ''), 'Cierre de caja ' || s.folio));
  insert into public.cash_closings (organization_id, detail_center_id, session_id, sequence, window_from, window_to,
    opening_float, cash_collected, cash_refunded, expected_cash, counted_cash, difference, card_total, transfer_total,
    non_cash_total, payments_count, reversals_count, breakdown, notes, request_id)
  values (s.organization_id, s.detail_center_id, s.id, s.closings_count + 1, s.opened_at, w_end,
    s.opening_float, (t ->> 'cash_collected')::numeric, (t ->> 'cash_refunded')::numeric,
    (t ->> 'expected_cash')::numeric, p_counted_cash, diff, (t ->> 'card_total')::numeric,
    (t ->> 'transfer_total')::numeric, (t ->> 'non_cash_total')::numeric, (t ->> 'payments_count')::integer,
    (t ->> 'reversals_count')::integer, t -> 'breakdown', nullif(btrim(p_notes), ''), p_request_id)
  returning * into result;
  update public.cash_sessions
     set status = 'cerrada', window_end = w_end, closed_at = now(), closed_by = auth.uid(),
         closings_count = closings_count + 1, version = version + 1
   where id = s.id;
  perform private.log_event(s.organization_id, s.detail_center_id, 'cash_session.closed', 'cash_sessions', s.id::text,
    jsonb_build_object('folio', s.folio, 'sequence', result.sequence, 'expected_cash', result.expected_cash,
                       'counted_cash', result.counted_cash, 'difference', result.difference));
  return result;
end;
$$;

-- Reapertura (sólo admin) con motivo obligatorio: el corte queda "reabierto"
-- para corregir el conteo. La ventana no cambia (el esperado tampoco) y la
-- versión anterior del cierre se conserva.
create function public.reopen_cash_session(p_session_id uuid, p_version integer, p_reason text)
returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare
  s public.cash_sessions;
  last_closing uuid;
begin
  s := private.lock_cash_session(p_session_id, p_version);
  if not private.can_reopen_cash(s.detail_center_id) then
    raise exception 'Sólo el admin reabre un corte cerrado' using errcode = '42501';
  end if;
  if s.status <> 'cerrada' then
    raise exception 'Sólo se reabre un corte cerrado' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  select c.id into last_closing from public.cash_closings c where c.session_id = s.id order by c.sequence desc limit 1;
  insert into public.cash_reopenings (organization_id, detail_center_id, session_id, closing_id, reason)
  values (s.organization_id, s.detail_center_id, s.id, last_closing, btrim(p_reason));
  perform set_config('app.cash_reopen', 'on', true);
  update public.cash_sessions
     set status = 'reabierta', closed_at = null, closed_by = null, version = version + 1
   where id = s.id
  returning * into s;
  perform set_config('app.cash_reopen', 'off', true);
  perform private.log_event(s.organization_id, s.detail_center_id, 'cash_session.reopened', 'cash_sessions', s.id::text,
    jsonb_build_object('folio', s.folio, 'closing_id', last_closing));
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC de lectura
-- ---------------------------------------------------------------------------

-- Cortes por centros y días (del centro). Para una caja abierta devuelve el
-- esperado al momento; para las demás, el último cierre.
create function public.list_cash_sessions(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  id uuid,
  detail_center_id uuid,
  folio text,
  business_date date,
  shift text,
  status text,
  opening_float numeric,
  opened_at timestamptz,
  opened_by_name text,
  window_end timestamptz,
  closed_at timestamptz,
  closed_by_name text,
  expected_cash numeric,
  counted_cash numeric,
  difference numeric,
  card_total numeric,
  transfer_total numeric,
  closings_count integer,
  reopenings_count integer,
  version integer
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.detail_center_id, s.folio, s.business_date, s.shift, s.status, s.opening_float, s.opened_at,
         op.full_name, s.window_end, s.closed_at, cp.full_name,
         coalesce(c.expected_cash, (live.t ->> 'expected_cash')::numeric),
         c.counted_cash, c.difference,
         coalesce(c.card_total, (live.t ->> 'card_total')::numeric),
         coalesce(c.transfer_total, (live.t ->> 'transfer_total')::numeric),
         s.closings_count::integer,
         (select count(*) from public.cash_reopenings r where r.session_id = s.id)::integer,
         s.version
    from public.cash_sessions s
    left join public.profiles op on op.id = s.opened_by
    left join public.profiles cp on cp.id = s.closed_by
    left join lateral (select * from public.cash_closings x where x.session_id = s.id
                        order by x.sequence desc limit 1) c on true
    left join lateral (select private.cash_window_totals(s.detail_center_id, s.opened_at, null, s.opening_float) as t
                        where s.status = 'abierta') live on true
   where s.detail_center_id = any (p_detail_center_ids)
     and private.can_read_cash(s.detail_center_id)
     and s.business_date between p_from and p_to
   order by s.business_date desc, s.opened_at desc
   limit 200;
$$;

-- Ficha del corte: datos, totales (al momento si está abierta; si no, el
-- último cierre y su verificación recalculada desde los pagos), versiones del
-- cierre, reaperturas y recibos de la ventana.
create function public.cash_session_detail(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'organization_id', s.organization_id, 'detail_center_id', s.detail_center_id,
    'center_name', dc.name, 'center_timezone', dc.timezone, 'folio', s.folio,
    'business_date', s.business_date, 'shift', s.shift, 'status', s.status, 'opening_float', s.opening_float,
    'opened_at', s.opened_at, 'opened_by_name', op.full_name, 'window_end', s.window_end,
    'closed_at', s.closed_at, 'closed_by_name', cp.full_name, 'notes', s.notes, 'version', s.version,
    -- Totales recalculados desde los pagos sobre la ventana (hasta ahora si está abierta).
    'live', private.cash_window_totals(s.detail_center_id, s.opened_at, s.window_end, s.opening_float),
    'closings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'sequence', c.sequence, 'window_from', c.window_from, 'window_to', c.window_to,
        'opening_float', c.opening_float, 'cash_collected', c.cash_collected, 'cash_refunded', c.cash_refunded,
        'expected_cash', c.expected_cash, 'counted_cash', c.counted_cash, 'difference', c.difference,
        'card_total', c.card_total, 'transfer_total', c.transfer_total, 'non_cash_total', c.non_cash_total,
        'payments_count', c.payments_count, 'reversals_count', c.reversals_count, 'breakdown', c.breakdown,
        'notes', c.notes, 'closed_by_name', xp.full_name, 'closed_at', c.closed_at) order by c.sequence)
      from public.cash_closings c left join public.profiles xp on xp.id = c.closed_by
      where c.session_id = s.id), '[]'::jsonb),
    'reopenings', coalesce((select jsonb_agg(jsonb_build_object(
        'reason', r.reason, 'reopened_by_name', rp.full_name, 'reopened_at', r.reopened_at,
        'sequence', (select c.sequence from public.cash_closings c where c.id = r.closing_id)) order by r.reopened_at)
      from public.cash_reopenings r left join public.profiles rp on rp.id = r.reopened_by
      where r.session_id = s.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x order by x ->> 'at') from (
        select jsonb_build_object('kind', 'cobro', 'at', p.received_at, 'folio', p.receipt_folio, 'status', p.status,
          'amount', p.amount,
          'cash', coalesce((select sum(t.amount) from public.payment_tenders t join public.payment_methods m on m.code = t.method
                             where t.payment_id = p.id and m.kind = 'efectivo'), 0),
          'methods', (select string_agg(m.name, ' + ' order by m.position) from public.payment_tenders t
                        join public.payment_methods m on m.code = t.method where t.payment_id = p.id)) as x
          from public.payments p
         where p.detail_center_id = s.detail_center_id and p.received_at >= s.opened_at
           and p.received_at < coalesce(s.window_end, 'infinity')
        union all
        select jsonb_build_object('kind', 'reverso', 'at', r.reversed_at, 'folio', p.receipt_folio, 'status', p.status,
          'amount', r.amount,
          'cash', coalesce((select sum(t.amount) from public.payment_tenders t join public.payment_methods m on m.code = t.method
                             where t.payment_id = p.id and m.kind = 'efectivo'), 0),
          'methods', (select string_agg(m.name, ' + ' order by m.position) from public.payment_tenders t
                        join public.payment_methods m on m.code = t.method where t.payment_id = p.id))
          from public.payment_reversals r join public.payments p on p.id = r.payment_id
         where r.detail_center_id = s.detail_center_id and r.reversed_at >= s.opened_at
           and r.reversed_at < coalesce(s.window_end, 'infinity')
        limit 500) q), '[]'::jsonb))
    from public.cash_sessions s
    join public.detail_centers dc on dc.id = s.detail_center_id
    left join public.profiles op on op.id = s.opened_by
    left join public.profiles cp on cp.id = s.closed_by
   where s.id = p_session_id and private.can_read_cash(s.detail_center_id);
$$;

-- Efectivo cobrado fuera de cualquier corte (sin caja abierta), por centro y día
-- del centro: señal de fuga para el encargado y el admin.
create function public.cash_uncovered(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (detail_center_id uuid, day date, cash_amount numeric, payments_count integer)
language sql stable security definer set search_path = '' as $$
  select p.detail_center_id, (p.received_at at time zone c.timezone)::date, sum(t.amount), count(distinct p.id)::integer
    from public.payments p
    join public.detail_centers c on c.id = p.detail_center_id
    join public.payment_tenders t on t.payment_id = p.id
    join public.payment_methods m on m.code = t.method and m.kind = 'efectivo'
   where p.detail_center_id = any (p_detail_center_ids)
     and private.can_read_cash(p.detail_center_id)
     and (p.received_at at time zone c.timezone)::date between p_from and p_to
     and not exists (select 1 from public.cash_sessions s
                      where s.detail_center_id = p.detail_center_id and p.received_at >= s.opened_at
                        and p.received_at < coalesce(s.window_end, 'infinity'))
   group by p.detail_center_id, (p.received_at at time zone c.timezone)::date
   order by 2 desc, 1;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_read_cash(uuid)',
    'private.can_operate_cash(uuid)',
    'private.can_reopen_cash(uuid)',
    'private.forbid_cash_history_changes()',
    'private.guard_cash_session()',
    'private.guard_cash_window()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'private.lock_cash_center(uuid)',
    'private.cash_window_facts(uuid, timestamptz, timestamptz)',
    'private.cash_window_totals(uuid, timestamptz, timestamptz, numeric)',
    'private.next_cash_session_number(uuid)',
    'private.lock_cash_session(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.open_cash_session(uuid, uuid, text, numeric, text)',
    'public.close_cash_session(uuid, integer, uuid, numeric, text)',
    'public.reopen_cash_session(uuid, integer, text)',
    'public.list_cash_sessions(uuid[], date, date)',
    'public.cash_session_detail(uuid)',
    'public.cash_uncovered(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
