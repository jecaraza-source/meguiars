# Módulo F0.3 — Autenticación, roles y sesión web/móvil

## Alcance

Login, logout, recuperación de contraseña, sesión persistente con refresco automático, selección del centro activo, guards por rol, perfil y centro activo visibles, y manejo de cuentas deshabilitadas, con paridad web/móvil. Usa Supabase Auth y las tablas de F0.2.

## Flujo de sesión

```
login ──► profiles.active? ──no──► "Cuenta deshabilitada" (+ cierre de sesión)
            │ sí
            ▼
     my_detail_centers ──► centros utilizables (activos y con rol)
            │  0 ──► "Sin centros"
            │  1 ──► se activa solo
            │  >1 ─► último centro del perfil si sigue válido; si no, "Elige un centro"
            ▼
         Inicio (centro activo) ──► guards por pantalla (SCREEN_GUARDS)
```

- **Centro activo:** `profiles.last_detail_center_id`, compartido por web y móvil. Sólo cambia con la RPC `set_active_center`, que exige acceso al centro, y se valida en cada carga (`resolveActiveCenterId`).
- **Guards** (`packages/domain/src/auth/guards.ts`): la misma tabla para web (rutas) y móvil (pantallas).

  | Pantalla                  | Requiere                                          | Si no se cumple                                   |
  | ------------------------- | ------------------------------------------------- | ------------------------------------------------- |
  | `home`                    | centro activo                                     | elegir centro / sin centros                       |
  | `team`                    | `members.read` (admin_socio, encargado, contador) | sin permiso                                       |
  | `editCenter`              | `center.manage` (admin_socio)                     | acción oculta; el servidor responde "sin permiso" |
  | `selectCenter`, `account` | sesión                                            | login                                             |

- **UI vs. RLS:** la UI oculta lo que el rol no permite (`canInActiveCenter`), pero la autorización real es RLS. `update_detail_center` y `listCenterMembers` fallan en la base de datos para un rol sin permiso (`rls_multicenter.test.sql`).

## Web (Next.js 16)

- **Sesión:** `@supabase/ssr` con cookies **httpOnly**, `SameSite=Lax` y `Secure` en producción. No hay cliente Supabase en el navegador, así que JavaScript no puede leer los tokens.
- **`src/proxy.ts`:** refresca el token en cada petición (`getClaims`) y hace un chequeo optimista: sin sesión, redirige a `/login?next=…`.
- **`src/lib/auth/dal.ts`:** `getAuthState()` valida con Supabase Auth (`getUser`) una vez por petición, y `requireScreen()` aplica el guard y redirige.
- **Server Actions** (`src/app/actions/auth.ts`): login, recuperación, nueva contraseña, logout, cambio de centro y edición de centro. Validan con zod en el servidor y usan el centro activo del servidor, nunca uno enviado por el cliente.
- **Rutas:** `/login`, `/recuperar`, `/auth/confirm` (canjea el enlace PKCE `?code=` o `?token_hash=`), `/restablecer`, `/seleccionar-centro`, `/`, `/equipo`, `/sin-centros`, `/sin-permiso` y `/cuenta-deshabilitada`. `?next=` sólo acepta rutas internas, para evitar redirecciones abiertas.

## Móvil (Expo)

- **Sesión:** en `expo-secure-store` (Keychain/Keystore, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), mediante `createChunkedSecureStorage`. SecureStore limita cada valor a unos 2 KB, así que la sesión se guarda en fragmentos, todos en el almacén seguro.
- **Refresco:** `autoRefreshToken` activo sólo en primer plano (`AppState`: `startAutoRefresh`/`stopAutoRefresh`). Si el refresco falla, Supabase emite `SIGNED_OUT` y la app vuelve al login.
- **Recuperación:** el enlace vuelve a `meguiars://auth/confirm?code=…` (PKCE). `AuthProvider` lo canjea y muestra "Nueva contraseña".
- **Navegación:** `src/navigation/Router.tsx` aplica los mismos guards. Al cambiar de centro, las pantallas se montan de nuevo con `key = centro activo`, así que no conservan datos del centro anterior.

## Base de datos (`20260926000000_auth_session.sql`)

| Objeto                                      | Quién                 | Qué hace                                                                                                                                   |
| ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles.last_detail_center_id`            | —                     | centro activo (FK con `on delete set null`)                                                                                                |
| `set_active_center(center)`                 | authenticated         | valida `has_center_role` y guarda el centro; `42501` si es ajeno o está deshabilitado                                                      |
| `set_user_disabled(user, disabled, reason)` | **sólo service_role** | `profiles.active`, `auth.users.banned_until = infinity` (bloquea login y refresco) y evento `user.disabled`/`user.enabled` en la auditoría |

Una sesión ya emitida de un usuario deshabilitado pierde el acceso a los datos de inmediato, por RLS (`is_active_user`). Como `banned_until` impide renovarla, se cierra al expirar el token.

## Configuración de Supabase Auth (dashboard)

_Authentication → URL Configuration_:

- **Site URL:** `https://meguiars-web.vercel.app` (o tu dominio).
- **Redirect URLs:** `https://meguiars-web.vercel.app/auth/confirm`, `http://localhost:3000/auth/confirm` y `meguiars://auth/confirm`. Para Expo Go, agrega también la URL `exp://…/--/auth/confirm` que muestra la consola.

_Authentication → Providers → Email_: longitud mínima de contraseña **8**, la misma que valida la app.

## Variables de entorno

| Variable                                                    | App   | Nota                                                                                              |
| ----------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web   | ya existían                                                                                       |
| `NEXT_PUBLIC_SITE_URL`                                      | web   | **nueva**; URL pública para el enlace de recuperación (si falta, se usa el origen de la petición) |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | móvil | ya existían                                                                                       |

## Pruebas

- **SQL** (`supabase/tests/auth_session.test.sql`): 17 aserciones de centro activo y cuentas deshabilitadas.
- **Unitarias:**
  - guards y centro activo (`domain/src/auth/auth.test.ts`);
  - deep links (`links.test.ts`);
  - validaciones de formularios;
  - almacenamiento por fragmentos (`storage.test.ts`);
  - servicio de sesión (`supabase/src/auth.test.ts`).
- **E2E web** (Playwright contra un servidor falso con el formato de GoTrue y PostgREST, fuera del repo): 17 comprobaciones que cubren login, sesión persistente, cookies httpOnly, cambio de centro sin mezclar datos, guards por rol, edición con motivo, cuenta deshabilitada, recuperación y logout.

## Supuestos

- El registro abierto (sign up) no forma parte de este módulo: los usuarios los crea un administrador (dashboard o `service_role`).
- La navegación móvil es un router mínimo por estado, no Expo Router (ver ADR 0005).
