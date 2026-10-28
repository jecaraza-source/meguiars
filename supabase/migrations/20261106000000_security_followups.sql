-- Ajustes de seguridad pendientes de la auditoría (ADR 0046).
--
-- 1. Bitácora: el contador sólo ve la de cobranza, caja, egresos y cuentas por
--    cobrar B2B. Antes veía todas las filas (con nombres y teléfonos de clientes
--    en old_data/new_data), contra ADR 0018.
-- 2. bot_settings.test_numbers: sólo por get_assistant_settings (que los muestra
--    a quien administra el asistente). Antes cualquier usuario de la bandeja los
--    leía directo de la tabla.
-- 3. Concurrencia: el límite de usos de una promoción y las unidades incluidas de
--    un convenio B2B se cuentan con un candado, para que dos OS simultáneas no
--    los rebasen.
-- 4. Un egreso rechazado sólo lo edita quien aprueba egresos (un encargado no
--    puede saltarse el rechazo del admin editándolo).

-- 1. Bitácora del contador -------------------------------------------------------
drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using (
    (organization_id is not null and private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
    or (detail_center_id is not null
      and private.has_center_role(detail_center_id, array['admin_socio']::public.app_role[]))
    or (table_name in ('public.payments', 'public.payment_reversals', 'public.cash_sessions',
                       'public.cash_closings', 'public.cash_reopenings', 'public.expenses',
                       'public.expense_attachments', 'public.expense_categories', 'public.expense_settings',
                       'public.vendors', 'public.b2b_invoices', 'public.b2b_payments')
        and ((organization_id is not null
              and private.has_org_role(organization_id, array['contador']::public.app_role[]))
          or (detail_center_id is not null
              and private.has_center_role(detail_center_id, array['contador']::public.app_role[]))))
  );

-- 2. Números de prueba del asistente ---------------------------------------------
revoke select on public.bot_settings from authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bot_settings' and column_name <> 'test_numbers';
  execute format('grant select (%s) on public.bot_settings to authenticated', cols);
end $$;

-- 3. Concurrencia de promociones y convenios B2B ----------------------------------
create or replace function private.find_promotion(p_organization_id uuid, p_detail_center_id uuid, p_code text) returns public.promotions
language plpgsql security definer set search_path = '' as $$
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
  -- Un uso a la vez por promoción: dos OS al mismo tiempo no pasan del máximo.
  perform pg_advisory_xact_lock(hashtextextended('promotion:' || p.id::text, 0));
  if p.max_uses is not null and private.promotion_uses(p.id) >= p.max_uses then
    raise exception 'La promoción % ya alcanzó sus % usos', p.code, p.max_uses using errcode = 'MG002';
  end if;
  return p;
end;
$$;

create or replace function private.b2b_line_price(
  p_order_id uuid,
  p_service_id uuid,
  p_list_price numeric,
  p_quantity integer
) returns table (price numeric, rule_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders;
  a public.b2b_agreements;
  today date;
  tz text;
  month_start date;
  volume integer;
  used integer;
  r public.b2b_price_rules;
begin
  select * into o from public.service_orders where id = p_order_id;
  if o.b2b_agreement_id is null then
    return query select p_list_price, null::uuid;
    return;
  end if;
  select * into a from public.b2b_agreements where id = o.b2b_agreement_id;
  today := private.center_today(o.detail_center_id);
  if private.b2b_current_agreement(a.account_id, o.detail_center_id) is distinct from a.id then
    -- Convenio vencido, suspendido o deshabilitado en el centro: no se aplica.
    return query select p_list_price, null::uuid;
    return;
  end if;
  -- Unidades incluidas y volumen se cuentan con el convenio bloqueado: dos OS
  -- guardadas al mismo tiempo no pasan de las unidades incluidas.
  perform pg_advisory_xact_lock(hashtextextended('b2b_agreement:' || a.id::text, 0));
  select c.timezone into tz from public.detail_centers c where c.id = o.detail_center_id;
  month_start := date_trunc('month', today)::date;
  select count(*) into volume from public.service_orders x
   where x.b2b_agreement_id = a.id and x.status <> 'cancelada'
     and (x.created_at at time zone tz)::date >= month_start;
  select coalesce(sum(i.quantity), 0) into used
    from public.service_order_items i
    join public.service_orders x on x.id = i.service_order_id
    join public.b2b_price_rules pr on pr.id = i.b2b_price_rule_id and pr.kind = 'incluido'
   where x.b2b_agreement_id = a.id and x.status <> 'cancelada'
     and not (i.service_order_id = p_order_id and i.service_id = p_service_id)
     and (a.billing_model = 'paquete' or (x.created_at at time zone tz)::date >= month_start);
  for r in
    select * from public.b2b_price_rules pr
     where pr.agreement_id = a.id and pr.active
       and (pr.service_id = p_service_id or pr.service_id is null)
       and pr.min_monthly_orders <= volume
     order by (pr.service_id is null), (pr.kind = 'incluido') desc, pr.min_monthly_orders desc, pr.created_at
  loop
    if r.kind = 'incluido' then
      if used + p_quantity <= coalesce(a.included_units, 0) then
        return query select 0::numeric, r.id;
        return;
      end if;
    elsif r.kind = 'precio_fijo' then
      return query select r.value, r.id;
      return;
    else
      return query select round(p_list_price * (1 - r.value / 100), 2), r.id;
      return;
    end if;
  end loop;
  return query select p_list_price, null::uuid;
end;
$$;

-- 4. Egresos rechazados ---------------------------------------------------------
create or replace function public.update_expense(
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
  -- Un egreso rechazado sólo lo edita quien aprueba: editarlo no puede saltarse el rechazo.
  if e.status = 'rechazado' and not private.can_approve_expenses(e.detail_center_id) then
    raise exception 'Un egreso rechazado sólo lo edita quien aprueba egresos' using errcode = '42501';
  end if;
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
