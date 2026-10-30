-- Catálogo completo de clientes: lista paginada sin tener que buscar.
--
-- Mismas columnas que search_clients (sin «matched_on») más el total para la
-- paginación. Security invoker: RLS decide qué clientes ve cada quien (los de su
-- organización visibles desde sus centros, ADR 0008). Los del centro activo van
-- primero y luego por nombre.
create function public.list_clients(p_detail_center_id uuid, p_offset integer default 0, p_limit integer default 50)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  kind text,
  home_detail_center_id uuid,
  home_center_name text,
  last_visit_at timestamptz,
  in_active_center boolean,
  plates text[],
  total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  with visible as (
    select c.*,
           exists (select 1 from public.client_centers cc
                    where cc.client_id = c.id and cc.detail_center_id = p_detail_center_id) as in_center
      from public.clients c
     where c.active
  )
  select v.id, v.full_name, v.phone, v.email, v.kind, v.home_detail_center_id, dc.name, v.last_visit_at,
         v.in_center,
         coalesce((select array_agg(x.plate order by x.created_at) from public.vehicles x
                    where x.client_id = v.id and x.active), '{}'),
         count(*) over ()
    from visible v
    left join public.detail_centers dc on dc.id = v.home_detail_center_id
   order by v.in_center desc, v.full_name, v.id
  offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.list_clients(uuid, integer, integer) from public, anon;
grant execute on function public.list_clients(uuid, integer, integer) to authenticated;
