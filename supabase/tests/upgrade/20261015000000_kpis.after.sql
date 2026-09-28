-- Tras 20261015000000_kpis: cada organización previa tiene sus parámetros de
-- KPIs con los valores por defecto (3 años de vida, 10 h × 6 días).
\set ON_ERROR_STOP on
do $$
begin
  if (select count(*) from public.organizations) = 0 then
    raise exception 'FALLÓ: la prueba de actualización necesita organizaciones previas';
  end if;
  if exists (select 1 from public.organizations o
              where not exists (select 1 from public.kpi_settings s
                                 where s.organization_id = o.id and s.ltv_lifetime_years = 3
                                   and s.operating_hours_per_day = 10 and s.operating_days_per_week = 6)) then
    raise exception 'FALLÓ: una organización previa no tiene parámetros de KPIs por defecto';
  end if;
  raise notice 'ok - las organizaciones previas reciben parámetros de KPIs por defecto';
end $$;
