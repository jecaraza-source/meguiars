-- Pruebas de CR2 (fase 3): campañas con UTM, gasto (con egreso de marketing
-- sin duplicar), calendario de contenido, promociones preautorizadas en
-- cotización y OS (vigencia, centros, servicios, usos, una por documento),
-- atribución del prospecto y hechos por campaña.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.assert_fails(stmt text, expected_state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'ok - %', msg;
      return;
    end if;
    raise exception 'FALLÓ: % (SQLSTATE % en lugar de %: %)', msg, sqlstate, expected_state, sqlerrm;
  end;
  raise exception 'FALLÓ: % (no produjo error)', msg;
end $$;

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('app.change_reason', '', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.deliver(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders set status = 'entregada', delivered_at = now() where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
select private.center_today(:'A') as today \gset

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV-MAN', 'Lavado manual detallado', null, 'valor_medio', 90, 400, 40, 'Alta', 30)).id as lmd \gset
select (public.create_service(:'O1', 'CERA', 'Encerado', null, 'premium', 60, 600, 120)).id as cera \gset
reset role;

-- ---------------------------------------------------------------------------
-- Campañas: permisos por centro y organización, UTM único.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.upsert_campaign(%L, null, null, %L, 'Octubre', 'prospectos', '{instagram}', current_date, current_date + 30, 5000, null, 'instagram', 'paid_social', 'lmd_oct', null, null, 'Alta')$$, :'O1', :'A'),
  '42501', 'la recepción no crea campañas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.upsert_campaign(%L, null, null, null, 'Toda la org', 'marca', '{}', current_date, current_date + 30, null, null, 'ig', 'social', 'org_wide', null, null, 'Alta')$$, :'O1'),
  '42501', 'el encargado no crea campañas de toda la organización');
select (public.upsert_campaign(:'O1', null, null, :'A', 'Lavado manual octubre', 'prospectos', array['instagram', 'facebook', 'instagram'],
  :'today'::date - 5, :'today'::date + 25, 5000, 'activa', 'Instagram', 'paid_social', 'LMD_Oct', 'https://meguiars.mx/lavado',
  null, 'Campaña del mes')).id as camp \gset
select pg_temp.assert((select channels = array['facebook', 'instagram'] and utm_source = 'instagram' and utm_campaign = 'lmd_oct'
                         from public.campaigns where id = :'camp'),
  'el encargado crea la campaña de su centro; UTM en minúsculas y canales sin repetir');
select pg_temp.assert_fails(format($$select public.upsert_campaign(%L, null, null, %L, 'Otra', 'ventas', '{}', current_date, current_date, null, null, 'ig', 'social', 'lmd_oct', null, null, 'Alta')$$, :'O1', :'A'),
  'MG002', 'utm_campaign no se repite en la organización');
reset role;

-- ---------------------------------------------------------------------------
-- Gasto: manual o ligado a un egreso de marketing (sin capturarlo dos veces).
-- ---------------------------------------------------------------------------
insert into public.expense_categories (id, organization_id, code, name, pnl_group)
values ('e0000000-0000-0000-0000-000000000001', :'O1', 'publicidad_test', 'Publicidad', 'marketing'),
       ('e0000000-0000-0000-0000-000000000002', :'O1', 'renta_test', 'Renta', 'operativo');
select set_config('app.change_reason', 'prueba', true);
insert into public.expenses (id, organization_id, detail_center_id, number, folio, category_id, pnl_group, concept, amount,
                             payment_method, paid_on, status, approved_at, request_id)
values ('e1000000-0000-0000-0000-000000000001', :'O1', :'A', 1, 'A-01-EG-00001', 'e0000000-0000-0000-0000-000000000001',
        'marketing', 'Meta Ads octubre', 1500, 'tarjeta', :'today'::date - 1, 'aprobado', now(), gen_random_uuid()),
       ('e1000000-0000-0000-0000-000000000002', :'O1', :'A', 2, 'A-01-EG-00002', 'e0000000-0000-0000-0000-000000000002',
        'operativo', 'Renta', 9000, 'transferencia', :'today'::date - 1, 'aprobado', now(), gen_random_uuid());
select set_config('app.change_reason', '', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.add_campaign_spend(:'camp', :'today'::date - 2, 500, 'instagram', null, 'Boost')).id as sp1 \gset
select (public.add_campaign_spend(:'camp', null, 99999, 'facebook', 'e1000000-0000-0000-0000-000000000001', null)).amount as sp2 \gset
select pg_temp.assert(:'sp2'::numeric = 1500, 'ligado a un egreso de marketing, el gasto toma su importe');
select pg_temp.assert_fails(format($$select public.add_campaign_spend(%L, null, 1, 'facebook', 'e1000000-0000-0000-0000-000000000001', null)$$, :'camp'),
  'MG002', 'un egreso se liga a una sola campaña');
select pg_temp.assert_fails(format($$select public.add_campaign_spend(%L, null, 1, 'otro', 'e1000000-0000-0000-0000-000000000002', null)$$, :'camp'),
  'MG002', 'sólo se ligan egresos del grupo marketing');
select public.void_campaign_spend(:'sp1', 'Capturado por error');
select pg_temp.assert((select spend from public.list_campaigns(:'O1', :'camp')) = 1500,
  'el gasto anulado no cuenta (inversión = 1,500)');
reset role;

-- ---------------------------------------------------------------------------
-- Calendario de contenido.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.upsert_content_post(:'O1', null, null, :'A', :'camp', 'instagram', 'reel', 'Antes y después: lavado manual',
  'Reserva por WhatsApp', now() + interval '1 day', null,
  'https://meguiars.mx/lavado?utm_source=instagram&utm_medium=paid_social&utm_campaign=lmd_oct&utm_content=reel1', 'Plan')).id as post \gset
select pg_temp.assert_fails(format($$select public.set_content_post_status(%L, 1, 'publicada', null, null)$$, :'post'),
  '22023', 'publicar pide el enlace de la publicación real');
select public.set_content_post_status(:'post', 1, 'publicada', 'https://www.instagram.com/p/ABC123/', null);
select pg_temp.assert((select status = 'publicada' and published_at is not null from public.content_posts where id = :'post'),
  'la publicación queda registrada con su enlace');
select pg_temp.assert_fails(format($$select public.upsert_content_post(%L, %L, 2, %L, null, 'instagram', 'reel', 'Otro título', null, now(), null, null, 'Cambio')$$, :'O1', :'post', :'A'),
  'MG002', 'una publicación publicada ya no se edita');
select pg_temp.assert((select count(*) from public.list_content_posts(:'O1', :'today'::date - 1, :'today'::date + 7)) = 1,
  'el calendario lista la publicación del periodo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert((select count(*) from public.content_posts) = 0 and (select count(*) from public.campaigns) = 0,
  'recepción de otro centro no ve campañas ni calendario del centro A');
reset role;

-- ---------------------------------------------------------------------------
-- Promociones: sólo el admin; se aplican preautorizadas.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.upsert_promotion(%L, null, null, null, 'LAVA15', 'x', 'percent', 15, '{}', '{}', current_date, current_date, null, true, null, 'Alta')$$, :'O1'),
  '42501', 'el encargado no crea promociones');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_promotion(:'O1', null, null, :'camp', 'lava15', 'Lavado manual 15 %', 'percent', 15, array[:'lmd']::uuid[],
  array[:'A']::uuid[], :'today'::date - 1, :'today'::date + 20, 2, true, 'Sólo lavado manual', 'Promo del mes')).id as promo \gset
select (public.upsert_promotion(:'O1', null, null, null, 'VIEJA', 'Vencida', 'amount', 100, '{}', '{}',
  :'today'::date - 30, :'today'::date - 10, null, true, null, 'Histórica')).id as vieja \gset
select pg_temp.assert((select code from public.promotions where id = :'promo') = 'LAVA15', 'el código se guarda en mayúsculas');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', gen_random_uuid(), 'Ana Ruiz', '5511112222', null, 'person', null, '{}', 'web',
  '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select (public.create_lead(:'A', gen_random_uuid(), 'Ana Ruiz', 'instagram', '5511112222')).id as lead \gset
select public.link_lead_client(:'lead', (select version from public.leads where id = :'lead'), :'ana', 'Es la clienta');
select (public.create_quote(:'A', gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('service_id', :'lmd'), jsonb_build_object('service_id', :'cera')), :'lead')).id as q \gset
select pg_temp.assert_fails(format($$select public.apply_promotion_to_quote(%L, (select version from public.quotes where id = %L), 'VIEJA')$$, :'q', :'q'),
  'MG002', 'una promoción vencida no se aplica');
select pg_temp.assert_fails(format($$select public.apply_promotion_to_quote(%L, (select version from public.quotes where id = %L), 'NOEXISTE')$$, :'q', :'q'),
  'MG002', 'un código inexistente se rechaza');
select public.apply_promotion_to_quote(:'q', (select version from public.quotes where id = :'q'), 'lava15');
select pg_temp.assert((select total from public.quotes where id = :'q') = 940
                      and (select source || ':' || amount || ':' || authorization_level from public.quote_discounts where quote_id = :'q')
                          = 'promocion:60.00:admin',
  'LAVA15 descuenta 15 % sólo del lavado manual (60 de 400): total 940, nivel admin preautorizado');
select pg_temp.assert((select campaign_id from public.leads where id = :'lead') = :'camp'::uuid,
  'el prospecto sin campaña queda atribuido a la campaña de la promoción');
select pg_temp.assert_fails(format($$select public.apply_promotion_to_quote(%L, (select version from public.quotes where id = %L), 'LAVA15')$$, :'q', :'q'),
  'MG002', 'una cotización lleva una sola promoción');
-- La promoción no consume el nivel de la recepción: 10 % manual adicional sigue permitido (pct manual 10 % de 1000 = 100).
select public.add_quote_discount(:'q', (select version from public.quotes where id = :'q'), null, 'amount', 100, 'Cliente frecuente');
select pg_temp.assert((select total from public.quotes where id = :'q') = 840,
  'un descuento manual de 10 % se autoriza con nivel operador aunque ya haya promoción');
reset role;

-- OS directa en el centro A con la misma promoción (segundo y último uso).
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', (select id from public.vehicles where plate = 'ANA0001'),
  jsonb_build_array(jsonb_build_object('service_id', :'lmd')))).id as os \gset
select public.apply_promotion_to_order(:'os', (select version from public.service_orders where id = :'os'), 'LAVA15');
select pg_temp.assert((select total from public.service_orders where id = :'os') = 340
                      and (select source || ':' || promotion_id::text from public.service_order_discounts where service_order_id = :'os')
                          = 'promocion:' || :'promo',
  'en la OS la promoción descuenta 60 del lavado manual (total 340) con origen promoción');
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', (select id from public.vehicles where plate = 'ANA0001'),
  jsonb_build_array(jsonb_build_object('service_id', :'lmd')))).id as os3 \gset
select pg_temp.assert_fails(format($$select public.apply_promotion_to_order(%L, (select version from public.service_orders where id = %L), 'LAVA15')$$, :'os3', :'os3'),
  'MG002', 'con sus 2 usos agotados, la promoción ya no se aplica');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert_fails(format($$select public.apply_promotion_to_order(%L, 1, 'LAVA15')$$, :'os3'),
  '42501', 'recepción de otro centro no toca la OS');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.upsert_promotion(%L, %L, 1, %L, 'LAVA15', 'x', 'percent', 20, %L, '{}', current_date, current_date + 1, 5, true, null, 'Subir')$$,
  :'O1', :'promo', :'camp', array[:'lmd']::uuid[]),
  'MG002', 'una promoción usada no cambia su descuento');
select pg_temp.assert((select uses = 2 and discount_granted = 120 from public.list_promotions(:'O1', :'promo')),
  'la promoción reporta 2 usos y 120 de descuento otorgado');
reset role;

-- ---------------------------------------------------------------------------
-- Atribución y hechos por campaña.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_lead(:'A', gen_random_uuid(), 'Luis Gómez', 'facebook', '5522223333')).id as lead2 \gset
select public.set_lead_campaign(:'lead2', (select version from public.leads where id = :'lead2'), :'camp');
reset role;
select pg_temp.deliver(:'os');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.win_lead(:'lead', (select version from public.leads where id = :'lead'), :'os');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select (leads, quoted, won, sales, spend, promo_uses) = (2, 1, 1, 340::numeric, 1500::numeric, 2)
     from public.campaign_facts(:'O1', array[:'A']::uuid[], :'today'::date - 7, :'today'::date)
    where campaign_id = :'camp'),
  'el contador lee los hechos de la campaña: 2 prospectos, 1 cotizado, 1 ganado, ventas 340, inversión 1,500, 2 usos');
select pg_temp.assert((select count(*) from public.leads) = 0, 'sin ver datos personales de los prospectos');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(not exists (select 1 from public.campaign_facts(:'O1', array[:'A', :'B']::uuid[], :'today'::date - 7, :'today'::date)
                                   where leads > 0),
  'otro centro no ve los prospectos de la campaña del centro A');
reset role;
select pg_temp.assert((select count(*) from public.audit_log where table_name in ('public.campaigns', 'public.campaign_spend', 'public.promotions', 'public.content_posts')) >= 6,
  'campañas, gasto, promociones y calendario quedan en auditoría');

rollback;
