# Módulo F0.5 — CI/CD (GitHub, Vercel, Supabase y EAS)

## Alcance

Pipeline de integración y despliegue simple y sin secretos en el repo:

- CI en cada PR (formato, lint, typecheck, pruebas, build web, bundle móvil, migraciones desde cero en Postgres y en la imagen de Supabase), resumido en un solo check requerido: **CI ok**.
- Preview de la web en Vercel por PR, con un build reproducible.
- Migraciones versionadas con reglas automáticas y despliegue por ambiente.
- Tres ambientes: local/dev, preview/staging y production, con un aviso visible en web y móvil fuera de producción.
- Builds móviles con EAS; Vercel sólo aloja la web.
- Documentación de rollback y de manejo de secretos.

Este módulo no crea tablas: no hay migración nueva ni políticas RLS nuevas. Lo que sí hace es probar en CI que **todas** las migraciones se aplican desde cero, con sus políticas RLS.

## Ambientes

| Ambiente              | Web                                                   | Supabase                                                    | Móvil                                 | Aviso en la UI |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- | -------------- |
| **local / dev**       | `npm run dev:web`                                     | `npm run db:start` (Docker) con `seed.sql`                  | `npm run dev:mobile` (Expo Go)        | "Local"        |
| **preview / staging** | Vercel Preview: un deploy por PR y por push a la rama | proyecto **`meguiars-staging`** (por crear, ver abajo)      | EAS perfil `preview`: APK/IPA interno | "Preview"      |
| **production**        | Vercel Production (`main`)                            | proyecto **`meguiars`** (`skyztvfjrgdljgrxnruh`, us-east-1) | EAS perfil `production`: tiendas      | ninguno        |

**Cómo sabe la app en qué ambiente está** (`packages/domain/src/environment.ts`):

- **Web:** `NEXT_PUBLIC_APP_ENV` o, en Vercel, `VERCEL_ENV` (`development` → local, `preview` y `production`).
- **Móvil:** `EXPO_PUBLIC_APP_ENV`, que fija cada perfil de `eas.json`.
- **Sin valor:** `local`.
- **Valor desconocido:** el build falla, para no desplegar a ciegas.
- **Regla:** un build de preview o production que apunte a un Supabase local (`localhost`, `127.0.0.1`, `10.0.2.2`) **falla**: en la web, el build (`next.config.ts`); en móvil, al abrir la app. Casi siempre es un `.env` copiado por error.

### Un proyecto Supabase por ambiente (estrategia adoptada)

Cada ambiente usa su propio proyecto. Las ventajas:

- las llaves son independientes;
- un error en preview nunca toca datos reales;
- las migraciones se prueban en staging antes de llegar a producción.

Crear staging:

1. En la organización TCI, crea el proyecto **`meguiars-staging`** en `us-east-1` (Postgres 17, igual que producción).
2. **Base de datos:** corre el workflow _Migraciones Supabase_ con `staging` (Actions → Run workflow). Aplica todas las migraciones desde cero. Para datos de prueba, ejecuta `supabase/seed.sql` en el SQL Editor de staging, **nunca en producción**.
3. **Supabase Auth de staging:**
   - Site URL: la URL de preview de Vercel;
   - Redirect URLs: `https://*-<equipo>.vercel.app/auth/confirm` y `meguiars://auth/confirm`;
   - contraseña mínima de 8 caracteres.
4. **Vercel:** en _Settings → Environment Variables_, define `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` **sólo para Preview**, con los valores de staging.
5. **EAS:** en el ambiente `preview`, carga las mismas variables con el prefijo `EXPO_PUBLIC_` (ver [Móvil](#móvil-eas)).

**Mientras staging no exista:**

- no definas variables de Supabase para Preview en Vercel. El preview muestra "Supabase no está configurado", pero nunca toca datos reales;
- el despliegue automático a staging sólo deja un aviso;
- producción se aplica a mano.

## Integración continua (`.github/workflows/ci.yml`)

Corre en cada PR y en cada push a `main`. No usa secretos.

| Job          | Qué verifica                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks`     | `format:check`, `lint`, `typecheck`, `npm test` (unitarias y guardas del pipeline) y `build:web` con Node de `.nvmrc`                                             |
| `migrations` | reglas de migraciones contra la rama base (`scripts/check-migrations.mjs`)                                                                                        |
| `database`   | `npm run test:db`: todas las migraciones **desde cero** en Postgres 17 limpio, pruebas de RLS y RPC, seed y prueba de actualización con datos                     |
| `supabase`   | `supabase db start`: migraciones y seed en la **imagen oficial de Supabase** (con los esquemas `auth` y `storage` reales), más `supabase db lint` (plpgsql_check) |
| `mobile`     | `expo export` de Android e iOS: el bundle de JS compila igual que en EAS                                                                                          |
| **`ci-ok`**  | espera a todos los jobs y **falla si alguno falló, se canceló o se omitió**                                                                                       |

`scripts/repo-guards.test.mjs` (dentro de `npm test`) comprueba lo siguiente:

- `ci-ok` depende de **todos** los jobs. Si agregas un job y olvidas incluirlo en `ci-ok`, CI falla;
- cada workflow declara `permissions: contents: read` y lee las variables sensibles sólo con `${{ secrets.* }}`;
- ningún archivo versionado contiene secretos: llaves `sb_secret_`, tokens `sbp_`/`ghp_`, JWT, llaves privadas ni asignaciones de `*_TOKEN`/`*_PASSWORD`;
- Vercel instala con `npm ci` y usa Node `22.x`, igual que `.nvmrc`.

### Protección de `main` (configuración única en GitHub)

_Settings → Branches → Add rule_ (o _Rulesets_) para `main`:

- **Require a pull request before merging.** Recomendado: 1 aprobación cuando haya más de una persona en el equipo.
- **Require status checks to pass:** **`CI ok`**, más **`Vercel`** si quieres que el preview también bloquee. Marca _Require branches to be up to date_.
- **Require conversation resolution before merging.**
- **Block force pushes** y **Restrict deletions**.
- _Settings → General → Pull Requests:_ permite sólo **Squash merging** y activa _Automatically delete head branches_.

Con esto, **un PR con algún job en rojo no se puede mergear**: `CI ok` queda en rojo o pendiente. La plantilla `.github/pull_request_template.md` agrega la lista de verificación de las reglas del proyecto (AGENTS.md).

## Preview web en Vercel

- **Proyecto:** `meguiars-web`, con _Root Directory_ `apps/web`. La integración de Git crea un deploy de Preview por cada push a un PR y uno de Production por cada merge a `main`.
- **Build reproducible:**
  - `apps/web/vercel.json` instala con `cd ../.. && npm ci`, es decir, el workspace completo con **exactamente** `package-lock.json`;
  - `apps/web/package.json` fija `engines.node` en `22.x`, el mismo major que `.nvmrc` y CI;
  - el build no depende de variables de entorno: sin Supabase muestra el estado "sin configurar";
  - el mismo commit produce el mismo resultado en CI (`npm run build:web`) y en Vercel.
- **Variables por ambiente** (Vercel → Settings → Environment Variables):

| Variable                        | Production                        | Preview                      | Development (local) |
| ------------------------------- | --------------------------------- | ---------------------------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL de `meguiars`                 | URL de `meguiars-staging`    | `.env.local`        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | llave publishable de `meguiars`   | llave publishable de staging | `.env.local`        |
| `NEXT_PUBLIC_SITE_URL`          | `https://meguiars-web.vercel.app` | (vacío: usa el origen)       | —                   |
| `NEXT_PUBLIC_APP_ENV`           | (vacío: usa `VERCEL_ENV`)         | (vacío)                      | `local` (opcional)  |

## Migraciones versionadas

- **Formato:** `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`, compatible con `supabase db push`.
- **Reglas** (`scripts/check-migrations.mjs`, en CI y antes de cada despliegue):
  1. nombre con el formato anterior y versión única;
  2. **una migración que ya está en `main` no se edita, renombra ni borra**, porque ya pudo aplicarse en staging o producción. El cambio va en una migración nueva;
  3. una migración nueva lleva una versión **mayor** que la última de `main`, para que todos los ambientes las apliquen en el mismo orden. Si `main` avanzó, renombra la tuya con una fecha nueva.
- **Desde cero:** los jobs `database` y `supabase` aplican todas las migraciones a una base limpia en cada PR.

### Aplicación por ambiente (`.github/workflows/deploy-db.yml`)

| Ambiente   | Cuándo                                                                                                         | Cómo                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| local      | cuando quieras                                                                                                 | `npm run db:reset` (migraciones y seed) o `npm run test:db` |
| staging    | **automático** tras un merge a `main` que cambie `supabase/migrations/**`                                      | `supabase db push` (sólo las pendientes y **sin seed**)     |
| production | después de staging, **espera la aprobación** del environment `production`; también a mano desde _Run workflow_ | `supabase db push`                                          |

Cada ejecución hace, en orden: validación de reglas → `supabase link` → `db push --dry-run`, que lista lo que va a aplicar → `db push` → `migration list`. Hay concurrencia de uno por ambiente y nunca se cancela una ejecución en curso.

**Compatibilidad hacia atrás (expand → migrate → contract):** Vercel publica el código de producción al hacer merge, y la migración de producción se aplica cuando alguien la aprueba. Por eso:

- una migración debe funcionar con el código que **ya** está en producción: agregar columnas o funciones sí; renombrar o borrar no;
- si el código nuevo **necesita** la migración, la migración va primero, en su propio PR, se aplica en producción y después se mergea el código;
- borrar lo viejo (_contract_) va en un PR posterior;
- cualquier transición de datos lleva `supabase/tests/upgrade/<migración>.{before,after}.sql`.

Después de cada migración en producción, revisa los asesores de Supabase (_Advisors_ o `get_advisors`) y regenera los tipos (`npm run db:types`) si todavía no están en el PR.

## Móvil (EAS)

Vercel no distribuye la app móvil. Los binarios se construyen con **EAS Build**, sin dependencias npm nuevas: `eas-cli` se ejecuta con `npx` y en una versión fija en el workflow.

- **`apps/mobile/eas.json`:**
  - `preview`: distribución interna, APK en Android, ambiente EAS `preview` y `EXPO_PUBLIC_APP_ENV=preview`;
  - `production`: tiendas, `autoIncrement` de la versión de build y `EXPO_PUBLIC_APP_ENV=production`;
  - `appVersionSource: remote`: EAS lleva el contador de builds.
- **Identificadores:** `com.meguiars.detailcenter` para iOS (`bundleIdentifier`) y Android (`package`). No se pueden cambiar después de publicar en las tiendas.
- **Variables de Supabase:** en **EAS Environment Variables** (`expo.dev` → proyecto → Environment variables), con visibilidad _Plain text_ porque son públicas:
  - `preview`: `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` de staging;
  - `production`: las de `meguiars`.
- **En CI:** el job `mobile` compila el bundle en cada PR. Los builds firmados se piden a mano: _Actions → Build móvil (EAS) → Run workflow_ con perfil y plataforma. `production` sólo se permite desde `main` y usa el environment `production`, que requiere aprobación.

Configuración inicial (una vez):

```bash
cd apps/mobile
npx eas-cli@24.8.0 login
npx eas-cli@24.8.0 init            # crea el proyecto en expo.dev y agrega extra.eas.projectId a app.json (commitéalo)
npx eas-cli@24.8.0 credentials     # llaves de firma (EAS las guarda)
npx eas-cli@24.8.0 env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<staging>.supabase.co --visibility plaintext
# … lo mismo para EXPO_PUBLIC_SUPABASE_ANON_KEY y para el ambiente production
```

Después crea un _access token_ en expo.dev (_Account settings → Access tokens_) y guárdalo como secret `EXPO_TOKEN` en los GitHub Environments `staging` y `production`.

Publicar en tiendas: `npx eas-cli@24.8.0 submit --profile production --platform android|ios` (requiere las cuentas de Google Play y App Store Connect).

## Secretos

| Secreto                     | Dónde vive                                                                        | Quién lo usa                 |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| `SUPABASE_ACCESS_TOKEN`     | GitHub → Settings → Environments → `staging` / `production` → Secrets             | `supabase link` en deploy-db |
| `SUPABASE_DB_PASSWORD`      | ídem, **una por ambiente** (la de la base de ese proyecto)                        | `supabase db push`           |
| `SUPABASE_PROJECT_REF`      | ídem, como **Variable** (no es secreta)                                           | deploy-db                    |
| `EXPO_TOKEN`                | ídem, en los dos environments                                                     | mobile-build                 |
| llave `service_role`/secret | **sólo** en el dashboard de Supabase; ningún pipeline ni app la usa               | nadie                        |
| llaves publishable (anon)   | Vercel (por ambiente), EAS (por ambiente) y `.env.local`; son públicas por diseño | apps                         |

Configura en GitHub **Environments**:

- `staging` sin reglas;
- `production` con **Required reviewers**, al menos tú, y _Deployment branches_ = `main`.

Reglas:

- Nunca se versiona un `.env` salvo los `.env.example`. Lo impiden `.gitignore` y la guarda de secretos.
- Los workflows no imprimen secretos: GitHub los enmascara y ningún paso hace `echo` de ellos.
- **Rotación:** si un secreto se expone, revócalo en el origen (Supabase → Access Tokens o _Database password_, expo.dev → tokens), crea uno nuevo, actualízalo en GitHub y vuelve a correr el workflow. Si la llave `service_role` se filtra, rótala en _Project Settings → API Keys_.
- Los PRs desde forks no reciben secretos (comportamiento de GitHub), y CI no los necesita.

## Rollback

| Qué                         | Cómo                                                                                                                                                                                                                                                | Tiempo     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Web**                     | Vercel → Deployments → el deploy de producción anterior → **Instant Rollback** (o `vercel rollback`). Después, un PR que revierta el commit (`git revert`) para que `main` refleje lo publicado.                                                    | segundos   |
| **Base de datos (esquema)** | **Hacia adelante:** una migración nueva que compense (p. ej. recrear la función anterior). Nunca se borra ni edita una migración aplicada ni se toca `schema_migrations` a mano. Gracias a expand/contract, casi siempre basta con revertir la web. | minutos    |
| **Base de datos (datos)**   | Supabase → Database → **Backups**: diarios en el plan Pro; PITR es un add-on. Restaurar reemplaza **toda** la base, así que es último recurso. Para errores acotados, corrige con una migración o RPC auditada.                                     | horas      |
| **Móvil**                   | Distribución interna: instala el build anterior desde expo.dev. Tiendas: detén el _staged/phased rollout_ y publica un build con la versión corregida. (EAS Update para revertir JS por OTA queda pendiente; requiere `expo-updates`.)              | horas–días |

## Variables de entorno

| Variable                                                                              | Dónde               | Nota                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_ENV`                                                                 | web                 | **nueva**, opcional: `local` \| `preview` \| `production`. En Vercel se usa `VERCEL_ENV` |
| `EXPO_PUBLIC_APP_ENV`                                                                 | móvil               | **nueva**; la fija `eas.json` por perfil (en Expo Go queda `local`)                      |
| `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_SITE_URL`                                      | web                 | sin cambios; ahora un valor por ambiente                                                 |
| `EXPO_PUBLIC_SUPABASE_*`                                                              | móvil               | sin cambios; en EAS Environment Variables por ambiente                                   |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `EXPO_TOKEN` | GitHub Environments | sólo para los pipelines; nunca en el repo                                                |

## Pruebas

- `packages/domain/src/environment.test.ts`: resolución del ambiente, aviso por ambiente y la regla "preview/production sin Supabase local".
- `scripts/check-migrations.test.mjs`: formato, versiones únicas, migraciones inmutables y orden respecto de la base, y que las migraciones del repo cumplen las reglas.
- `scripts/repo-guards.test.mjs`: que `ci-ok` cubra todos los jobs, permisos mínimos y secretos sólo por `secrets.*`, que no haya secretos versionados y que el build de Vercel sea reproducible.
- Los workflows se revisan con `actionlint`.
