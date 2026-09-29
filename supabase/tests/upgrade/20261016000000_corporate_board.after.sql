-- Tras 20261016000000_corporate_board: la lectura única admite la fuente
-- "services" sobre datos previos y los umbrales empiezan vacíos (sin alertas
-- hasta que el admin corporativo los configure).
\set ON_ERROR_STOP on
do $$
declare
  f jsonb;
begin
  if (select count(*) from public.detail_centers) = 0 then
    raise exception 'FALLÓ: la prueba de actualización necesita centros previos';
  end if;
  f := public.dashboard_facts(array['services', 'orders'], (select array_agg(id) from public.detail_centers),
                              current_date - 30, current_date, 'total');
  if not (f ? 'services' and f ? 'centers') then
    raise exception 'FALLÓ: dashboard_facts no devuelve la fuente de servicios sobre datos previos';
  end if;
  if exists (select 1 from public.kpi_thresholds) then
    raise exception 'FALLÓ: la migración no debe crear umbrales';
  end if;
  raise notice 'ok - datos previos: fuente de servicios disponible y sin umbrales configurados';
end $$;
