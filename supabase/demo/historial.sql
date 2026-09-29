-- Datos demo: 90 días de historial sobre supabase/seed.sql (correr DESPUÉS del seed).
-- 24 clientes con vehículo (12 por centro), ~950 OS entregadas y cobradas en ambos
-- centros (más volumen en fin de semana, alza en el último mes, algunas por cobrar),
-- egresos mensuales (renta, nómina, luz/agua, insumos, marketing) y citas próximas.
-- Así los tableros, KPIs, tendencias, P&L y alertas tienen datos que mostrar.
--
-- * Determinista (setseed) e idempotente: si ya corrió, no hace nada.
-- * CDMX llega hasta anteayer: ayer tiene corte de caja cerrado (seed) y no admite
--   cobros; así además se disparan las alertas diarias de ejemplo.
-- * Sin usuarios: se crean con Auth (ver docs/modules/datos-demo.md).
--
-- Uso local:   psql "$DATABASE_URL" -f supabase/seed.sql -f supabase/demo/historial.sql
-- Validado en: scripts/test-db.sh
do $$
declare
  org constant uuid := '00000000-0000-4000-8000-00000000d3e0';
  cdmx constant uuid := '11111111-1111-4111-8111-111111111111';
  mty constant uuid := '22222222-2222-4222-8222-222222222222';
  first_names text[] := array['Ana','Luis','Carlos','Fernanda','Diego','Sofía','Jorge','Valeria','Ricardo','Paola',
    'Andrés','Daniela','Miguel','Gabriela','Héctor','Lucía','Raúl','Mariana','Óscar','Regina','Emilio','Camila','Iván','Renata'];
  last_names text[] := array['García','Hernández','Martínez','González','Rodríguez','Sánchez','Ramírez','Flores',
    'Torres','Rivera','Gómez','Díaz','Morales','Vázquez','Castillo','Ortiz'];
  cars text[][] := array[['Toyota','Corolla'],['Nissan','Versa'],['Mazda','CX-5'],['Volkswagen','Jetta'],['Honda','CR-V'],
    ['Kia','Sportage'],['Chevrolet','Aveo'],['BMW','Serie 3'],['Audi','Q5'],['Hyundai','Tucson'],['Ford','Ranger'],['Tesla','Model 3']];
  c record;
  center uuid;
  d date;
  n int;
  i int;
  k int;
  r float;
  cl record;
  v_id uuid;
  folio_n int;
  v_cat text;
  tz text;
  ts timestamptz;
  svc uuid;
  price numeric;
  cost numeric;
  eng text;
  sname text;
  scode text;
  dur int;
  o public.service_orders;
  method text;
  exp_n int;
begin
  if exists (select 1 from public.clients where id = 'de000000-0000-4000-8000-000000000001') then
    raise notice 'Historial demo ya cargado';
    return;
  end if;
  perform setseed(0.42);

  -- Marcador + 24 clientes (12 por centro) con vehículo; la mitad con consentimiento comercial.
  for i in 1..24 loop
    center := case when i <= 12 then cdmx else mty end;
    insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, email,
                                marketing_opt_in, marketing_channels, marketing_opt_in_at, marketing_opt_in_source,
                                request_id, created_in_detail_center_id)
    values (('de000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, org, center, 'person',
            first_names[i] || ' ' || last_names[1 + (i * 7) % 16] || ' ' || last_names[1 + (i * 3) % 16],
            case when center = cdmx then '+5255' else '+5281' end || lpad((10000000 + i * 137911)::text, 8, '0'),
            lower(translate(first_names[i], 'áéíóúÓ', 'aeiouo')) || '.demo' || i || '@example.com',
            i % 2 = 0, case when i % 2 = 0 then '{whatsapp,email}'::text[] else '{}'::text[] end,
            case when i % 2 = 0 then now() - interval '100 days' end, case when i % 2 = 0 then 'web' end,
            ('de000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, center);
    insert into public.client_centers (client_id, detail_center_id, organization_id)
    values (('de000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, center, org);
    insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
    values (('de100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, org,
            ('de000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            cars[1 + i % 12][1], cars[1 + i % 12][2], 2016 + i % 9,
            case when center = cdmx then 'MX' else 'NL' end || lpad((4000 + i * 37)::text, 4, '0') || chr(65 + i % 26), center);
  end loop;

  -- OS entregadas y cobradas: 90 días hacia atrás (CDMX hasta anteayer: ayer tiene corte cerrado).
  select coalesce(max(folio_number), 0) into folio_n from public.service_orders where detail_center_id = cdmx;
  for c in select * from (values (cdmx, 'CDMX-01', 'America/Mexico_City', 2, 1.0), (mty, 'MTY-01', 'America/Monterrey', 1, 0.8))
             as t(id, code, tz, last_age, factor) loop
    select coalesce(max(folio_number), 0) into folio_n from public.service_orders where detail_center_id = c.id;
    for d in select generate_series(current_date - 90, current_date - c.last_age, interval '1 day')::date loop
      -- Más volumen en fin de semana, menos en lunes; tendencia al alza en el último mes.
      n := greatest(1, round((case extract(isodow from d) when 6 then 8 when 7 then 6 when 1 then 3 else 5 end)
                             * c.factor * (0.8 + random() * 0.5) * (case when d > current_date - 30 then 1.15 else 1 end)));
      for k in 1..n loop
        select cc.client_id, v.id as vehicle_id, cl2.full_name, cl2.phone, cl2.email, v.make, v.model, v.year, v.plate
          into cl
          from public.client_centers cc join public.clients cl2 on cl2.id = cc.client_id
          join public.vehicles v on v.client_id = cc.client_id
         where cc.detail_center_id = c.id and cl2.kind = 'person'
         order by random() limit 1;
        r := random();
        svc := case when r < 0.40 then '5e000000-0000-4000-8000-000000000001'::uuid
                    when r < 0.60 then '5e000000-0000-4000-8000-000000000002'::uuid
                    when r < 0.72 then '5e000000-0000-4000-8000-000000000009'::uuid
                    when r < 0.84 then '5e000000-0000-4000-8000-000000000003'::uuid
                    when r < 0.95 or c.id = mty then '5e000000-0000-4000-8000-000000000004'::uuid
                    else '5e000000-0000-4000-8000-000000000005'::uuid end;
        select coalesce(cfg.price_override, s.base_price), coalesce(cfg.direct_cost_override, s.standard_direct_cost),
               s.revenue_engine::text, s.name, s.code, s.standard_duration_minutes
          into price, cost, eng, sname, scode, dur
          from public.services s left join public.service_center_config cfg on cfg.service_id = s.id and cfg.detail_center_id = c.id
         where s.id = svc;
        folio_n := folio_n + 1;
        v_id := gen_random_uuid();
        ts := (d + make_time(9 + (k * 2 + floor(random() * 3)::int) % 10, (floor(random() * 4) * 15)::int, 0)) at time zone c.tz;
        insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id,
                                           channel, status, client_name, client_phone, client_email, vehicle_make,
                                           vehicle_model, vehicle_year, vehicle_plate, authorized_at, started_at,
                                           finished_at, delivered_at, request_id)
        values (v_id, org, c.id, c.code || '-' || lpad(folio_n::text, 6, '0'), folio_n, cl.client_id, cl.vehicle_id, 'b2c',
                'entregada', cl.full_name, cl.phone, cl.email, cl.make, cl.model, cl.year, cl.plate,
                ts - interval '10 minutes', ts, ts + make_interval(mins => dur), ts + make_interval(mins => dur + 15), v_id);
        insert into public.service_order_items (organization_id, service_order_id, position, kind, service_id, service_code,
                                                service_name, revenue_engine, unit_price, unit_direct_cost, duration_minutes,
                                                price_source, quantity)
        values (org, v_id, 0, 'servicio', svc, scode, sname, eng::public.revenue_engine, price, cost, dur,
                case when price = (select base_price from public.services where id = svc) then 'base' else 'center' end, 1);
        if random() < 0.3 then
          insert into public.service_order_items (organization_id, service_order_id, position, kind, service_id, service_code,
                                                  service_name, revenue_engine, unit_price, unit_direct_cost, duration_minutes,
                                                  price_source, quantity)
          values (org, v_id, 1, 'producto', '5e000000-0000-4000-8000-000000000006', 'AROM', 'Aromatizante',
                  'producto_complemento', 90, 30, 5, 'base', 1 + (random() < 0.3)::int);
        end if;
        perform private.recalc_service_order(v_id);
        update public.service_orders set authorized_total = total where id = v_id;
        -- 4 % de las OS de los últimos 10 días quedan por cobrar.
        if not (d > current_date - 10 and random() < 0.04) then
          select * into o from public.service_orders where id = v_id;
          r := random();
          method := case when r < 0.4 then 'efectivo' when r < 0.85 then 'tarjeta' else 'transferencia' end;
          perform private.create_order_payment(o, gen_random_uuid(),
            jsonb_build_array(jsonb_build_object('method', method, 'amount', o.total,
              'reference', case when method = 'transferencia' then 'SPEI ' || (100000 + folio_n)
                                when method = 'tarjeta' then 'AUT-' || (5000 + folio_n) end)),
            case when method = 'efectivo' then ceil(o.total / 100) * 100 end, 'Pago al entregar', false,
            ts + make_interval(mins => dur + 15));
        end if;
      end loop;
    end loop;
    insert into private.service_order_counters (detail_center_id, last_number) values (c.id, folio_n)
    on conflict (detail_center_id) do update set last_number = greatest(private.service_order_counters.last_number, folio_n);
  end loop;

  -- Egresos aprobados: renta mensual, nómina quincenal, luz/agua y marketing por centro (3 meses).
  perform set_config('app.change_reason', 'Egresos demo', true);
  for c in select * from (values (cdmx, 'CDMX-01', 18000, 22000), (mty, 'MTY-01', 14000, 18000)) as t(id, code, rent, payroll) loop
    select coalesce(max(number), 0) into exp_n from public.expenses where detail_center_id = c.id;
    for d in select generate_series(date_trunc('month', current_date - 90)::date, current_date - 1, interval '1 day')::date loop
      for v_cat, price in select x.cat, x.amt from (values
          ('renta', case when extract(day from d) = 3 then c.rent end),
          ('nomina', case when extract(day from d) in (15, 28) then c.payroll end),
          ('servicios', case when extract(day from d) = 10 then round(2500 + random() * 900) end),
          ('insumos', case when extract(day from d) in (5, 20) then round(3000 + random() * 1500) end),
          ('marketing', case when extract(day from d) = 12 then 4500 end)) as x(cat, amt)
        where x.amt is not null and not (x.cat = 'renta' and c.id = cdmx and d > current_date - 5) loop
        exp_n := exp_n + 1;
        insert into public.expenses (organization_id, detail_center_id, number, folio, category_id, pnl_group, concept,
                                     amount, payment_method, paid_on, status, requires_approval, approved_at, request_id)
        select org, c.id, exp_n, c.code || '-E-' || lpad(exp_n::text, 6, '0'), ec.id, ec.pnl_group,
               case v_cat when 'renta' then 'Renta del local' when 'nomina' then 'Nómina quincenal'
                         when 'servicios' then 'Luz y agua' when 'insumos' then 'Químicos y microfibras'
                         else 'Campaña en redes sociales' end,
               price, case when v_cat = 'insumos' then 'efectivo' else 'transferencia' end, d, 'aprobado',
               price >= 5000, (d + time '18:00') at time zone 'America/Mexico_City', gen_random_uuid()
          from public.expense_categories ec where ec.organization_id = org and ec.code = v_cat;
      end loop;
    end loop;
    insert into private.expense_counters (detail_center_id, last_number) values (c.id, exp_n)
    on conflict (detail_center_id) do update set last_number = greatest(private.expense_counters.last_number, exp_n);
  end loop;
  perform set_config('app.change_reason', '', true);

  -- Citas próximas (mañana y pasado) para la agenda.
  for i in 1..6 loop
    center := case when i <= 3 then cdmx else mty end;
    tz := case when center = cdmx then 'America/Mexico_City' else 'America/Monterrey' end;
    v_id := gen_random_uuid();
    insert into public.appointments (id, organization_id, detail_center_id, client_id, vehicle_id, starts_at,
                                     duration_minutes, ends_at, bay_id, status, request_id)
    values (v_id, org, center, ('de000000-0000-4000-8000-' || lpad((case when center = cdmx then i else i + 9 end)::text, 12, '0'))::uuid,
            ('de100000-0000-4000-8000-' || lpad((case when center = cdmx then i else i + 9 end)::text, 12, '0'))::uuid,
            ((current_date + 1 + (i % 2)) + make_time(9 + i, 0, 0)) at time zone tz, 90,
            ((current_date + 1 + (i % 2)) + make_time(10 + i, 30, 0)) at time zone tz,
            case when center = cdmx then 'ba000000-0000-4000-8000-000000000001'::uuid else 'ba000000-0000-4000-8000-000000000003'::uuid end,
            'programada', v_id);
    insert into public.appointment_services (appointment_id, service_id, organization_id, position, duration_minutes)
    values (v_id, '5e000000-0000-4000-8000-000000000002', org, 0, 90);
  end loop;
end
$$;
