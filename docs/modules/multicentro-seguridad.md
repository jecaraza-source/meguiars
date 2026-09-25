# Módulo F0.2 — Supabase multicentro y seguridad

## Alcance

Base de tenancy y seguridad para operar varios Detail Centers bajo una organización:

- organizaciones y centros;
- asignación de usuarios a uno o varios centros;
- roles corporativos;
- helpers SQL de autorización;
- RLS deny-by-default;
- auditoría genérica.

No incluye tablas de negocio ni flujos de Auth (login/sesión); esos son módulos siguientes.

## Modelo de datos

| Tabla                 | Clave                                          | Propósito                                                        | Soft-disable                   | Escritura desde clientes                 |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------- |
| `organizations`       | `id`, `slug` único                             | organización (grupo de centros)                                  | `active`                       | ninguna (`service_role`)                 |
| `detail_centers`      | `id`, único `(organization_id, code)`          | centro de costos y resultados                                    | `active`                       | `update_detail_center`                   |
| `profiles`            | `id` = `auth.users.id`                         | datos del usuario                                                | `active` (sólo `service_role`) | el propio usuario, sólo `full_name`      |
| `user_detail_centers` | `(detail_center_id, user_id)`                  | asignación a un centro con un rol                                | `active`                       | `set_center_membership`                  |
| `role_assignments`    | `id`, único `(organization_id, user_id, role)` | rol corporativo: aplica a todos los centros de la organización   | `active`                       | `set_role_assignment`                    |
| `audit_log`           | `id`                                           | cambios de fila (`INSERT`/`UPDATE`/`DELETE`) y eventos (`EVENT`) | —                              | ninguna (triggers y `private.log_event`) |

Todas tienen `created_at` y `updated_at` (UTC), excepto `audit_log`, que tiene `occurred_at`. Índices: `user_id` y `detail_center_id` en las asignaciones; `organization_id` en centros; `(organization_id, occurred_at)` y `(detail_center_id, occurred_at)` en auditoría.

## Roles y permisos

Los roles efectivos en un centro son la **unión** de:

- el rol del usuario en ese centro (`user_detail_centers`);
- sus roles en la organización del centro (`role_assignments`).

Todo acceso exige que la organización, el centro, el perfil y la asignación estén activos.

| Capacidad (`domain/roles.ts`) | admin_socio | encargado | operador_recepcion | contador | comercial_b2b | Aplicado en SQL               |
| ----------------------------- | :---------: | :-------: | :----------------: | :------: | :-----------: | ----------------------------- |
| `center.read`                 |      ✓      |     ✓     |         ✓          |    ✓     |       ✓       | `detail_centers_select`       |
| `center.manage`               |      ✓      |           |                    |          |               | `detail_centers_update`       |
| `members.read`                |      ✓      |     ✓     |                    |    ✓     |               | `user_detail_centers_select`  |
| `members.manage`              |     ✓¹      |           |                    |          |               | `can_manage_center_member`    |
| `audit.read`                  |      ✓      |           |                    |    ✓     |               | `audit_log_select`            |
| `operations.write`            |      ✓      |     ✓     |         ✓          |          |               | contrato para módulos futuros |
| `b2b.write`                   |      ✓      |           |                    |          |       ✓       | contrato para módulos futuros |

¹ El admin_socio **corporativo** asigna cualquier rol en su organización, incluidos los roles corporativos. El admin_socio **de centro** asigna cualquier rol salvo admin_socio, y sólo en su centro. Toda organización conserva al menos un admin_socio corporativo activo.

- **Vista corporativa:** un rol en `role_assignments` da acceso a todos los centros activos de la organización. El admin_socio corporativo ve además los centros deshabilitados.
- **Contador:** sólo lectura. Lee centros, membresías, roles corporativos y auditoría, y no puede ejecutar ninguna RPC de escritura.

## Helpers SQL (`private`, security definer)

| Helper                                               | Uso                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `center_roles(center)` / `org_roles(org)`            | roles efectivos del usuario de la sesión                                                      |
| `has_center_role(center, roles[] default null)`      | pieza base de las políticas: con `null`, basta cualquier acceso                               |
| `has_org_role(org, roles[] default null)`            | lo mismo a nivel organización                                                                 |
| `is_org_member(org)`                                 | acceso a la organización por rol corporativo o por algún centro                               |
| `can_manage_center_member(center, role)`             | regla de asignación de membresías                                                             |
| `can_see_profile(user)`                              | visibilidad de perfiles entre compañeros                                                      |
| `log_event(org, center, event, table, record, data)` | evento de auditoría genérico (`^[a-z0-9_]+(\.[a-z0-9_]+)+$`), con actor y motivo de la sesión |

**Plantilla para tablas de negocio futuras** (deny-by-default):

```sql
create table public.<tabla> (..., detail_center_id uuid not null references public.detail_centers (id), ...);
alter table public.<tabla> enable row level security;
create policy <tabla>_select on public.<tabla> for select to authenticated
  using (private.has_center_role(detail_center_id));
create policy <tabla>_write on public.<tabla> for insert to authenticated
  with check (private.has_center_role(detail_center_id, array['admin_socio','encargado','operador_recepcion']::public.app_role[]));
```

En políticas, compara con `(select auth.uid())` (se evalúa una vez por consulta) y en funciones fija `set search_path = ''`; las pruebas lo verifican. Las tablas y funciones nuevas de `public` nacen sin privilegios para `anon` ni `PUBLIC`. La prueba `todas las tablas de public tienen RLS habilitado` falla si una migración olvida habilitar RLS.

## RPC

| RPC                                                         | Quién                              | Notas                                            |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `my_detail_centers()`                                       | cualquier usuario autenticado      | centros visibles con `roles` y `corporate_roles` |
| `update_detail_center(id, name, timezone, reason)`          | admin_socio (centro o corporativo) | motivo de 3 a 500 caracteres                     |
| `set_center_membership(center, user, role, active, reason)` | ver ¹                              | upsert; no se borra, se desactiva                |
| `set_role_assignment(org, user, role, active, reason)`      | admin_socio corporativo            | protege al último admin_socio (`23514`)          |

## Transición desde F0.1

La migración `20260923000000_multicenter_security.sql` aplica los cambios sobre los datos existentes:

- crea la organización `default` si hay centros y los liga a ella;
- renombra `center_memberships` a `user_detail_centers`;
- mapea los roles: owner/admin → admin_socio, manager → encargado, advisor/technician → operador_recepcion, viewer → contador;
- agrega `organization_id` a la auditoría existente.

`npm run test:db` lo verifica con datos del esquema anterior (`supabase/tests/upgrade/`).

## Web y móvil

"Mis centros" (`apps/*/src/lib/centers.ts`) llama `createAccessRepository(client).listMyAccess()`. Ambas apps renderizan lo mismo con `presentCenterAccess` y `corporateSummaryText` de `@meguiars/domain`:

- roles por centro;
- insignias _Corporativo_, _Deshabilitado_ y _Sólo lectura_;
- resumen de la vista corporativa;
- hora local de cada centro.

## Seed

`supabase/seed.sql` crea la organización `meguiars-demo` con los centros CDMX-01 y MTY-01. Los usuarios se crean con Auth; el archivo trae el SQL para asignarlos.

## Criterios de aceptación → pruebas (`supabase/tests/rls_multicenter.test.sql`)

| Criterio                                       | Casos                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un usuario del centro A no lee ni escribe en B | operador A: no ve B, no edita B, no se agrega a B. admin_socio de A: no gestiona B. Admin de O2: no ve O1                                                      |
| El admin corporativo consolida                 | ve todos los centros de su organización, incluido el deshabilitado; `my_detail_centers` le da admin_socio en A y B; edita cualquier centro                     |
| El contador sólo lee                           | lee centros, membresías, roles y auditoría; `update_detail_center`, `set_center_membership`, `set_role_assignment` e insertar organizaciones devuelven `42501` |
| Casos positivos y negativos                    | 67 aserciones más la verificación de la transición                                                                                                             |
| Seed                                           | organización demo con 2 centros, validada por `npm run test:db`                                                                                                |

## Supuestos

- Un usuario tiene como máximo un rol por centro y puede tener varios roles corporativos.
- Deshabilitar un perfil o una organización y crear organizaciones o centros son operaciones de `service_role` (onboarding o soporte).
- B2C, membresías comerciales y B2B serán tablas de negocio con `detail_center_id` que usen estos helpers.

## Pendientes

- Módulo de Auth (sesión en web y móvil) y pantallas de administración de membresías y roles. Las RPC y el `AccessRepository` ya están listos.
- Regenerar `database.types.ts` con `npm run db:types` y validar las políticas contra `supabase start`.
- Si el volumen crece, evaluar cachear `center_roles` o usar claims del JWT (hoy se calcula por fila).
