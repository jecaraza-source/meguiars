# ADR 0005 — Sesión y autorización en web y móvil

- Estado: aceptado
- Fecha: 2026-09-26

## Decisión

1. **Web:** sesión en cookies **httpOnly** con `@supabase/ssr`, gestionada sólo en el servidor (Server Components, Server Actions y Route Handlers). No hay cliente Supabase en el navegador.
   - `proxy.ts` refresca la sesión y hace chequeos optimistas.
   - La autorización real está en la capa de acceso a datos (`lib/auth/dal.ts`), que valida con `getUser` en cada petición, y en RLS. Así lo recomienda la guía de autenticación de Next 16.
2. **Móvil:** sesión en `expo-secure-store` en fragmentos (`createChunkedSecureStorage`, unos 1800 caracteres cada uno), porque SecureStore limita cada valor a unos 2 KB.
   - Se descartó la alternativa habitual (clave AES en SecureStore y datos cifrados en AsyncStorage) porque agrega 2 o 3 dependencias y criptografía propia.
3. **Guards compartidos:** `SCREEN_GUARDS` y `evaluateGuard` en `@meguiars/domain`. Web y móvil sólo traducen el resultado a su navegación.
4. **Centro activo en el servidor** (`profiles.last_detail_center_id` + RPC `set_active_center`), no en almacenamiento local: es el mismo en todos los dispositivos, y el servidor valida el acceso.
5. **Cuenta deshabilitada:** `profiles.active` corta el acceso por RLS de inmediato, y `auth.users.banned_until` impide nuevos logins y refrescos. Ambos se cambian en una sola RPC, que sólo puede ejecutar `service_role`.
6. **Navegación móvil por estado, sin Expo Router, por ahora.** El módulo tiene 7 pantallas sin anidación; Expo Router agregaría `expo-router` y sus dependencias nativas (screens, linking, etc.). Se adoptará cuando un módulo requiera navegación anidada o rutas profundas, conservando `SCREEN_GUARDS`.

## Dependencias nuevas

| Dependencia         | Dónde | Por qué                                                   |
| ------------------- | ----- | --------------------------------------------------------- |
| `@supabase/ssr`     | web   | cliente oficial de Supabase para SSR con cookies          |
| `expo-secure-store` | móvil | almacenamiento seguro oficial de Expo (Keychain/Keystore) |
