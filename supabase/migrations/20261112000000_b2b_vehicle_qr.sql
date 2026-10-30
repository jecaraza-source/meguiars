-- QR por vehículo de flotilla B2B (ADR 0050).
--
-- Cada vehículo registrado en una cuenta B2B tiene un código aleatorio
-- (qr_token). La calcomanía o tarjeta del vehículo lleva un QR con el enlace
-- «<web>/q/b2b/<token>»: recepción lo escanea con la app (o con la cámara del
-- teléfono, que abre la web) y se abre la OS a cuenta con la cuenta y el
-- vehículo ya elegidos. El convenio vigente lo sigue decidiendo la base al crear
-- la OS (create_b2b_service_order). Si una calcomanía se pierde, el comercial
-- regenera el código y la anterior deja de funcionar.

alter table public.b2b_vehicles add column qr_token uuid not null default gen_random_uuid();
create unique index b2b_vehicles_qr_token_key on public.b2b_vehicles (qr_token);
comment on column public.b2b_vehicles.qr_token is
  'Código del QR del vehículo (enlace /q/b2b/<token>); se regenera con regenerate_b2b_vehicle_qr.';

-- Lo que identifica un QR escaneado en un centro. «usable» = la cuenta tiene un
-- convenio vigente habilitado en el centro y el vehículo está activo (si no, la
-- app avisa en lugar de abrir la OS). RLS: sólo se ven cuentas visibles.
create function public.b2b_vehicle_by_qr(p_detail_center_id uuid, p_token uuid)
returns table (
  account_id uuid,
  account_name text,
  vehicle_id uuid,
  vehicle_label text,
  plate text,
  usable boolean
)
language sql stable security invoker set search_path = '' as $$
  select bv.account_id, a.name, bv.vehicle_id,
         concat_ws(' ', v.make, v.model, v.year::text), v.plate,
         bv.active and a.status = 'activa'
           and exists (select 1 from public.b2b_accounts_for_center(p_detail_center_id) x
                        where x.account_id = bv.account_id)
    from public.b2b_vehicles bv
    join public.b2b_accounts a on a.id = bv.account_id
    join public.vehicles v on v.id = bv.vehicle_id
   where bv.qr_token = p_token;
$$;

-- Vehículos de una cuenta con su código, para imprimir las calcomanías (roles B2B).
create function public.b2b_vehicle_qr_codes(p_account_id uuid)
returns table (
  vehicle_id uuid,
  vehicle_label text,
  plate text,
  cost_center text,
  driver_name text,
  active boolean,
  qr_token uuid
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.b2b_account_visible(p_account_id, false) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  return query
    select bv.vehicle_id, concat_ws(' ', v.make, v.model, v.year::text), v.plate, bv.cost_center, bv.driver_name,
           bv.active, bv.qr_token
      from public.b2b_vehicles bv
      join public.vehicles v on v.id = bv.vehicle_id
     where bv.account_id = p_account_id
     order by bv.active desc, v.plate nulls last, v.make;
end;
$$;

-- Nuevo código para un vehículo (calcomanía perdida o robada): el anterior deja de funcionar.
create function public.regenerate_b2b_vehicle_qr(p_account_id uuid, p_vehicle_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  token uuid;
begin
  perform private.set_change_reason(p_reason);
  select * into acc from public.b2b_accounts where id = p_account_id;
  if not found or not private.can_manage_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  update public.b2b_vehicles set qr_token = gen_random_uuid()
   where account_id = p_account_id and vehicle_id = p_vehicle_id
   returning qr_token into token;
  if token is null then
    raise exception 'El vehículo no está en la flotilla de la cuenta' using errcode = 'P0002';
  end if;
  return token;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.b2b_vehicle_by_qr(uuid, uuid)',
    'public.b2b_vehicle_qr_codes(uuid)',
    'public.regenerate_b2b_vehicle_qr(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
