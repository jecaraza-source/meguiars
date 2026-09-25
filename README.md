# Meguiar's Detail Center

Plataforma operativa para dos o más Detail Centers. Cada centro funciona como centro de costos y resultados independiente, y hay una vista corporativa consolidada. Tiene paridad web/móvil y el eje operacional es la Orden de Servicio.

```
apps/web              Next.js 16 + TypeScript (Vercel)
apps/mobile           Expo SDK 57 + React Native + TypeScript
packages/domain       entidades, reglas, textos, ViewState, puertos de repositorio
packages/validation   esquemas zod (entrada y variables de entorno)
packages/supabase     cliente tipado, tipos generados, adaptadores de repositorio
packages/analytics    definición y registro de KPIs
packages/ui-tokens    tokens, recetas y contratos de componentes (CSS web y StyleSheet)
supabase/             config local, migraciones, seed y pruebas SQL de RLS
docs/                 ADRs y documentación de módulos
```

Las reglas de arquitectura están en [AGENTS.md](AGENTS.md). Módulos: [Fundación](docs/modules/fundacion.md), [Multicentro y seguridad](docs/modules/multicentro-seguridad.md), [Auth y sesión](docs/modules/auth-sesion.md), [Design system y navegación](docs/modules/design-system.md), [CI/CD](docs/modules/ci-cd.md) y [Clientes y vehículos](docs/modules/clientes-vehiculos.md).

## Requisitos

- Node 22 (`.nvmrc`) y npm 10+
- Docker, sólo para `npm run db:start` (Supabase local)
- Binarios de Postgres 16+ (`psql` y `pg_ctl`), o una `DATABASE_URL`, para `npm run test:db`

## Arranque local

```bash
npm install
npm run db:start                                   # imprime la URL y la llave pública local
cp apps/web/.env.example apps/web/.env.local       # complétalo con esos valores
cp apps/mobile/.env.example apps/mobile/.env.local
npm run dev:web                                    # http://localhost:3000
npm run dev:mobile                                 # abre en Expo Go / simulador
```

Sin variables de entorno, las dos apps arrancan y muestran el estado "Supabase no está configurado". Para el login y la recuperación de contraseña, configura las URLs de Supabase Auth como indica [auth-sesion.md](docs/modules/auth-sesion.md#configuración-de-supabase-auth-dashboard).

## Comandos

| Comando                                     | Qué hace                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run check`                             | format:check, lint, typecheck, pruebas unitarias y build web (lo mismo que CI)       |
| `npm run lint` / `typecheck` / `test`       | cada verificación por separado, en todos los workspaces                              |
| `npm run format`                            | aplica Prettier                                                                      |
| `npm run test:db`                           | aplica las migraciones en un Postgres limpio, corre las pruebas RLS y valida el seed |
| `npm run db:start` / `db:stop` / `db:reset` | pila local de Supabase (`db:reset` recarga migraciones y seed)                       |
| `npm run db:types`                          | regenera `packages/supabase/src/database.types.ts` desde la base local               |
| `npm run build:web`                         | build de producción de Next.js                                                       |

## Variables de entorno

| Variable                        | App   | Descripción                                                          |
| ------------------------------- | ----- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | web   | URL del proyecto Supabase del ambiente                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web   | llave pública (anon o publishable)                                   |
| `NEXT_PUBLIC_SITE_URL`          | web   | URL pública, para el enlace de recuperación de contraseña            |
| `NEXT_PUBLIC_APP_ENV`           | web   | `local` \| `preview` \| `production` (en Vercel se usa `VERCEL_ENV`) |
| `EXPO_PUBLIC_SUPABASE_URL`      | móvil | URL del proyecto Supabase del ambiente                               |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | móvil | llave pública (anon o publishable)                                   |
| `EXPO_PUBLIC_APP_ENV`           | móvil | lo fija cada perfil de `eas.json`                                    |

Nunca se versionan archivos `.env*` salvo los `.env.example`. La llave `service_role` no se usa en ninguna app ni pipeline. Los secretos de los pipelines viven en GitHub Environments ([CI/CD](docs/modules/ci-cd.md#secretos)).

## Despliegue

Detalle completo, ambientes, secretos y rollback en [docs/modules/ci-cd.md](docs/modules/ci-cd.md).

| Pieza                        | Local                              | Preview / staging                                                 | Production                                                               |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **CI (GitHub Actions)**      | `npm run check`, `npm run test:db` | cada PR; el check requerido es **CI ok**                          | cada push a `main`                                                       |
| **Web (Vercel)**             | `npm run dev:web`                  | deploy de Preview por PR (`meguiars-web`, Root `apps/web`)        | deploy de Production al mergear a `main`; rollback con Instant Rollback  |
| **Base de datos (Supabase)** | `npm run db:start` / `db:reset`    | `supabase db push` automático a `meguiars-staging` al mergear     | `supabase db push` a `meguiars` tras aprobar el environment `production` |
| **Móvil (Expo/EAS)**         | `npm run dev:mobile`               | _Actions → Build móvil (EAS)_, perfil `preview` (APK/IPA interno) | perfil `production` y `eas submit` a las tiendas                         |

Las migraciones son sólo hacia adelante y compatibles con el código en producción (expand → migrate → contract). El seed es sólo para local y staging.
