-- Verifica la transición de datos de 20260923000000_multicenter_security.
\set ON_ERROR_STOP on
do $$
declare
  default_org uuid := (select id from public.organizations where slug = 'default');
  mapped text;
begin
  if default_org is null then raise exception 'FALLÓ: no se creó la organización default'; end if;
  if exists (select 1 from public.detail_centers where organization_id is distinct from default_org) then
    raise exception 'FALLÓ: hay centros sin la organización default';
  end if;
  if (select count(*) from public.detail_centers where active) <> 2 then
    raise exception 'FALLÓ: los centros existentes deben quedar activos';
  end if;

  select string_agg(u.email || '=' || m.role::text, ',' order by u.email) into mapped
  from public.user_detail_centers m join auth.users u on u.id = m.user_id;
  if mapped <> 'admin@legacy=admin_socio,advisor@legacy=operador_recepcion,manager@legacy=encargado,'
             || 'owner@legacy=admin_socio,tech@legacy=operador_recepcion,viewer@legacy=contador' then
    raise exception 'FALLÓ: mapeo de roles inesperado: %', mapped;
  end if;

  if exists (select 1 from public.audit_log where organization_id is null) then
    raise exception 'FALLÓ: la auditoría previa no recibió organization_id';
  end if;
  if to_regclass('public.center_memberships') is not null then
    raise exception 'FALLÓ: center_memberships debió renombrarse';
  end if;
  raise notice 'ok - transición: organización default, centros ligados, roles mapeados, auditoría con organización';
end $$;
