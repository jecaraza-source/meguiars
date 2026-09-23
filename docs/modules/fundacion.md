# Módulo F0 — Fundación / Monorepo

> El modelo de roles y membresías de este módulo evolucionó en F0.2: organizaciones, roles admin_socio/encargado/operador_recepcion/contador/comercial_b2b y `user_detail_centers`. Ver [multicentro-seguridad.md](multicentro-seguridad.md). Esta página describe el estado de F0.1.

## Alcance

Estructura del monorepo, herramientas compartidas, base multicentro (centros, membresías con rol, perfiles, auditoría) con RLS, patrón de repositorio y el caso de uso mínimo **"Mis centros"** implementado igual en web y móvil. No incluye tablas de negocio (órdenes de servicio, clientes B2C/B2B, membresías comerciales); llegan en los módulos siguientes.

## Modelo de datos

| Tabla                | Propósito                                          | Escritura desde clientes                                                    |
| -------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `detail_centers`     | centro de costos y resultados, con `timezone` IANA | sólo `update_detail_center` (owner/admin)                                   |
| `center_memberships` | usuario ↔ centro ↔ rol (`app_role`)                | sólo `set_center_membership` (owner/admin; `owner` sólo lo otorga un owner) |
| `profiles`           | nombre del usuario (se crea al registrarse)        | el propio usuario (lo ven también sus compañeros de centro)                 |
| `audit_log`          | bitácora de cambios sensibles                      | ninguna (sólo triggers)                                                     |

La **vista corporativa consolidada** se obtiene hoy con membresías en todos los centros: RLS devuelve la unión de los centros del usuario, y los KPIs declaran `scopes: ["center", "corporate"]`.

## Caso de uso "Mis centros"

- Web: `apps/web/src/lib/centers.ts` → `src/app/page.tsx` (con `loading.tsx`).
- Móvil: `apps/mobile/src/lib/centers.ts` → `src/screens/CentersScreen.tsx`.
- Ambas llaman `createDetailCenterRepository(client).listVisible()` y renderizan el mismo `ViewState` con los textos de `centersCopy`. La hora local de cada centro se calcula con `formatInCenterTimeZone`.

## Criterios de aceptación y cómo se verificaron

| Criterio             | Verificación                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| instalación limpia   | `rm -rf node_modules && npm ci` sin errores                                                                 |
| web y móvil arrancan | `npm run dev:web` responde 200; `expo start` sirve el bundle iOS; `expo export --platform android` completa |
| lint + typecheck     | `npm run lint`, `npm run typecheck` en los 7 workspaces                                                     |
| build web            | `npm run build:web`                                                                                         |
| imports compartidos  | el bundle móvil contiene `domain`, `validation`, `supabase` y `ui-tokens`; web los renderiza en SSR         |
| sin secretos         | búsqueda de patrones de llaves en archivos versionados; `.env*` ignorados salvo `.env.example`              |
| RLS                  | `npm run test:db`: 34 aserciones (aislamiento por centro, roles, último owner, RPC, auditoría, anon)        |

## Supuestos

- Un usuario puede pertenecer a varios centros con roles distintos; la vista corporativa es la unión de sus centros.
- B2C, membresías comerciales y B2B se modelarán como entidades con `detail_center_id` en módulos posteriores.
- La zona horaria por defecto es `America/Mexico_City`.

## Pendientes

- Módulo de Auth: sesión con cookies (`@supabase/ssr`) en web y SecureStore en móvil. Hoy ambas apps consultan sin sesión y muestran "permiso denegado".
- Regenerar `database.types.ts` con `npm run db:types` contra la pila local. La versión actual se escribió con el formato del CLI; `schema-parity.test.ts` protege roles y RPC.
- Correr `npm run test:db` también contra `supabase start` (Postgres 17 con extensiones reales) antes del primer despliegue.
- Rol o vista corporativa explícita si se necesita acceso consolidado sin membresía por centro.
