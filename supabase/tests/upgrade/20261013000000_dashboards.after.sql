-- Tras 20261013000000_dashboards: cada organización existente tiene su tablero
-- corporativo por defecto (12 widgets, todos con métricas registradas).
\set ON_ERROR_STOP on
do $$
begin
  if exists (
       select 1 from public.organizations o
        where (select count(*) from public.dashboard_definitions d where d.organization_id = o.id and d.is_default) <> 1) then
    raise exception 'FALLÓ: una organización previa no tiene exactamente un tablero corporativo por defecto';
  end if;
  if exists (
       select 1 from public.dashboard_definitions d
        where (select count(*) from public.dashboard_widgets w where w.dashboard_id = d.id) <> 12) then
    raise exception 'FALLÓ: el tablero corporativo por defecto debe traer 12 widgets';
  end if;
  if (select count(*) from public.organizations) = 0 then
    raise exception 'FALLÓ: la prueba de actualización necesita organizaciones previas';
  end if;
  raise notice 'ok - las organizaciones previas reciben el tablero corporativo por defecto';
end $$;
