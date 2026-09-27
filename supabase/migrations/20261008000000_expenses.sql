-- AF2 — Administración y Finanzas / Egresos y costos.
--
-- Salidas de dinero por centro, clasificadas para el P&L, con comprobante en
-- Storage privado, aprobación opcional por umbral y edición/anulación auditada.
--
-- * expense_categories: catálogo editable por organización, cada una mapeada a
--   un grupo del P&L (costo_directo, insumos, personal, operativo,
--   administrativo, marketing, financiero, otros).
-- * vendors: proveedores básicos por organización.
-- * expense_settings: umbral de aprobación por centro (null = sin aprobación).
-- * expenses: el egreso (folio CDMX-01-E-000001). Congela el grupo del P&L de
--   su categoría: reclasificar una categoría no reescribe la historia.
-- * expense_attachments: comprobantes (foto o PDF) en el bucket privado
--   expense-receipts, ruta <org>/<centro>/<egreso>/<uuid>.<ext>.
-- * approval_events: historial inmutable de solicitud, aprobación, rechazo,
--   edición y anulación.
--
-- Costo económico vs salida de caja (sin doble conteo):
-- * El costo directo de un servicio ya está en la OS (costo estándar congelado
--   por línea, más la variación real de insumos registrada en la ejecución).
-- * Comprar insumos es una salida de caja pero NO un gasto del P&L (grupo
--   `insumos`): su costo se reconoce cuando la OS consume el insumo.
-- * El grupo `costo_directo` es sólo para costos directos que la OS no captura
--   (p. ej. servicios subcontratados).
-- pnl_facts devuelve ambos: las líneas del P&L y las salidas fuera del P&L.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- expenses.read: egresos, comprobantes y P&L del centro (el contador también).
create function private.can_read_expenses(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id,
    array['admin_socio', 'encargado', 'contador']::public.app_role[]);
$$;

-- expenses.write: capturar, editar y adjuntar.
create function private.can_write_expenses(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- expenses.approve: aprobar, rechazar, anular aprobados y fijar el umbral.
create function private.can_approve_expenses(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio']::public.app_role[]);
$$;

-- expenses.manage: catálogo de categorías (admin corporativo).
create function private.can_manage_expense_catalog(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- Ve catálogos de la organización quien lee egresos en alguno de sus centros.
create function private.can_read_expense_catalog(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.detail_centers c
                  where c.organization_id = p_organization_id and private.can_read_expenses(c.id));
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code text not null check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  pnl_group text not null check (pnl_group in (
    'costo_directo', 'insumos', 'personal', 'operativo', 'administrativo', 'marketing', 'financiero', 'otros'
  )),
  description text check (description is null or length(description) <= 300),
  position smallint not null default 50 check (position between 1 and 999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  rfc text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  phone text check (phone is null or phone ~ '^\+[0-9]{10,15}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes text check (notes is null or length(notes) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index vendors_org_name_key on public.vendors (organization_id, lower(btrim(name)));

create table public.expense_settings (
  detail_center_id uuid primary key references public.detail_centers (id) on delete cascade,
  organization_id uuid not null,
  -- Egresos con importe ≥ umbral requieren aprobación del admin (null = nunca).
  approval_threshold numeric(12, 2) check (approval_threshold is null or approval_threshold > 0),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete cascade
);

create table private.expense_counters (
  detail_center_id uuid primary key references public.detail_centers (id) on delete cascade,
  last_number integer not null
);
revoke all on private.expense_counters from public, anon, authenticated;
alter table private.expense_counters enable row level security;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  number integer not null check (number > 0),
  folio text not null,
  category_id uuid not null,
  -- Grupo del P&L congelado al capturar o editar.
  pnl_group text not null check (pnl_group in (
    'costo_directo', 'insumos', 'personal', 'operativo', 'administrativo', 'marketing', 'financiero', 'otros'
  )),
  vendor_id uuid,
  concept text not null check (length(btrim(concept)) between 3 and 200),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro')),
  -- Fecha del pago en el calendario del centro.
  paid_on date not null,
  reference text check (reference is null or length(btrim(reference)) between 1 and 80),
  notes text check (notes is null or length(notes) <= 1000),
  status text not null check (status in ('pendiente', 'aprobado', 'rechazado', 'anulado')),
  requires_approval boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 3 and 500),
  version integer not null default 1,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (detail_center_id, number),
  check ((status = 'anulado') = (voided_at is not null)),
  check ((voided_at is null) = (void_reason is null)),
  check (status <> 'aprobado' or approved_at is not null),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, category_id) references public.expense_categories (organization_id, id) on delete restrict,
  foreign key (organization_id, vendor_id) references public.vendors (organization_id, id) on delete restrict
);
create index expenses_center_paid_idx on public.expenses (detail_center_id, paid_on);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_vendor_idx on public.expenses (vendor_id) where vendor_id is not null;

create table public.expense_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  expense_id uuid not null,
  -- Ruta dentro del bucket: <org>/<centro>/<egreso>/<uuid>.<ext>
  storage_path text not null unique,
  file_name text check (file_name is null or length(file_name) between 1 and 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  remove_reason text,
  updated_at timestamptz not null default now(),
  check ((removed_at is null) = (remove_reason is null)),
  check (storage_path = organization_id || '/' || detail_center_id || '/' || expense_id || '/' || split_part(storage_path, '/', 4)),
  foreign key (organization_id, expense_id) references public.expenses (organization_id, id) on delete restrict
);
create index expense_attachments_expense_idx on public.expense_attachments (expense_id);

create table public.approval_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  detail_center_id uuid not null,
  expense_id uuid not null,
  kind text not null check (kind in ('solicitada', 'autoaprobada', 'aprobada', 'rechazada', 'editada', 'anulada')),
  amount numeric(12, 2) not null,
  note text check (note is null or length(note) <= 500),
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, expense_id) references public.expenses (organization_id, id) on delete restrict
);
create index approval_events_expense_idx on public.approval_events (expense_id, id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

create trigger expense_categories_updated_at before update on public.expense_categories
  for each row execute function private.set_updated_at();
create trigger vendors_updated_at before update on public.vendors
  for each row execute function private.set_updated_at();
create trigger expense_settings_updated_at before update on public.expense_settings
  for each row execute function private.set_updated_at();
create trigger expenses_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();
create trigger expense_attachments_updated_at before update on public.expense_attachments
  for each row execute function private.set_updated_at();

create trigger expense_categories_require_reason before insert or update or delete on public.expense_categories
  for each row execute function private.require_change_reason();
create trigger vendors_require_reason before insert or update or delete on public.vendors
  for each row execute function private.require_change_reason();
create trigger expense_settings_require_reason before insert or update or delete on public.expense_settings
  for each row execute function private.require_change_reason();
create trigger expenses_require_reason before insert or update or delete on public.expenses
  for each row execute function private.require_change_reason();
create trigger expense_attachments_require_reason before insert or update or delete on public.expense_attachments
  for each row execute function private.require_change_reason();

create trigger expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function private.audit_row();
create trigger vendors_audit after insert or update or delete on public.vendors
  for each row execute function private.audit_row();
create trigger expense_settings_audit after insert or update or delete on public.expense_settings
  for each row execute function private.audit_row();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function private.audit_row();
create trigger expense_attachments_audit after insert or update or delete on public.expense_attachments
  for each row execute function private.audit_row();

-- Nada se borra: el egreso se anula y el comprobante se retira (con motivo).
create function private.forbid_expense_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Los egresos y sus comprobantes no se borran: se anulan o se retiran con motivo'
    using errcode = '42501';
end;
$$;
create trigger expenses_no_delete before delete on public.expenses
  for each row execute function private.forbid_expense_delete();
create trigger expense_attachments_no_delete before delete on public.expense_attachments
  for each row execute function private.forbid_expense_delete();

create function private.forbid_approval_event_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial de aprobación es inmutable' using errcode = '42501';
end;
$$;
create trigger approval_events_immutable before update or delete on public.approval_events
  for each row execute function private.forbid_approval_event_changes();

-- Un egreso anulado ya no cambia.
create function private.guard_expense_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'anulado' then
    raise exception 'El egreso está anulado' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger expenses_guard before update on public.expenses
  for each row execute function private.guard_expense_update();

-- ---------------------------------------------------------------------------
-- 4. Categorías mínimas por organización
-- ---------------------------------------------------------------------------

create function private.seed_expense_categories(p_organization_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.change_reason', 'Categorías mínimas de egresos', true);
  insert into public.expense_categories (organization_id, code, name, pnl_group, description, position) values
    (p_organization_id, 'insumos', 'Compra de insumos', 'insumos',
     'Salida de caja; el costo se reconoce en la OS al consumirse (no va al P&L).', 10),
    (p_organization_id, 'subcontratos', 'Servicios subcontratados', 'costo_directo',
     'Costo directo que la OS no captura en su costo estándar.', 20),
    (p_organization_id, 'nomina', 'Nómina y comisiones', 'personal', null, 30),
    (p_organization_id, 'renta', 'Renta', 'operativo', null, 40),
    (p_organization_id, 'servicios', 'Luz, agua, gas e internet', 'operativo', null, 41),
    (p_organization_id, 'mantenimiento', 'Mantenimiento y equipo menor', 'operativo', null, 42),
    (p_organization_id, 'administracion', 'Papelería, software y honorarios', 'administrativo', null, 50),
    (p_organization_id, 'marketing', 'Publicidad y promoción', 'marketing', null, 60),
    (p_organization_id, 'comisiones_bancarias', 'Comisiones bancarias y de terminal', 'financiero', null, 70),
    (p_organization_id, 'otros', 'Otros egresos', 'otros', null, 90)
  on conflict (organization_id, code) do nothing;
end;
$$;

create function private.seed_org_expense_categories() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_expense_categories(new.id);
  return null;
end;
$$;
create trigger organizations_expense_categories after insert on public.organizations
  for each row execute function private.seed_org_expense_categories();

do $$
begin
  perform private.seed_expense_categories(o.id) from public.organizations o;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Funciones internas
-- ---------------------------------------------------------------------------

create function private.next_expense_number(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.expense_counters (detail_center_id, last_number) values (p_detail_center_id, 1)
  on conflict (detail_center_id) do update set last_number = private.expense_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

create function private.log_approval_event(e public.expenses, p_kind text, p_note text) returns void
language sql security definer set search_path = '' as $$
  insert into public.approval_events (organization_id, detail_center_id, expense_id, kind, amount, note)
  values (e.organization_id, e.detail_center_id, e.id, p_kind, e.amount, nullif(btrim(p_note), ''));
$$;

-- ¿Requiere aprobación el importe en el centro?
create function private.expense_requires_approval(p_detail_center_id uuid, p_amount numeric) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p_amount >= s.approval_threshold from public.expense_settings s
                    where s.detail_center_id = p_detail_center_id and s.approval_threshold is not null), false);
$$;

-- Valida categoría, proveedor, importe, forma de pago y fecha; devuelve la categoría.
create function private.check_expense_input(
  p_detail_center_id uuid,
  p_category_id uuid,
  p_vendor_id uuid,
  p_concept text,
  p_amount numeric,
  p_payment_method text,
  p_paid_on date
) returns public.expense_categories
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.expense_categories;
  org uuid;
begin
  select organization_id into org from public.detail_centers where id = p_detail_center_id;
  select * into c from public.expense_categories where id = p_category_id and organization_id = org;
  if not found or not c.active then
    raise exception 'Elige una categoría activa' using errcode = '22023';
  end if;
  if p_vendor_id is not null and not exists (
    select 1 from public.vendors v where v.id = p_vendor_id and v.organization_id = org and v.active) then
    raise exception 'Elige un proveedor activo' using errcode = '22023';
  end if;
  if p_concept is null or length(btrim(p_concept)) < 3 then
    raise exception 'Describe el concepto' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Importe inválido' using errcode = '22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro') then
    raise exception 'Forma de pago inválida' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > private.center_today(p_detail_center_id) then
    raise exception 'La fecha del pago no puede ser futura' using errcode = '22023';
  end if;
  return c;
end;
$$;

create function private.lock_expense(p_expense_id uuid, p_version integer) returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
begin
  select * into e from public.expenses where id = p_expense_id for update;
  if not found or not private.can_read_expenses(e.detail_center_id) then
    raise exception 'Egreso inexistente o sin permiso' using errcode = '42501';
  end if;
  if e.version <> p_version then
    raise exception 'El egreso cambió en otro dispositivo; recarga para ver la versión actual' using errcode = '40001';
  end if;
  if e.status = 'anulado' then
    raise exception 'El egreso está anulado' using errcode = '22023';
  end if;
  return e;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Storage (comprobantes)
-- ---------------------------------------------------------------------------

create function private.can_read_expense_receipt(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id::text = split_part(p_name, '/', 3)
      and e.detail_center_id::text = split_part(p_name, '/', 2)
      and e.organization_id::text = split_part(p_name, '/', 1)
      and private.can_read_expenses(e.detail_center_id)
  );
$$;

create function private.can_upload_expense_receipt(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
     and exists (
       select 1 from public.expenses e
       where e.id::text = split_part(p_name, '/', 3)
         and e.detail_center_id::text = split_part(p_name, '/', 2)
         and e.organization_id::text = split_part(p_name, '/', 1)
         and e.status <> 'anulado'
         and private.can_write_expenses(e.detail_center_id)
     );
$$;

create policy expense_receipts_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-receipts' and private.can_read_expense_receipt(name));
create policy expense_receipts_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-receipts' and private.can_upload_expense_receipt(name));

-- ---------------------------------------------------------------------------
-- 7. RLS (sólo lectura; escrituras por RPC)
-- ---------------------------------------------------------------------------

alter table public.expense_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.expense_settings enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_attachments enable row level security;
alter table public.approval_events enable row level security;

create policy expense_categories_select on public.expense_categories
  for select to authenticated using (private.can_read_expense_catalog(organization_id));
create policy vendors_select on public.vendors
  for select to authenticated using (private.can_read_expense_catalog(organization_id));
create policy expense_settings_select on public.expense_settings
  for select to authenticated using (private.can_read_expenses(detail_center_id));
create policy expenses_select on public.expenses
  for select to authenticated using (private.can_read_expenses(detail_center_id));
create policy expense_attachments_select on public.expense_attachments
  for select to authenticated using (private.can_read_expenses(detail_center_id));
create policy approval_events_select on public.approval_events
  for select to authenticated using (private.can_read_expenses(detail_center_id));

revoke all on public.expense_categories, public.vendors, public.expense_settings, public.expenses,
  public.expense_attachments, public.approval_events from anon;
revoke insert, update, delete, truncate on public.expense_categories, public.vendors, public.expense_settings,
  public.expenses, public.expense_attachments, public.approval_events from authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC de escritura
-- ---------------------------------------------------------------------------

-- Catálogo de categorías (admin corporativo). Reclasificar una categoría sólo
-- afecta egresos nuevos o editados: cada egreso congela su grupo del P&L.
create function public.upsert_expense_category(
  p_organization_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_pnl_group text,
  p_description text,
  p_position smallint,
  p_active boolean,
  p_reason text
) returns public.expense_categories
language plpgsql security definer set search_path = '' as $$
declare
  result public.expense_categories;
begin
  if not private.can_manage_expense_catalog(p_organization_id) then
    raise exception 'Sólo el admin corporativo configura las categorías' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  if p_category_id is null then
    insert into public.expense_categories (organization_id, code, name, pnl_group, description, position, active)
    values (p_organization_id, lower(btrim(p_code)), btrim(p_name), p_pnl_group, nullif(btrim(p_description), ''),
            coalesce(p_position, 50), coalesce(p_active, true))
    returning * into result;
  else
    update public.expense_categories
       set name = btrim(p_name), pnl_group = p_pnl_group, description = nullif(btrim(p_description), ''),
           position = coalesce(p_position, position), active = coalesce(p_active, active)
     where id = p_category_id and organization_id = p_organization_id
    returning * into result;
    if not found then
      raise exception 'Categoría inexistente' using errcode = '22023';
    end if;
  end if;
  return result;
end;
$$;

-- Proveedor básico. Lo da de alta o edita quien captura egresos en un centro de la organización.
create function public.upsert_vendor(
  p_detail_center_id uuid,
  p_vendor_id uuid,
  p_name text,
  p_rfc text default null,
  p_phone text default null,
  p_email text default null,
  p_notes text default null,
  p_active boolean default true,
  p_reason text default null
) returns public.vendors
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  result public.vendors;
begin
  if not private.can_write_expenses(p_detail_center_id) then
    raise exception 'Sin permiso para administrar proveedores' using errcode = '42501';
  end if;
  select organization_id into org from public.detail_centers where id = p_detail_center_id;
  perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''),
    case when p_vendor_id is null then 'Alta de proveedor' else 'Edición de proveedor' end));
  if exists (select 1 from public.vendors v where v.organization_id = org
               and lower(btrim(v.name)) = lower(btrim(p_name)) and v.id is distinct from p_vendor_id) then
    raise exception 'Ya existe un proveedor con ese nombre' using errcode = '23505';
  end if;
  if p_vendor_id is null then
    insert into public.vendors (organization_id, name, rfc, phone, email, notes, active)
    values (org, btrim(p_name), nullif(upper(btrim(p_rfc)), ''), nullif(btrim(p_phone), ''),
            nullif(lower(btrim(p_email)), ''), nullif(btrim(p_notes), ''), coalesce(p_active, true))
    returning * into result;
  else
    update public.vendors
       set name = btrim(p_name), rfc = nullif(upper(btrim(p_rfc)), ''), phone = nullif(btrim(p_phone), ''),
           email = nullif(lower(btrim(p_email)), ''), notes = nullif(btrim(p_notes), ''),
           active = coalesce(p_active, active)
     where id = p_vendor_id and organization_id = org
    returning * into result;
    if not found then
      raise exception 'Proveedor inexistente' using errcode = '22023';
    end if;
  end if;
  return result;
end;
$$;

-- Umbral de aprobación del centro (admin). null = los egresos no requieren aprobación.
create function public.set_expense_approval_threshold(p_detail_center_id uuid, p_threshold numeric, p_reason text)
returns public.expense_settings
language plpgsql security definer set search_path = '' as $$
declare
  result public.expense_settings;
begin
  if not private.can_approve_expenses(p_detail_center_id) then
    raise exception 'Sólo el admin fija el umbral de aprobación' using errcode = '42501';
  end if;
  if p_threshold is not null and (p_threshold <= 0 or p_threshold <> round(p_threshold, 2)) then
    raise exception 'Umbral inválido' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  insert into public.expense_settings (detail_center_id, organization_id, approval_threshold)
  select c.id, c.organization_id, p_threshold from public.detail_centers c where c.id = p_detail_center_id
  on conflict (detail_center_id) do update set approval_threshold = excluded.approval_threshold
  returning * into result;
  return result;
end;
$$;

-- Captura de un egreso. Si el importe alcanza el umbral del centro queda
-- pendiente de aprobación, salvo que lo capture un admin (autoaprobado y
-- registrado). Idempotente por p_request_id.
create function public.create_expense(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_category_id uuid,
  p_vendor_id uuid,
  p_concept text,
  p_amount numeric,
  p_payment_method text,
  p_paid_on date,
  p_reference text default null,
  p_notes text default null
) returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  c public.expense_categories;
  result public.expenses;
  org uuid;
  v_code text;
  n integer;
  requires boolean;
  approver boolean;
begin
  if not private.can_write_expenses(p_detail_center_id) then
    raise exception 'Sin permiso para capturar egresos en el centro' using errcode = '42501';
  end if;
  select dc.organization_id, dc.code into org, v_code from public.detail_centers dc where dc.id = p_detail_center_id;
  select * into result from public.expenses where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  c := private.check_expense_input(p_detail_center_id, p_category_id, p_vendor_id, p_concept, p_amount,
                                   p_payment_method, p_paid_on);
  requires := private.expense_requires_approval(p_detail_center_id, p_amount);
  approver := private.can_approve_expenses(p_detail_center_id);
  perform private.set_change_reason('Egreso: ' || btrim(p_concept));
  n := private.next_expense_number(p_detail_center_id);
  insert into public.expenses (organization_id, detail_center_id, number, folio, category_id, pnl_group, vendor_id,
    concept, amount, payment_method, paid_on, reference, notes, status, requires_approval, approved_by, approved_at,
    request_id)
  values (org, p_detail_center_id, n, v_code || '-E-' || lpad(n::text, 6, '0'), c.id, c.pnl_group, p_vendor_id,
    btrim(p_concept), p_amount, p_payment_method, p_paid_on, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''),
    case when requires and not approver then 'pendiente' else 'aprobado' end, requires,
    case when not requires or approver then auth.uid() end, case when not requires or approver then now() end,
    p_request_id)
  returning * into result;
  if requires then
    perform private.log_approval_event(result, 'solicitada', null);
    if approver then
      perform private.log_approval_event(result, 'autoaprobada', 'Capturado por el admin');
    end if;
  end if;
  return result;
end;
$$;

-- Edición con motivo. Si el nuevo importe requiere aprobación y quien edita no
-- es admin, el egreso vuelve a pendiente; un rechazado editado se vuelve a evaluar.
create function public.update_expense(
  p_expense_id uuid,
  p_version integer,
  p_category_id uuid,
  p_vendor_id uuid,
  p_concept text,
  p_amount numeric,
  p_payment_method text,
  p_paid_on date,
  p_reference text,
  p_notes text,
  p_reason text
) returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
  c public.expense_categories;
  requires boolean;
  approver boolean;
  next_status text;
begin
  e := private.lock_expense(p_expense_id, p_version);
  if not private.can_write_expenses(e.detail_center_id) then
    raise exception 'Sin permiso para editar egresos' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  c := private.check_expense_input(e.detail_center_id, p_category_id, p_vendor_id, p_concept, p_amount,
                                   p_payment_method, p_paid_on);
  requires := private.expense_requires_approval(e.detail_center_id, p_amount);
  approver := private.can_approve_expenses(e.detail_center_id);
  next_status := case when requires and not approver then 'pendiente' else 'aprobado' end;
  update public.expenses
     set category_id = c.id, pnl_group = c.pnl_group, vendor_id = p_vendor_id, concept = btrim(p_concept),
         amount = p_amount, payment_method = p_payment_method, paid_on = p_paid_on,
         reference = nullif(btrim(p_reference), ''), notes = nullif(btrim(p_notes), ''),
         requires_approval = requires, status = next_status,
         approved_by = case when next_status = 'aprobado' then auth.uid() end,
         approved_at = case when next_status = 'aprobado' then now() end,
         version = version + 1
   where id = e.id
  returning * into e;
  perform private.log_approval_event(e, 'editada', p_reason);
  if requires and next_status = 'pendiente' then
    perform private.log_approval_event(e, 'solicitada', null);
  elsif requires then
    perform private.log_approval_event(e, 'autoaprobada', 'Editado por el admin');
  end if;
  return e;
end;
$$;

create function public.approve_expense(p_expense_id uuid, p_version integer, p_note text default null)
returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
begin
  e := private.lock_expense(p_expense_id, p_version);
  if not private.can_approve_expenses(e.detail_center_id) then
    raise exception 'Sólo el admin aprueba egresos' using errcode = '42501';
  end if;
  if e.status <> 'pendiente' then
    raise exception 'Sólo se aprueba un egreso pendiente' using errcode = '22023';
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_note), ''), 'Aprobación del egreso ' || e.folio));
  update public.expenses
     set status = 'aprobado', approved_by = auth.uid(), approved_at = now(), version = version + 1
   where id = e.id
  returning * into e;
  perform private.log_approval_event(e, 'aprobada', p_note);
  return e;
end;
$$;

create function public.reject_expense(p_expense_id uuid, p_version integer, p_reason text)
returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
begin
  e := private.lock_expense(p_expense_id, p_version);
  if not private.can_approve_expenses(e.detail_center_id) then
    raise exception 'Sólo el admin rechaza egresos' using errcode = '42501';
  end if;
  if e.status <> 'pendiente' then
    raise exception 'Sólo se rechaza un egreso pendiente' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  update public.expenses set status = 'rechazado', version = version + 1 where id = e.id returning * into e;
  perform private.log_approval_event(e, 'rechazada', p_reason);
  return e;
end;
$$;

-- Anulación con motivo: el admin anula cualquiera; el encargado, sólo pendientes o rechazados.
create function public.void_expense(p_expense_id uuid, p_version integer, p_reason text)
returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
begin
  e := private.lock_expense(p_expense_id, p_version);
  if not (private.can_approve_expenses(e.detail_center_id)
          or (private.can_write_expenses(e.detail_center_id) and e.status in ('pendiente', 'rechazado'))) then
    raise exception 'Sólo el admin anula un egreso aprobado' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  update public.expenses
     set status = 'anulado', voided_by = auth.uid(), voided_at = now(), void_reason = btrim(p_reason),
         version = version + 1
   where id = e.id
  returning * into e;
  perform private.log_approval_event(e, 'anulada', p_reason);
  return e;
end;
$$;

-- Registra un comprobante ya subido al bucket (foto o PDF). Idempotente por ruta.
create function public.register_expense_attachment(
  p_expense_id uuid,
  p_storage_path text,
  p_content_type text,
  p_size_bytes integer,
  p_file_name text default null
) returns public.expense_attachments
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
  result public.expense_attachments;
begin
  select * into e from public.expenses where id = p_expense_id;
  if not found or not private.can_write_expenses(e.detail_center_id) then
    raise exception 'Egreso inexistente o sin permiso' using errcode = '42501';
  end if;
  select * into result from public.expense_attachments where storage_path = p_storage_path;
  if found then
    return result;
  end if;
  if e.status = 'anulado' then
    raise exception 'El egreso está anulado' using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> e.organization_id::text
     or split_part(p_storage_path, '/', 2) <> e.detail_center_id::text
     or split_part(p_storage_path, '/', 3) <> e.id::text then
    raise exception 'La ruta del comprobante no corresponde al egreso' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects s
                  where s.bucket_id = 'expense-receipts' and s.name = p_storage_path) then
    raise exception 'Sube el archivo antes de registrarlo' using errcode = '22023';
  end if;
  perform private.set_change_reason('Comprobante del egreso ' || e.folio);
  insert into public.expense_attachments (organization_id, detail_center_id, expense_id, storage_path, file_name,
    content_type, size_bytes)
  values (e.organization_id, e.detail_center_id, e.id, p_storage_path, nullif(btrim(p_file_name), ''),
    p_content_type, p_size_bytes)
  returning * into result;
  return result;
end;
$$;

-- Retira un comprobante con motivo (el archivo se conserva para auditoría).
create function public.remove_expense_attachment(p_attachment_id uuid, p_reason text)
returns public.expense_attachments
language plpgsql security definer set search_path = '' as $$
declare
  a public.expense_attachments;
begin
  select * into a from public.expense_attachments where id = p_attachment_id;
  if not found or not private.can_write_expenses(a.detail_center_id) then
    raise exception 'Comprobante inexistente o sin permiso' using errcode = '42501';
  end if;
  if a.removed_at is not null then
    return a;
  end if;
  perform private.set_change_reason(p_reason);
  update public.expense_attachments
     set removed_at = now(), removed_by = auth.uid(), remove_reason = btrim(p_reason)
   where id = a.id
  returning * into a;
  return a;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC de lectura
-- ---------------------------------------------------------------------------

-- Egresos con filtros por centros, fechas (del centro), categoría, proveedor, estado y grupo.
create function public.list_expenses(
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_category_id uuid default null,
  p_vendor_id uuid default null,
  p_status text default null,
  p_pnl_group text default null
) returns table (
  id uuid,
  detail_center_id uuid,
  folio text,
  paid_on date,
  concept text,
  amount numeric,
  status text,
  pnl_group text,
  category_id uuid,
  category_name text,
  vendor_id uuid,
  vendor_name text,
  payment_method text,
  attachments integer,
  version integer,
  created_by_name text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.detail_center_id, e.folio, e.paid_on, e.concept, e.amount, e.status, e.pnl_group, e.category_id,
         c.name, e.vendor_id, v.name, e.payment_method,
         (select count(*) from public.expense_attachments a where a.expense_id = e.id and a.removed_at is null)::integer,
         e.version, p.full_name, e.created_at
    from public.expenses e
    join public.expense_categories c on c.id = e.category_id
    left join public.vendors v on v.id = e.vendor_id
    left join public.profiles p on p.id = e.created_by
   where e.detail_center_id = any (p_detail_center_ids)
     and private.can_read_expenses(e.detail_center_id)
     and e.paid_on between p_from and p_to
     and (p_category_id is null or e.category_id = p_category_id)
     and (p_vendor_id is null or e.vendor_id = p_vendor_id)
     and (p_status is null or e.status = p_status)
     and (p_pnl_group is null or e.pnl_group = p_pnl_group)
   order by e.paid_on desc, e.number desc
   limit 500;
$$;

-- Ficha del egreso: datos, comprobantes vigentes e historial de aprobación.
create function public.expense_detail(p_expense_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'organization_id', e.organization_id, 'detail_center_id', e.detail_center_id, 'folio', e.folio,
    'category_id', e.category_id, 'category_name', c.name, 'pnl_group', e.pnl_group,
    'vendor_id', e.vendor_id, 'vendor_name', v.name, 'concept', e.concept, 'amount', e.amount,
    'payment_method', e.payment_method, 'paid_on', e.paid_on, 'reference', e.reference, 'notes', e.notes,
    'status', e.status, 'requires_approval', e.requires_approval, 'approved_at', e.approved_at,
    'approved_by_name', ap.full_name, 'void_reason', e.void_reason, 'voided_at', e.voided_at,
    'voided_by_name', vp.full_name, 'version', e.version, 'created_by', e.created_by,
    'created_by_name', cp.full_name, 'created_at', e.created_at, 'center_timezone', dc.timezone,
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'storage_path', a.storage_path,
        'file_name', a.file_name, 'content_type', a.content_type, 'size_bytes', a.size_bytes,
        'uploaded_by_name', up.full_name, 'created_at', a.created_at) order by a.created_at)
      from public.expense_attachments a left join public.profiles up on up.id = a.uploaded_by
      where a.expense_id = e.id and a.removed_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'amount', x.amount, 'note', x.note,
        'actor_name', xp.full_name, 'occurred_at', x.occurred_at) order by x.id)
      from public.approval_events x left join public.profiles xp on xp.id = x.actor_id
      where x.expense_id = e.id), '[]'::jsonb))
    from public.expenses e
    join public.detail_centers dc on dc.id = e.detail_center_id
    join public.expense_categories c on c.id = e.category_id
    left join public.vendors v on v.id = e.vendor_id
    left join public.profiles ap on ap.id = e.approved_by
    left join public.profiles vp on vp.id = e.voided_by
    left join public.profiles cp on cp.id = e.created_by
   where e.id = p_expense_id and private.can_read_expenses(e.detail_center_id);
$$;

-- Hechos del P&L por centro (sin datos personales). Secciones:
-- * ingreso: OS entregadas en el rango por canal (b2c, membresia, b2b) y venta de
--   membresías (altas y renovaciones cobradas), ítem `membresias`.
-- * costo_os: costo estándar congelado de esas OS (`estandar`) y variación real
--   de insumos registrada en su ejecución (`variacion_insumos`).
-- * egreso: egresos aprobados por grupo del P&L (incluye `insumos`, que el P&L
--   excluye porque su costo ya está en la OS; sí es salida de caja).
-- * egreso_pendiente: egresos pendientes de aprobación (no cuentan).
create function public.pnl_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (detail_center_id uuid, section text, item text, amount numeric, count integer)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_expenses(c.id)
  ), delivered as (
    select o.* from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
  )
  select d.detail_center_id, 'ingreso', d.channel::text, sum(d.total), count(*)::integer
    from delivered d group by d.detail_center_id, d.channel
  union all
  select m.detail_center_id, 'ingreso', 'membresias', sum(m.amount), count(*)::integer
    from public.membership_events m join centers c on c.id = m.detail_center_id
   where m.kind in ('alta', 'renovacion') and coalesce(m.amount, 0) > 0
     and (m.occurred_at at time zone c.timezone)::date between p_from and p_to
   group by m.detail_center_id
  union all
  select d.detail_center_id, 'costo_os', 'estandar', sum(d.cost_total), count(*)::integer
    from delivered d group by d.detail_center_id
  union all
  select d.detail_center_id, 'costo_os', 'variacion_insumos',
         round(sum((k.actual_quantity - k.standard_quantity) * k.unit_cost), 2), count(*)::integer
    from delivered d join public.service_order_consumptions k on k.service_order_id = d.id
   group by d.detail_center_id
  union all
  select e.detail_center_id, case e.status when 'aprobado' then 'egreso' else 'egreso_pendiente' end, e.pnl_group,
         sum(e.amount), count(*)::integer
    from public.expenses e join centers c on c.id = e.detail_center_id
   where e.status in ('aprobado', 'pendiente') and e.paid_on between p_from and p_to
   group by e.detail_center_id, e.status, e.pnl_group
   order by 1, 2, 3;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_read_expenses(uuid)',
    'private.can_write_expenses(uuid)',
    'private.can_approve_expenses(uuid)',
    'private.can_manage_expense_catalog(uuid)',
    'private.can_read_expense_catalog(uuid)',
    'private.can_read_expense_receipt(text)',
    'private.can_upload_expense_receipt(text)',
    'private.forbid_expense_delete()',
    'private.forbid_approval_event_changes()',
    'private.guard_expense_update()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'private.seed_expense_categories(uuid)',
    'private.seed_org_expense_categories()',
    'private.next_expense_number(uuid)',
    'private.log_approval_event(public.expenses, text, text)',
    'private.expense_requires_approval(uuid, numeric)',
    'private.check_expense_input(uuid, uuid, uuid, text, numeric, text, date)',
    'private.lock_expense(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_expense_category(uuid, uuid, text, text, text, text, smallint, boolean, text)',
    'public.upsert_vendor(uuid, uuid, text, text, text, text, text, boolean, text)',
    'public.set_expense_approval_threshold(uuid, numeric, text)',
    'public.create_expense(uuid, uuid, uuid, uuid, text, numeric, text, date, text, text)',
    'public.update_expense(uuid, integer, uuid, uuid, text, numeric, text, date, text, text, text)',
    'public.approve_expense(uuid, integer, text)',
    'public.reject_expense(uuid, integer, text)',
    'public.void_expense(uuid, integer, text)',
    'public.register_expense_attachment(uuid, text, text, integer, text)',
    'public.remove_expense_attachment(uuid, text)',
    'public.list_expenses(uuid[], date, date, uuid, uuid, text, text)',
    'public.expense_detail(uuid)',
    'public.pnl_facts(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
