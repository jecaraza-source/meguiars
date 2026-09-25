# ADR 0004 — Tenancy por organización, roles de centro y roles corporativos

- Estado: aceptado. Reemplaza el modelo de roles del ADR 0002.
- Fecha: 2026-09-23

## Contexto

Varios Detail Centers operan como centros de costos independientes bajo una organización, con vista corporativa consolidada. Los roles de negocio son admin_socio, encargado, operador_recepcion, contador y comercial_b2b.

## Decisión

1. `organizations` es la raíz de la tenencia. Cada centro pertenece a una organización y el código del centro es único dentro de ella.
2. **Dos fuentes de rol:** `user_detail_centers` (un rol por centro) y `role_assignments` (roles corporativos, válidos en todos los centros de la organización). El rol efectivo en un centro es la unión de ambas. Así se cubren el usuario de un solo centro, el de varios centros y el corporativo sin duplicar filas por centro.
3. **Un solo punto de autorización:** `private.center_roles` / `org_roles` y sus envoltorios `has_center_role` / `has_org_role`. Las políticas y las RPC `security invoker` sólo usan estos helpers.
4. **Soft-disable en cascada lógica:** `active = false` en la organización, el centro, el perfil o la asignación retira el acceso sin borrar historial.
5. **Deny-by-default:** RLS en todas las tablas, sin privilegios por defecto para `anon` ni `PUBLIC`, y una prueba que falla si una tabla de `public` no tiene RLS.
6. **Transición compatible:** en lugar de recrear el esquema, la migración renombra la tabla y convierte el enum con un mapeo explícito, y se prueba con datos del esquema anterior.

## Consecuencias

- `center_roles` se evalúa por fila en las políticas. Es suficiente para el volumen actual; si crece, se puede materializar en claims del JWT.
- Los triggers que deben saber quién es el cliente (`current_user = 'authenticated'`) **no** pueden ser `security definer`, porque dentro de una función así `current_user` es su dueño. Sus consultas privilegiadas van en helpers aparte (`org_has_active_admin`).
