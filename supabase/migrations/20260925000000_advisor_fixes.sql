-- Correcciones señaladas por los asesores de Supabase (database linter).
--
-- 0011 function_search_path_mutable: las funciones de trigger sin search_path
-- fijo resolverían nombres según el search_path de quien las invoque.
-- pg_catalog (now(), pg_timezone_names) se consulta siempre, aun con ''.
alter function private.set_updated_at() set search_path = '';
alter function private.validate_timezone() set search_path = '';

-- 0003 auth_rls_initplan: `(select auth.uid())` se evalúa una vez por consulta
-- (InitPlan) en lugar de una vez por fila. Mismo significado; sólo rendimiento.
alter policy profiles_select on public.profiles
  using (id = (select auth.uid()) or private.can_see_profile(id));
alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
alter policy user_detail_centers_select on public.user_detail_centers
  using (
    user_id = (select auth.uid())
    or private.has_center_role(detail_center_id, array['admin_socio', 'encargado', 'contador']::public.app_role[])
  );
alter policy role_assignments_select on public.role_assignments
  using (
    user_id = (select auth.uid())
    or private.has_org_role(organization_id, array['admin_socio', 'contador']::public.app_role[])
  );
