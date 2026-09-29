-- Invariantes de seguridad del esquema (F5.1). Revisan el catálogo, así que
-- cubren automáticamente las tablas y funciones nuevas.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.list(q text) returns text language plpgsql as $$
declare r text;
begin
  execute 'select string_agg(x::text, '', '') from (' || q || ') s(x)' into r;
  return coalesce(r, '-');
end $$;

select pg_temp.assert(pg_temp.list($q$
  select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
$q$) = '-', 'toda tabla de public tiene RLS habilitado');

select pg_temp.assert(pg_temp.list($q$
  select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
$q$) = '-', 'toda tabla de public tiene al menos una política (sin política = invisible por error)');

select pg_temp.assert(pg_temp.list($q$
  select distinct table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'
$q$) = '-', 'anon no tiene privilegios sobre ninguna tabla de public');

select pg_temp.assert(pg_temp.list($q$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
$q$) = '-', 'authenticated no tiene TRUNCATE (salta RLS), TRIGGER ni REFERENCES en public');

select pg_temp.assert(pg_temp.list($q$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
$q$) = '-', 'toda función SECURITY DEFINER fija search_path');

select pg_temp.assert(pg_temp.list($q$
  select p.oid::regprocedure from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and (has_function_privilege('anon', p.oid, 'execute')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
$q$) = '-', 'ninguna función de public/private es ejecutable por anon ni por PUBLIC');

select pg_temp.assert(pg_temp.list($q$
  select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and pg_get_functiondef(p.oid) !~ '(private\.[a-z_0-9]+|auth\.uid)\('
$q$) = '-', 'toda función SECURITY DEFINER expuesta llama a un chequeo de permiso (private.* o auth.uid())');

select pg_temp.assert(pg_temp.list($q$
  select id from storage.buckets where public
$q$) = '-', 'ningún bucket de Storage es público');

select pg_temp.assert(pg_temp.list($q$
  select b.id from storage.buckets b where b.file_size_limit is null or b.allowed_mime_types is null
$q$) = '-', 'todo bucket limita tamaño y tipos de archivo');

select pg_temp.assert(not has_schema_privilege('anon', 'private', 'usage'), 'anon no usa el esquema private');

rollback;
