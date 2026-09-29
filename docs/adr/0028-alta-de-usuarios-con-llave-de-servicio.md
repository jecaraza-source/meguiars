# ADR 0028 — Alta de usuarios: sesión primero, llave de servicio sólo para la cuenta

- Estado: aceptado
- Fecha: 2026-09-29

## Contexto

El admin corporativo necesita dar de alta usuarios con correo y contraseña desde la app. Supabase sólo permite crear cuentas con contraseña fijada por un tercero, o cambiarla, con la Auth Admin API, que exige la llave de servicio (sin RLS). Los roles ya se asignan por RPC con RLS y auditoría (F0.2).

## Decisión

1. **La llave de servicio sólo en el servidor web** (`server-only`, `SUPABASE_SERVICE_ROLE_KEY` en Vercel): nunca en móvil ni en el navegador. Móvil consulta usuarios; las altas se hacen en la web.
2. **Sesión primero.** Cada server action pregunta a la base, con la sesión del admin, si puede actuar (`public.can_admin_user`: admin_socio corporativo; la cuenta pertenece sólo a su organización). Sólo después usa la llave, y sólo para crear la cuenta o cambiar su contraseña.
3. **Todo lo demás con la sesión**: roles (`set_role_assignment`, `set_center_membership`) y desactivar/reactivar (`admin_set_user_disabled`), con motivo y bitácora. Si el rol inicial no se asigna, la cuenta recién creada se borra.
4. **Cuentas compartidas** entre organizaciones no se administran desde una sola organización (evita que un admin bloquee acceso ajeno).

## Consecuencias

- Una fuga de la llave permitiría crear cuentas; se mitiga manteniéndola sólo en Vercel Production y rotándola si se expone.
- El admin define la contraseña inicial y debe compartirla por un medio seguro; forzar el cambio en el primer inicio queda pendiente.
