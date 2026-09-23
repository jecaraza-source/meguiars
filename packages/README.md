# Paquetes compartidos

Todos se publican como TypeScript fuente (`exports` → `src/index.ts`). Web los transpila con `transpilePackages` y Metro los resuelve de forma nativa.

| Paquete                | Depende de                      | Contenido                                                                                                                                                                                                   |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@meguiars/domain`     | —                               | entidades (`DetailCenter`), roles y `canAssignRole`, reglas de fecha (UTC → zona del centro), `Result`/`RepoError`, `ViewState`, textos compartidos y **puertos** de repositorio (`DetailCenterRepository`) |
| `@meguiars/validation` | domain, zod                     | esquemas de entrada (centro, membresía, motivo) y `parseSupabasePublicEnv`                                                                                                                                  |
| `@meguiars/supabase`   | domain, validation, supabase-js | `createMeguiarsClient`, `database.types.ts` (generado), `toRepoError`, **adaptadores** (`createDetailCenterRepository`)                                                                                     |
| `@meguiars/analytics`  | —                               | `defineKpi` y `kpiRegistry`: cada KPI tiene un id único, su fórmula, su fuente, su unidad y su nivel (centro o corporativo)                                                                                 |
| `@meguiars/ui-tokens`  | —                               | `colors`, `space`, `radius`, `fontSize`, `fontWeight` y `toCssVariables()`                                                                                                                                  |

Reglas:

- `domain` no depende de ningún otro paquete ni de ninguna plataforma.
- Las apps importan puertos de `domain` y adaptadores de `supabase`; nunca llaman a `supabase-js` directamente.
- Cada paquete tiene `lint`, `typecheck` y `test`. `npm test` en la raíz corre todos con Vitest.
