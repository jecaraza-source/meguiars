# Administración / Usuarios (A1)

El admin corporativo da de alta a las personas con **correo (usuario) y contraseña**, les asigna roles por centro o corporativos, cambia contraseñas y desactiva o reactiva cuentas. Web: **Administración y Finanzas → Usuarios** (`/equipo/usuarios`, ficha en `/equipo/usuarios/[id]`). Móvil: **Usuarios** en consulta; las altas y contraseñas se hacen en la web. Decisiones en [ADR 0028](../adr/0028-alta-de-usuarios-con-llave-de-servicio.md).

## Qué se puede hacer

| Acción               | Cómo                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Alta                 | Nombre, correo, contraseña (mínimo 8, con confirmación) y acceso: admin corporativo o un rol en uno o más centros. Motivo obligatorio. |
| Cambiar contraseña   | Nueva contraseña con confirmación. La persona también puede cambiarla con “¿Olvidaste tu contraseña?”.                                 |
| Roles                | Asignar o cambiar el rol en un centro (uno por centro), hacer admin corporativo, o quitar un rol (queda inactivo). Motivo obligatorio. |
| Desactivar/Reactivar | Retira todo acceso por RLS y bloquea el login (`banned_until`). Motivo obligatorio. Nunca la propia cuenta.                            |

La cuenta se crea confirmada (sin correo de verificación). Si el acceso inicial no se puede asignar, el alta se deshace.

## Permisos

- Sólo el **admin_socio corporativo** de la organización (`public.can_admin_users`). Un admin_socio sólo de centro ve el aviso; los demás roles no ven la pantalla.
- Se administran sólo cuentas que pertenecen **únicamente** a la organización (`public.can_admin_user`); una cuenta con acceso en otra organización se ve pero su contraseña y estado no se tocan desde aquí.
- Roles con `set_role_assignment` / `set_center_membership` (RLS: el admin corporativo asigna cualquier rol en sus centros).

## Llave de servicio

Crear la cuenta y cambiar su contraseña requieren la Auth Admin API (`SUPABASE_SERVICE_ROLE_KEY`, sólo en el servidor web). Cada server action comprueba **primero con la sesión del admin** (`can_admin_user`) y después usa la llave; los roles y la desactivación van con la sesión (permisos y auditoría de la base). Sin la variable, la pantalla avisa y no da altas.

## Base de datos (20261019000000_user_admin.sql)

- `private.org_user_ids`, `private.user_in_other_org`.
- `public.can_admin_users(org)`, `public.can_admin_user(org, user)`.
- `public.org_users(org)`: usuarios con correo, nombre, estado, último acceso, roles corporativos y por centro.
- `public.admin_set_user_disabled(org, user, disabled, reason)`: usa `set_user_disabled` (perfil inactivo + login bloqueado) con bitácora.

## Pruebas

- `supabase/tests/user_admin.test.sql` (19): listado por organización, permisos (admin corporativo, admin de centro, encargado, anon), cuentas compartidas, desactivar/reactivar con motivo, no a sí mismo, bitácora.
- `packages/domain/src/users/users.test.ts`, `packages/validation/src/users.test.ts`, `packages/supabase/src/repositories/users.test.ts`.

## Pendiente

- Forzar el cambio de contraseña en el primer inicio de sesión.
- Alta desde la app móvil (necesitaría un endpoint del servidor web; la llave nunca va en el binario).
