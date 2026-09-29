-- Genera docs/diccionario-datos.md desde el catálogo (ver scripts/data-dictionary.sh).
-- :modules es una lista "tabla=archivo.md" (módulo que documenta la tabla).
with modules as (
  select split_part(m, '=', 1) as tbl, split_part(m, '=', 2) as doc
    from unnest(string_to_array(:'modules', ',')) m
),
tables as (
  select c.oid, c.relname,
         (select string_agg(attname, ',') from pg_attribute a where a.attrelid = c.oid and attname in ('detail_center_id', 'home_detail_center_id', 'organization_id') and not attisdropped) as tenancy_cols,
         (select string_agg(distinct privilege_type, ', ' order by privilege_type) from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'authenticated'
             and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')) as direct_writes,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
)
select string_agg(section, E'\n' order by relname)
  from (
    select t.relname,
           format(E'### `%s`\n\n', t.relname)
        || format(E'- **Módulo:** %s\n', coalesce((select format('[%s](modules/%s)', replace(m.doc, '.md', ''), m.doc) from modules m where m.tbl = t.relname), '—'))
        || format(E'- **Tenencia:** %s\n', case
             when t.tenancy_cols like '%detail_center_id%' then 'centro (`' || case when t.tenancy_cols like '%home_detail_center_id%' then 'home_detail_center_id' else 'detail_center_id' end || '`) y organización'
             when t.tenancy_cols like '%organization_id%' then 'organización'
             else 'por relación (usuario o catálogo global)' end)
        || format(E'- **Escritura:** %s · RLS con %s política(s)\n\n', coalesce('directa con RLS (' || t.direct_writes || ')', 'sólo por RPC'), t.policies)
        || E'| Columna | Tipo | Nulo | Default |\n| --- | --- | --- | --- |\n'
        || (select string_agg(format('| `%s` | %s | %s | %s |', a.attname, format_type(a.atttypid, a.atttypmod),
                                     case when a.attnotnull then 'no' else 'sí' end,
                                     coalesce(nullif(replace(left(pg_get_expr(d.adbin, d.adrelid), 60), '|', '\|'), ''), '')), E'\n' order by a.attnum)
              from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
             where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped)
        || E'\n' as section
      from tables t
  ) s;
