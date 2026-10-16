-- Búsqueda de clientes por nombre o apellido en cualquier orden: el nombre
-- coincide si contiene todas las palabras escritas («perez juan» encuentra a
-- «Juan Pérez»). Los que empiezan con lo escrito salen primero. Teléfono,
-- placa y correo siguen igual.
create or replace function public.search_clients(p_detail_center_id uuid, p_query text, p_limit integer default 20)
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
  matched_on text
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select private.like_escape(private.normalize_text(p_query)) as name,
           regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits,
           private.like_escape(coalesce(private.normalize_plate(p_query), '')) as plate,
           private.like_escape(coalesce(private.normalize_email(p_query), '')) as email,
           array(select private.like_escape(w)
                   from unnest(regexp_split_to_array(private.normalize_text(p_query), ' ')) w
                  where w <> '') as words
    where length(btrim(coalesce(p_query, ''))) >= 2
  ),
  hits as (
    select c.*, v.plates,
           case
             when q.plate <> '' and exists (select 1 from public.vehicles x
                    where x.client_id = c.id and x.active and x.plate like '%' || q.plate || '%') then 'plate'
             when length(q.digits) >= 4 and c.phone_digits like '%' || q.digits || '%' then 'phone'
             when q.email like '%@%' and c.email like q.email || '%' then 'email'
             when c.search_name like '%' || q.name || '%'
                  or (cardinality(q.words) > 1
                      and not exists (select 1 from unnest(q.words) w where c.search_name not like '%' || w || '%'))
               then 'name'
           end as matched_on
    from public.clients c
    cross join q
    left join lateral (
      select coalesce(array_agg(x.plate order by x.created_at), '{}') as plates
      from public.vehicles x where x.client_id = c.id and x.active
    ) v on true
    where c.active
  )
  select h.id, h.full_name, h.phone, h.email, h.kind, h.home_detail_center_id, dc.name, h.last_visit_at,
         exists (select 1 from public.client_centers cc
                  where cc.client_id = h.id and cc.detail_center_id = p_detail_center_id),
         h.plates, h.matched_on
  from hits h
  left join public.detail_centers dc on dc.id = h.home_detail_center_id
  where h.matched_on is not null
  order by 9 desc, (h.matched_on = 'plate') desc, (h.matched_on = 'phone') desc,
           (h.search_name like (select q.name from q) || '%') desc, h.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
