-- Fechas de vigencia en la fecha local, no en UTC.
--
-- membership_plans.available_from y upsell_rules.starts_on tomaban
-- current_date (fecha UTC) cuando no se indicaba, pero la venta y las
-- recomendaciones comparan con la fecha local del centro
-- (private.center_today). Entre las 18:00 y las 24:00 de la Ciudad de México
-- (00:00–06:00 UTC) un plan o regla dado de alta "hoy" quedaba con fecha de
-- mañana y no se podía vender ni recomendar hasta el día siguiente.
--
-- Como planes y reglas son de la organización (sus centros pueden estar en
-- zonas horarias distintas), el "hoy" de la organización es la fecha local
-- más temprana entre sus centros: así queda vigente de inmediato en todos.

create function private.org_today(p_organization_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select coalesce(min((now() at time zone c.timezone)::date), current_date)
    from public.detail_centers c
   where c.organization_id = p_organization_id;
$$;
revoke all on function private.org_today(uuid) from public;
grant execute on function private.org_today(uuid) to authenticated;

-- Inserciones directas (sin RPC): la fecha omitida también es la local.
create function private.default_local_start() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) ->> tg_argv[0]) is null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], private.org_today(new.organization_id)));
  end if;
  return new;
end;
$$;
revoke all on function private.default_local_start() from public;

alter table public.membership_plans alter column available_from drop default;
create trigger membership_plans_default_available_from
  before insert on public.membership_plans
  for each row execute function private.default_local_start('available_from');

alter table public.upsell_rules alter column starts_on drop default;
create trigger upsell_rules_default_starts_on
  before insert on public.upsell_rules
  for each row execute function private.default_local_start('starts_on');

create or replace function public.upsert_membership_plan(
  p_organization_id uuid,
  p_id uuid,
  p_code text,
  p_tier text,
  p_name text,
  p_description text,
  p_price numeric,
  p_period_months smallint,
  p_redeem_scope text,
  p_restrictions text,
  p_renewal_notice_days smallint,
  p_available_from date,
  p_available_until date,
  p_active boolean,
  p_reason text
) returns public.membership_plans
language plpgsql security invoker set search_path = '' as $$
declare
  result public.membership_plans;
begin
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.membership_plans (organization_id, code, tier, name, description, price, period_months,
      redeem_scope, restrictions, renewal_notice_days, available_from, available_until, active)
    values (p_organization_id, upper(btrim(p_code)), p_tier, regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
      nullif(btrim(p_description), ''), p_price, p_period_months, p_redeem_scope, nullif(btrim(p_restrictions), ''),
      coalesce(p_renewal_notice_days, 7), coalesce(p_available_from, private.org_today(p_organization_id)), p_available_until,
      coalesce(p_active, true))
    returning * into result;
  else
    update public.membership_plans
       set tier = p_tier, name = regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
           description = nullif(btrim(p_description), ''), price = p_price, period_months = p_period_months,
           redeem_scope = p_redeem_scope, restrictions = nullif(btrim(p_restrictions), ''),
           renewal_notice_days = coalesce(p_renewal_notice_days, renewal_notice_days),
           available_from = coalesce(p_available_from, available_from), available_until = p_available_until,
           active = coalesce(p_active, active)
     where id = p_id and organization_id = p_organization_id
    returning * into result;
    if not found then
      raise exception 'Plan inexistente o sin permiso' using errcode = '42501';
    end if;
  end if;
  return result;
end;
$$;

create or replace function public.upsert_upsell_rule(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_source_service_id uuid,
  p_target_service_id uuid,
  p_target_plan_id uuid,
  p_stage text,
  p_priority smallint,
  p_pitch text,
  p_channels text[],
  p_center_ids uuid[],
  p_min_order_total numeric,
  p_starts_on date,
  p_ends_on date,
  p_active boolean,
  p_reason text
) returns public.upsell_rules
language plpgsql security definer set search_path = '' as $$
declare
  result public.upsell_rules;
begin
  perform private.set_change_reason(p_reason);
  if not private.can_manage_upsell(p_organization_id) then
    raise exception 'Sólo el admin corporativo configura las recomendaciones' using errcode = '42501';
  end if;
  if p_target_plan_id is not null
     and not exists (select 1 from public.membership_plans p
                      where p.id = p_target_plan_id and p.organization_id = p_organization_id) then
    raise exception 'Plan inexistente' using errcode = '22023';
  end if;
  if p_center_ids is not null and exists (
       select 1 from unnest(p_center_ids) c
        where not exists (select 1 from public.detail_centers d where d.id = c and d.organization_id = p_organization_id)) then
    raise exception 'Centro fuera de la organización' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.upsell_rules (organization_id, name, source_service_id, target_service_id, target_plan_id,
      stage, priority, pitch, channels, center_ids, min_order_total, starts_on, ends_on, active)
    values (p_organization_id, btrim(p_name), p_source_service_id, p_target_service_id, p_target_plan_id,
      p_stage, coalesce(p_priority, 50), btrim(p_pitch), coalesce(p_channels, '{b2c,membresia,b2b}'),
      nullif(p_center_ids, '{}'), p_min_order_total, coalesce(p_starts_on, private.org_today(p_organization_id)), p_ends_on,
      coalesce(p_active, true))
    returning * into result;
  else
    update public.upsell_rules
       set name = btrim(p_name), source_service_id = p_source_service_id, target_service_id = p_target_service_id,
           target_plan_id = p_target_plan_id, stage = p_stage, priority = coalesce(p_priority, 50),
           pitch = btrim(p_pitch), channels = coalesce(p_channels, '{b2c,membresia,b2b}'),
           center_ids = nullif(p_center_ids, '{}'), min_order_total = p_min_order_total,
           starts_on = coalesce(p_starts_on, starts_on), ends_on = p_ends_on, active = coalesce(p_active, true)
     where id = p_id and organization_id = p_organization_id
    returning * into result;
    if not found then
      raise exception 'Regla inexistente' using errcode = '22023';
    end if;
  end if;
  return result;
exception
  when check_violation then
    raise exception 'Regla inválida: un solo destino (servicio o plan), distinto del origen, y vigencia coherente'
      using errcode = '22023';
end;
$$;
