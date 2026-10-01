-- Datos demo de Marketing sobre supabase/seed.sql + supabase/demo/historial.sql
-- (correr DESPUÉS de ambos). Da contenido a Marketing y al panel comercial:
--
-- * 6 campañas (CDMX y Monterrey): activas, terminada, pausada y planeada, con
--   UTM, presupuesto e inversión semanal registrada a mano (no ligada a egresos).
-- * Calendario de contenido: piezas publicadas, programadas, borradores e ideas,
--   por campaña y orgánicas, con enlace UTM.
-- * 5 promociones preautorizadas (vigentes, vencida y futura). Sin usos: aplicar
--   una promoción cambia el total de una cotización u OS.
-- * ~75 prospectos atribuidos a campañas (y orgánicos) con su historial: contacto,
--   cotización, reserva, ganados ligados a OS entregadas del historial (ventas
--   atribuidas reales) y perdidos con motivo.
-- * 7 automatizaciones (5 activas con su primera corrida, 2 promocionales en pausa).
--
-- Integraciones NO se siembran: una cuenta sólo queda conectada cuando el
-- servidor la verifica con Meta usando credenciales reales.
--
-- * Determinista (setseed) e idempotente: si ya corrió, no hace nada.
-- * Fechas relativas al día en que corre.
--
-- Uso local:   psql "$DATABASE_URL" -f supabase/demo/marketing.sql
-- Validado en: scripts/test-db.sh
do $$
declare
  org constant uuid := '00000000-0000-4000-8000-00000000d3e0';
  cdmx constant uuid := '11111111-1111-4111-8111-111111111111';
  mty constant uuid := '22222222-2222-4222-8222-222222222222';
  landing constant text := 'https://meguiars-web.vercel.app';
  first_names text[] := array['Alejandra','Bruno','Cecilia','David','Elena','Francisco','Gloria','Hugo','Irene','Javier',
    'Karla','Leonardo','Mónica','Nicolás','Olivia','Pablo','Rocío','Santiago','Tania','Ulises','Verónica','Ximena',
    'Yolanda','Zacarías','Adriana','Bernardo','Claudia','Eduardo','Florencia','Gerardo'];
  last_names text[] := array['Aguilar','Benítez','Cruz','Domínguez','Escobar','Fuentes','Guerrero','Herrera','Ibarra',
    'Juárez','León','Medina','Navarro','Ochoa','Peña','Quiroz','Reyes','Salinas','Tapia','Valdez'];
  cars text[] := array['Toyota RAV4 2022','Nissan Kicks 2021','Mazda 3 2020','Volkswagen Tiguan 2023','Honda Civic 2019',
    'Kia Seltos 2022','Chevrolet Tracker 2021','BMW X3 2020','Audi A4 2019','Hyundai Creta 2023','Ford Lobo 2021',
    'Jeep Compass 2022','Mercedes-Benz GLA 2021','Tesla Model Y 2023'];
  loss_reasons text[] := array['precio', 'sin_respuesta', 'competencia', 'sin_disponibilidad', 'no_califica'];
  c record;
  ctr uuid;
  owner_cdmx uuid;
  owner_mty uuid;
  tz text;
  d date;
  k int;
  i int;
  seq int := 0;
  r float;
  ch text;
  fmt text;
  lead_id uuid;
  lead_src text;
  lead_name text;
  lead_phone text;
  created timestamptz;
  t_contact timestamptz;
  t_quote timestamptz;
  t_book timestamptz;
  t_close timestamptz;
  is_contacted boolean;
  is_quoted boolean;
  is_pending boolean;
  is_booked boolean;
  is_lost boolean;
  stage text;
  svc_price numeric;
  o_id uuid;
  o_client uuid;
  o_total numeric;
  o_at timestamptz;
  o_name text;
  o_phone text;
  consent text[];
  ev_channel text;
  titles text[];
begin
  if exists (select 1 from public.campaigns where id = 'ca0de000-0000-4000-8000-000000000001') then
    raise notice 'Marketing demo ya cargado';
    return;
  end if;
  if not exists (select 1 from public.detail_centers where id = cdmx and organization_id = org)
     or not exists (select 1 from public.lead_stages where organization_id = org and code = 'ganado') then
    raise exception 'Primero corre supabase/seed.sql (organización demo con centros y embudo)';
  end if;
  perform setseed(0.27);
  perform set_config('app.change_reason', 'Datos demo de marketing', true);

  -- Responsables (si existen los usuarios de prueba de producción).
  select id into owner_cdmx from auth.users where email = 'comercial@example.com';
  select id into owner_mty from auth.users where email = 'encargado.mty@example.com';

  create temp table _stage on commit drop as
    select code, id from public.lead_stages where organization_id = org;

  -- 1. Campañas.
  create temp table _camp (n int, id uuid, center uuid, name text, objective text, channels text[], starts_on date,
    ends_on date, budget numeric, status text, utm_source text, utm_medium text, utm_campaign text, n_leads int,
    spend_until date, service uuid, notes text) on commit drop;
  insert into _camp values
    (1, 'ca0de000-0000-4000-8000-000000000001', cdmx, 'Pulido de temporada', 'prospectos', array['instagram', 'facebook'],
     current_date - 45, current_date + 15, 15000, 'activa', 'instagram', 'paid_social', 'pulido_temporada_cdmx', 22,
     current_date, '5e000000-0000-4000-8000-000000000004', 'Anuncios de antes y después; objetivo: cotizaciones de pulido.'),
    (2, 'ca0de000-0000-4000-8000-000000000002', cdmx, 'Recubrimiento cerámico premium', 'ventas', array['instagram', 'google'],
     current_date - 30, current_date + 30, 20000, 'activa', 'google', 'cpc', 'ceramico_premium_cdmx', 12,
     current_date, '5e000000-0000-4000-8000-000000000005', 'Búsqueda en Google + reels de acabado espejo.'),
    (3, 'ca0de000-0000-4000-8000-000000000003', mty, 'Lavado exprés Monterrey', 'prospectos', array['facebook', 'whatsapp'],
     current_date - 40, current_date + 20, 8000, 'activa', 'facebook', 'paid_social', 'lavado_expres_mty', 18,
     current_date, '5e000000-0000-4000-8000-000000000001', 'Clic a WhatsApp desde Facebook.'),
    (4, 'ca0de000-0000-4000-8000-000000000004', mty, 'Reactivación clientes 90 días', 'reactivacion', array['whatsapp', 'email'],
     current_date - 60, current_date - 15, 3000, 'terminada', 'whatsapp', 'mensaje', 'reactivacion_90_mty', 8,
     current_date - 15, '5e000000-0000-4000-8000-000000000009', 'Clientes con consentimiento y sin visita en 90 días.'),
    (5, 'ca0de000-0000-4000-8000-000000000005', cdmx, 'Buen Fin 2026', 'ventas', array['instagram', 'facebook', 'tiktok'],
     current_date + 42, current_date + 46, 25000, 'planeada', 'instagram', 'paid_social', 'buen_fin_2026', 0,
     null, '5e000000-0000-4000-8000-000000000004', 'Pendiente aprobar presupuesto y piezas.'),
    (6, 'ca0de000-0000-4000-8000-000000000006', mty, 'Marca Meguiar''s en redes', 'marca', array['instagram', 'tiktok'],
     current_date - 20, current_date + 40, 6000, 'pausada', 'tiktok', 'organic_social', 'marca_redes_mty', 5,
     current_date - 6, '5e000000-0000-4000-8000-000000000002', 'En pausa mientras se graban nuevos videos.');

  insert into public.campaigns (id, organization_id, detail_center_id, name, objective, channels, starts_on, ends_on, budget,
                                status, utm_source, utm_medium, utm_campaign, landing_url, notes, created_at)
  select id, org, center, name, objective, channels, starts_on, ends_on, budget, status, utm_source, utm_medium,
         utm_campaign, landing, notes, least(now(), starts_on - 5 + time '10:00')
    from _camp order by n;

  -- 2. Inversión semanal (registro manual) por canal, repartida según el presupuesto.
  for c in select * from _camp where spend_until is not null order by n loop
    k := ceil((c.ends_on - c.starts_on + 1) / 7.0)::int * cardinality(c.channels);
    d := c.starts_on;
    while d <= least(c.ends_on, c.spend_until) loop
      foreach ch in array c.channels loop
        insert into public.campaign_spend (organization_id, campaign_id, spent_on, amount, channel, note, created_at)
        values (org, c.id, d, greatest(100, round(c.budget / k * (0.75 + random() * 0.35) / 50) * 50), ch,
                'Pauta semanal en ' || initcap(ch) || ' (demo)', d + time '12:00');
      end loop;
      d := d + 7;
    end loop;
  end loop;

  -- 3. Calendario: piezas por campaña cada 3 días y orgánicas semanales por centro.
  for c in select * from _camp order by n loop
    select timezone into tz from public.detail_centers where id = c.center;
    titles := case c.n
      when 1 then array['Antes y después: pulido en una etapa', '¿Rayones finos? Así los quitamos', 'Proceso de pulido en 30 segundos',
                        'Testimonio: pulido de una SUV', '3 señales de que tu pintura necesita pulido']
      when 2 then array['Acabado espejo con cerámico', 'Cerámico vs. cera: diferencias', 'Prueba de agua sobre cerámico',
                        'Cuidados después del cerámico']
      when 3 then array['Lavado exprés en 25 minutos', 'Escríbenos por WhatsApp y agenda', 'Tu auto listo antes de la oficina',
                        'Promo EXPRES15 esta semana']
      when 4 then array['Te extrañamos: vuelve con 20 %', 'Recordatorio: tu lavado del trimestre']
      when 5 then array['Buen Fin: adelanto de promociones', 'Cuenta regresiva Buen Fin', 'Buen Fin: último día']
      else array['Detrás de cámaras del taller', 'Conoce al equipo de Monterrey', 'Producto Meguiar''s del mes']
    end;
    d := greatest(c.starts_on - 3, current_date - 50);
    k := 0;
    while d <= c.ends_on loop
      ch := c.channels[(k % cardinality(c.channels)) + 1];
      fmt := case ch when 'instagram' then (array['reel', 'carrusel', 'historia'])[(k % 3) + 1]
                     when 'facebook' then (array['publicacion', 'video'])[(k % 2) + 1]
                     when 'tiktok' then 'video' when 'whatsapp' then 'estado' when 'email' then 'correo' else 'publicacion' end;
      insert into public.content_posts (organization_id, detail_center_id, campaign_id, channel, format, title, copy,
                                        planned_at, status, owner_id, link_url, published_at, created_at)
      select org, c.center, c.id, ch, fmt, titles[(k % cardinality(titles)) + 1],
             'Agenda por WhatsApp o en el enlace. ' || coalesce(c.notes, ''),
             x.planned, x.status, case when c.center = cdmx then owner_cdmx else owner_mty end,
             landing || '?utm_source=' || c.utm_source || '&utm_medium=' || c.utm_medium || '&utm_campaign=' ||
               c.utm_campaign || '&utm_content=' || fmt,
             case when x.status = 'publicada' then x.planned end,
             least(now(), x.planned - interval '3 days')
        from (select (d + time '18:00') at time zone tz as planned) p
        cross join lateral (select p.planned,
          case when c.status = 'pausada' and p.planned > now() then 'borrador'
               when p.planned < now() - interval '1 hour' then case when random() < 0.08 then 'cancelada' else 'publicada' end
               when p.planned < now() + interval '7 days' then 'programada'
               when c.status = 'planeada' then 'idea'
               else 'borrador' end as status) x;
      k := k + 1;
      d := d + 3;
    end loop;
  end loop;
  foreach ctr in array array[cdmx, mty] loop
    select timezone into tz from public.detail_centers where id = ctr;
    d := current_date - 28;
    k := 0;
    while d <= current_date + 14 loop
      insert into public.content_posts (organization_id, detail_center_id, campaign_id, channel, format, title, copy,
                                        planned_at, status, published_at, created_at)
      select org, ctr, null, 'instagram', 'historia',
             (array['Tip: seca tu auto con microfibra', 'Tip: no laves bajo el sol', 'Tip: protege los plásticos del sol',
                    'Tip: aspira antes de lavar interiores'])[(k % 4) + 1],
             'Contenido orgánico de cuidado del auto.', p.planned,
             case when p.planned < now() then 'publicada' when p.planned < now() + interval '7 days' then 'programada'
                  else 'idea' end,
             case when p.planned < now() then p.planned end, least(now(), p.planned - interval '2 days')
        from (select (d + time '11:00') at time zone tz as planned) p;
      k := k + 1;
      d := d + 7;
    end loop;
  end loop;

  -- 4. Promociones preautorizadas (sin usos).
  insert into public.promotions (organization_id, campaign_id, code, name, kind, value, service_ids, detail_center_ids,
                                 starts_on, ends_on, max_uses, active, terms)
  values
    (org, 'ca0de000-0000-4000-8000-000000000001', 'PULIDO10', 'Pulido de temporada 10 %', 'percent', 10,
     array['5e000000-0000-4000-8000-000000000004']::uuid[], array[cdmx], current_date - 45, current_date + 15, 50, true,
     'Demo. Una por OS; no acumulable.'),
    (org, 'ca0de000-0000-4000-8000-000000000002', 'CERAMICO1500', 'Cerámico premium $1,500 menos', 'amount', 1500,
     array['5e000000-0000-4000-8000-000000000005']::uuid[], array[cdmx], current_date - 30, current_date + 30, 20, true,
     'Demo. Sólo recubrimiento cerámico.'),
    (org, 'ca0de000-0000-4000-8000-000000000003', 'EXPRES15', 'Lavado exprés 15 %', 'percent', 15,
     array['5e000000-0000-4000-8000-000000000001']::uuid[], array[mty], current_date - 40, current_date + 20, 100, true,
     'Demo. Lunes a jueves.'),
    (org, 'ca0de000-0000-4000-8000-000000000004', 'VUELVE20', 'Regreso 20 %', 'percent', 20, '{}'::uuid[], array[mty],
     current_date - 60, current_date - 15, 40, true, 'Demo. Vencida.'),
    (org, 'ca0de000-0000-4000-8000-000000000005', 'BUENFIN25', 'Buen Fin 25 % en pulido', 'percent', 25,
     array['5e000000-0000-4000-8000-000000000004']::uuid[], '{}'::uuid[], current_date + 42, current_date + 46, 100, true,
     'Demo. Programada para el Buen Fin.');

  -- 5. Prospectos con historial. Grupos 90 y 91 = orgánicos (sin campaña).
  insert into _camp (n, id, center, channels, starts_on, ends_on, n_leads, service)
  values (90, null, cdmx, array['google', 'recomendacion', 'sitio_web', 'whatsapp'], current_date - 45, current_date, 8,
          '5e000000-0000-4000-8000-000000000009'),
         (91, null, mty, array['google', 'recomendacion', 'whatsapp'], current_date - 45, current_date, 6,
          '5e000000-0000-4000-8000-000000000002');
  for c in select * from _camp where n_leads > 0 order by n loop
    select timezone into tz from public.detail_centers where id = c.center;
    select base_price into svc_price from public.services where id = c.service;
    for i in 1..c.n_leads loop
      seq := seq + 1;
      lead_id := ('1ead0de0-0000-4000-8000-' || lpad(seq::text, 12, '0'))::uuid;
      ch := c.channels[1 + floor(random() * cardinality(c.channels))::int];
      lead_src := case ch when 'tiktok' then 'otro' when 'email' then 'otro' else ch end;
      lead_name := first_names[1 + floor(random() * cardinality(first_names))::int] || ' ' ||
                   last_names[1 + floor(random() * cardinality(last_names))::int];
      lead_phone := '+52' || case when c.center = cdmx then '55' else '81' end ||
                    lpad(((seq * 7919 + 3141592) % 100000000)::text, 8, '0');
      created := ((c.starts_on + floor(random() * (least(c.ends_on, current_date) - c.starts_on + 1))::int)
                  + make_interval(hours => 9 + floor(random() * 11)::int, mins => floor(random() * 60)::int))
                 at time zone tz;
      if created > now() - interval '30 minutes' then created := now() - interval '2 hours' - make_interval(mins => seq); end if;

      r := random();
      is_contacted := r < 0.85 and created < now() - interval '1 hour';
      t_contact := created + make_interval(mins => 5 + floor(random() * 240)::int);
      is_quoted := is_contacted and random() < case when c.n = 2 then 0.85 else 0.6 end;
      t_quote := t_contact + make_interval(hours => 4 + floor(random() * 40)::int);
      is_quoted := is_quoted and t_quote < now();
      is_booked := is_quoted and random() < case when c.n in (2, 3) then 0.8 else 0.6 end;
      t_book := t_quote + make_interval(hours => 12 + floor(random() * 60)::int);
      is_booked := is_booked and t_book < now();
      is_pending := is_quoted and not is_booked and random() < 0.3;

      -- Ganado: OS entregada real del centro (de preferencia con el servicio de la
      -- campaña), hasta 30 días después de la reserva y sin otro prospecto.
      o_id := null; o_client := null; o_total := null; o_at := null; o_name := null; o_phone := null;
      if is_booked and random() < 0.75 then
        select so.id, so.client_id, so.total, so.delivered_at, cl.full_name, cl.phone
          into o_id, o_client, o_total, o_at, o_name, o_phone
          from public.service_orders so join public.clients cl on cl.id = so.client_id
         where so.detail_center_id = c.center and so.status = 'entregada' and so.channel <> 'b2b'
           and so.delivered_at between t_book and t_book + interval '30 days' and so.delivered_at < now()
           and not exists (select 1 from public.leads l where l.service_order_id = so.id)
         order by not exists (select 1 from public.service_order_items it
                               where it.service_order_id = so.id and it.service_id = c.service), so.delivered_at
         limit 1;
      end if;
      is_lost := o_id is null and not is_booked and created < now() - interval '7 days' and random() < 0.3;
      t_close := case when o_id is not null then o_at
                      when is_lost then least(now(), created + make_interval(days => 3 + floor(random() * 6)::int)) end;
      stage := case when o_id is not null then 'ganado' when is_lost then 'perdido' when is_booked then 'reservado'
                    when is_pending then 'pendiente_reserva' when is_quoted then 'cotizado'
                    when is_contacted then 'contactado' else 'nuevo' end;
      consent := case when random() < 0.55 then array['whatsapp'] else '{}'::text[] end;
      if o_id is not null then
        lead_name := o_name;
        if o_phone ~ '^\+[1-9][0-9]{7,14}$' then lead_phone := o_phone; end if;
      end if;

      insert into public.leads (id, organization_id, detail_center_id, full_name, phone, source_channel, source_detail,
                                client_id, vehicle_description, consent_channels, consent_at, estimated_value, stage_id,
                                status, owner_id, next_action, next_action_on, first_contact_at, closed_at, won_value,
                                service_order_id, loss_reason, campaign_id, request_id, created_at)
      select lead_id, org, c.center, lead_name, lead_phone, lead_src,
             case when c.id is not null then 'Campaña: ' || c.name end,
             o_client, cars[1 + floor(random() * cardinality(cars))::int],
             consent, case when cardinality(consent) > 0 then created end,
             case when is_quoted then svc_price end, s.id,
             case stage when 'ganado' then 'ganada' when 'perdido' then 'perdida' else 'abierta' end,
             case when c.center = cdmx then owner_cdmx else owner_mty end,
             case stage when 'nuevo' then 'Primer contacto' when 'contactado' then 'Enviar cotización'
                        when 'cotizado' then 'Dar seguimiento a la cotización' when 'pendiente_reserva' then 'Confirmar fecha'
                        when 'reservado' then 'Confirmar cita' end,
             case when stage not in ('ganado', 'perdido') then current_date + floor(random() * 4)::int end,
             case when is_contacted then t_contact end, t_close, o_total, o_id,
             case when is_lost then loss_reasons[1 + floor(random() * cardinality(loss_reasons))::int] end,
             c.id, lead_id, created
        from _stage s where s.code = stage;

      insert into public.lead_services (lead_id, service_id, organization_id) values (lead_id, c.service, org);

      ev_channel := case lead_src when 'whatsapp' then 'whatsapp' when 'instagram' then 'redes' when 'facebook' then 'redes'
                                  else 'llamada' end;
      insert into public.lead_events (organization_id, detail_center_id, lead_id, kind, source_channel, from_stage_id,
                                      to_stage_id, value, channel, service_order_id, note, occurred_at)
      select org, c.center, lead_id, e.kind, lead_src, fs.id, ts.id, e.value, e.channel, e.so, e.note, e.at
        from (values
          (1, 'creado', null, 'nuevo', null::numeric, null, null::uuid, null, created, true),
          (2, 'contacto', null, null, null, ev_channel, null, 'Primer contacto', t_contact, is_contacted),
          (3, 'etapa', 'nuevo', 'contactado', null, null, null, 'Primer contacto', t_contact, is_contacted),
          (4, 'cotizacion', null, null, svc_price, null, null, 'Cotización enviada', t_quote, is_quoted),
          (5, 'etapa', 'contactado', 'cotizado', null, null, null, 'Cotización enviada', t_quote, is_quoted),
          (6, 'etapa', 'cotizado', 'pendiente_reserva', null, null, null, 'Pidió pensarlo unos días',
             t_quote + interval '1 day', is_pending and t_quote + interval '1 day' < now()),
          (7, 'reserva', null, null, null, null, null, 'Cita agendada', t_book, is_booked),
          (8, 'etapa', 'cotizado', 'reservado', null, null, null, 'Cita agendada', t_book, is_booked),
          (9, 'ganado', null, null, o_total, null, o_id, 'Servicio entregado', t_close, o_id is not null),
          (10, 'etapa', 'reservado', 'ganado', null, null, null, 'Servicio entregado', t_close, o_id is not null),
          (11, 'perdido', null, null, null, null, null, 'Sin interés por ahora', t_close, is_lost),
          (12, 'etapa', case when is_pending then 'pendiente_reserva' when is_quoted then 'cotizado' when is_contacted then 'contactado' else 'nuevo' end, 'perdido',
             null, null, null, 'Sin interés por ahora', t_close, is_lost)
        ) e(pos, kind, from_stage, to_stage, value, channel, so, note, at, keep)
        left join _stage fs on fs.code = e.from_stage
        left join _stage ts on ts.code = e.to_stage
       where e.keep
       order by e.pos;
    end loop;
  end loop;

  -- 6. Automatizaciones (operativas activas y promocionales en pausa) y su primera corrida.
  insert into public.automations (id, organization_id, detail_center_id, name, trigger, purpose, delay_days, due_in_days,
                                  message_template, cooldown_days, max_per_run, active, activated_at, assign_to)
  values
    ('a70de000-0000-4000-8000-000000000001', org, cdmx, 'Nuevo prospecto: contactar hoy', 'prospecto_nuevo', 'operativa',
     0, 0, 'Hola {nombre}, gracias por escribir a {centro}. ¿Te ayudo con tu cotización?', 30, 50, true,
     now() - interval '10 days', owner_cdmx),
    ('a70de000-0000-4000-8000-000000000002', org, cdmx, 'Recordar cotización sin respuesta', 'cotizacion_pendiente',
     'operativa', 2, 0, 'Hola {nombre}, ¿pudiste revisar la cotización {folio}? Vence el {fecha}.', 30, 50, true,
     now() - interval '10 days', owner_cdmx),
    ('a70de000-0000-4000-8000-000000000003', org, mty, 'Nuevo prospecto: contactar hoy (MTY)', 'prospecto_nuevo',
     'operativa', 0, 0, 'Hola {nombre}, gracias por escribir a {centro}. ¿Qué servicio te interesa?', 30, 50, true,
     now() - interval '10 days', owner_mty),
    ('a70de000-0000-4000-8000-000000000004', org, mty, 'Confirmar cita de mañana', 'reserva_proxima', 'operativa', 1, 0,
     'Hola {nombre}, te esperamos el {fecha} en {centro}.', 7, 50, true, now() - interval '10 days', owner_mty),
    ('a70de000-0000-4000-8000-000000000005', org, null, 'Agradecer y pedir reseña', 'servicio_entregado', 'operativa', 1, 1,
     'Hola {nombre}, gracias por tu visita a {centro}. ¿Cómo te fue con tu {servicio}?', 60, 20, true,
     now() - interval '3 days', null),
    ('a70de000-0000-4000-8000-000000000006', org, cdmx, 'Recompra de lavado (promocional)', 'mantenimiento', 'promocional',
     30, 1, 'Hola {nombre}, ya toca tu {servicio} en {centro}. ¿Te agendo?', 30, 50, false, null, owner_cdmx),
    ('a70de000-0000-4000-8000-000000000007', org, mty, 'Clientes sin visita en 90 días', 'cliente_inactivo', 'promocional',
     90, 2, 'Hola {nombre}, hace tiempo no te vemos en {centro}. ¿Agendamos un lavado?', 90, 30, false, null, owner_mty);
  perform private.run_automation(a.id, 'programada', null)
     from public.automations a
    where a.id::text like 'a70de000-%' and a.active;

  perform set_config('app.change_reason', '', true);
  raise notice 'Marketing demo: % campañas, % piezas, % prospectos',
    (select count(*) from public.campaigns where id::text like 'ca0de000-%'),
    (select count(*) from public.content_posts where organization_id = org),
    seq;
end;
$$;
