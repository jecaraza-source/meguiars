# ADR 0002 — Multicentro, RLS y auditoría en la base de datos

- Estado: aceptado
- Fecha: 2026-09-22

## Decisión
- **Tenancy por `detail_center_id`**, con la membresía `center_memberships (detail_center_id, user_id, role)`. Un usuario puede pertenecer a varios centros con roles distintos.
- **Roles** (`app_role`): owner, admin, manager, advisor, technician y viewer. Sólo un owner puede otorgar, modificar o quitar el rol owner.
- **Autorización en RLS** mediante `private.has_center_role()` (`security definer`, para evitar recursión en las políticas de `center_memberships`). El esquema `private` no se expone por la API de datos.
- **Auditoría por trigger** genérico `private.audit_row()` hacia `public.audit_log`: registra actor (`auth.uid()`), fecha UTC, fila anterior y nueva (jsonb) y el motivo tomado de `app.change_reason`. Los clientes sólo pueden leer la bitácora (owner/admin/manager de su centro); ningún cliente puede escribirla.
- **Zona horaria por centro** (`detail_centers.timezone`, validada contra `pg_timezone_names`). Todo se guarda como `timestamptz`; la conversión a hora local se hace al presentar (`formatInCenterTimeZone`).
- **Alta de centros** sólo con `service_role` (onboarding). Los clientes no pueden crear ni borrar centros.

## Pruebas
`supabase/tests/*.test.sql` se ejecutan contra Postgres 16 con un stub mínimo de Supabase (roles `anon`/`authenticated`, `auth.uid()` y privilegios por defecto). En CI corren en un contenedor `postgres:16`.

## Pendiente
- Validar las políticas también contra la pila local de Supabase (`supabase start`) antes del primer despliegue a producción.
