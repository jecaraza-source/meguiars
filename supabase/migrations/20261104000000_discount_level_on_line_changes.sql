-- El nivel de autorización de los descuentos se vuelve a revisar al cambiar las
-- líneas (auditoría de seguridad, ADR 0044).
--
-- add_service_order_discount y add_quote_discount exigen el nivel según el %
-- acumulado de descuento manual al aplicar el descuento. Un descuento por
-- importe conserva su valor, así que bajar la cantidad o quitar líneas después
-- subía el % sin volver a pedir autorización (p. ej. $500 sobre 10 lavados =
-- 10 %, nivel operador; con 1 lavado = 100 %, nivel admin).
--
-- Ahora set_service_order_item y set_quote_item comparan el % acumulado antes y
-- después del cambio: si sube, quien hace el cambio debe tener el nivel que
-- exige el % nuevo (mismo criterio que al aplicar el descuento). Subir
-- cantidades o agregar líneas baja el % y nunca se bloquea. Membresías y
-- promociones siguen fuera del cálculo (ya vienen autorizadas).

-- % de descuento manual acumulado de la OS (mismo cálculo que add_service_order_discount).
create function private.order_manual_discount_percent(p_order_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when o.subtotal > 0
           then (o.discount_total - coalesce((
                  select sum(d.amount) from public.service_order_discounts d
                   where d.service_order_id = o.id and d.source in ('membresia', 'promocion') and d.voided_at is null), 0))
                * 100 / o.subtotal
           else 0 end
    from public.service_orders o where o.id = p_order_id;
$$;

-- % de descuento manual acumulado de la cotización (mismo cálculo que add_quote_discount).
create function private.quote_manual_discount_percent(p_quote_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when q.subtotal > 0
           then (q.discount_total - coalesce((
                  select sum(d.amount) from public.quote_discounts d
                   where d.quote_id = q.id and d.source = 'promocion' and d.voided_at is null), 0))
                * 100 / q.subtotal
           else 0 end
    from public.quotes q where q.id = p_quote_id;
$$;

-- Si el cambio sube el % acumulado, quien lo hace necesita el nivel que exige el % nuevo.
create function private.assert_discount_level_kept(p_detail_center_id uuid, p_before numeric, p_after numeric)
returns void
language plpgsql stable set search_path = '' as $$
declare
  required public.discount_level;
  mine public.discount_level;
begin
  if round(coalesce(p_after, 0), 4) <= round(coalesce(p_before, 0), 4) then
    return;
  end if;
  required := private.discount_required_level(p_after);
  mine := private.discount_level_of(p_detail_center_id);
  if mine is null or mine < required then
    raise exception using errcode = '42501', message = format(
      'Con este cambio el descuento acumulado sube a %s %% y requiere autorización de nivel %s: '
      'ajusta o anula el descuento antes, o pide el cambio a quien tenga ese nivel',
      round(p_after, 1), required);
  end if;
end;
$$;

-- Agrega una línea o cambia su cantidad (0 = quitarla). Después de autorizada,
-- exige motivo (adicional autorizado por el cliente) y actualiza el total autorizado.
-- Si el cambio sube el % de descuento acumulado, revisa el nivel de autorización.
create or replace function public.set_service_order_item(
  p_order_id uuid,
  p_version integer,
  p_service_id uuid,
  p_quantity integer,
  p_reason text default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  pct_before numeric;
begin
  o := private.lock_service_order(p_order_id, p_version);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada') then
    raise exception 'Las líneas sólo cambian antes de terminar la OS' using errcode = '22023';
  end if;
  if o.status = 'abierta' then
    perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Líneas de la OS'));
  else
    perform private.set_change_reason(p_reason);
  end if;
  pct_before := private.order_manual_discount_percent(o.id);
  perform private.put_service_order_item(o, p_service_id, p_quantity);
  if o.status <> 'abierta' and not exists (select 1 from public.service_order_items where service_order_id = o.id) then
    raise exception 'Una OS autorizada conserva al menos una línea' using errcode = '22023';
  end if;
  perform private.recalc_service_order(o.id);
  perform private.assert_discount_level_kept(o.detail_center_id, pct_before, private.order_manual_discount_percent(o.id));
  select * into o from public.service_orders where id = o.id;
  if o.total < o.paid_amount then
    raise exception 'El cambio deja saldo a favor del cliente; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  if o.status <> 'abierta' then
    update public.service_orders set authorized_total = total where id = o.id returning * into o;
  end if;
  return o;
end;
$$;

create or replace function public.set_quote_item(p_quote_id uuid, p_version integer, p_service_id uuid, p_quantity integer)
returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  pct_before numeric;
begin
  q := private.lock_quote(p_quote_id, p_version);
  perform private.check_quote_editable(q);
  perform private.set_change_reason('Línea de cotización');
  pct_before := private.quote_manual_discount_percent(q.id);
  perform private.put_quote_item(q, p_service_id, p_quantity);
  if not exists (select 1 from public.quote_items where quote_id = q.id) then
    raise exception 'La cotización necesita al menos un servicio' using errcode = '22023';
  end if;
  perform private.recalc_quote(q.id);
  perform private.assert_discount_level_kept(q.detail_center_id, pct_before, private.quote_manual_discount_percent(q.id));
  update public.quotes set updated_at = now() where id = q.id returning * into q;
  return q;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.order_manual_discount_percent(uuid)',
    'private.quote_manual_discount_percent(uuid)',
    'private.assert_discount_level_kept(uuid, numeric, numeric)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
