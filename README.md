# Meguiar's Detail Center

Plataforma operativa para dos o más Detail Centers. Cada centro funciona como centro de costos y resultados independiente, y hay una vista corporativa consolidada. Tiene paridad web/móvil y el eje operacional es la Orden de Servicio.

```
apps/web              Next.js 16 + TypeScript (Vercel)
apps/mobile           Expo SDK 57 + React Native + TypeScript
packages/domain       entidades, reglas, textos, ViewState, puertos de repositorio
packages/validation   esquemas zod (entrada y variables de entorno)
packages/supabase     cliente tipado, tipos generados, adaptadores de repositorio
packages/analytics    definición y registro de KPIs
packages/ui-tokens    design tokens para CSS y StyleSheet
supabase/             config local, migraciones, seed y pruebas SQL de RLS
docs/                 ADRs y documentación de módulos
```

Las reglas de arquitectura están en [AGENTS.md](AGENTS.md). Módulos: [Fundación](docs/modules/fundacion.md), [Multicentro y seguridad](docs/modules/multicentro-seguridad.md) y [Auth y sesión](docs/modules/auth-sesion.md).

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

| Variable                        | App   | Descripción                        |
| ------------------------------- | ----- | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | web   | URL del proyecto Supabase          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web   | llave pública (anon o publishable) |
| `EXPO_PUBLIC_SUPABASE_URL`      | móvil | URL del proyecto Supabase          |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | móvil | llave pública (anon o publishable) |

Nunca se versionan archivos `.env*` salvo los `.env.example`. La llave `service_role` no se usa en ninguna app.

## Despliegue

- **Base de datos:** `npx supabase link --project-ref <ref>` y luego `npx supabase db push`. El seed es sólo para desarrollo.
- **Web (Vercel):** importa el repo con _Root Directory_ = `apps/web` (tiene su propio `vercel.json`). Vercel instala desde la raíz del workspace. Define las variables `NEXT_PUBLIC_SUPABASE_*`.
- **Móvil:** EAS (`npx eas-cli@latest build`), con las variables `EXPO_PUBLIC_SUPABASE_*` en el perfil de EAS.
