# ADR 0001 — Monorepo con npm workspaces y paquetes en TypeScript fuente

- Estado: aceptado (revisado en F0.1)
- Fecha: 2026-09-22

## Contexto

El stack exige web (Next.js) y móvil (Expo) con paridad de casos de uso, además de paquetes compartidos de dominio, validación, cliente Supabase, KPIs y tokens de UI, sin duplicar lógica.

## Decisión

- **npm workspaces** (`apps/*`, `packages/*`), sin Turborepo, Nx ni pnpm: con siete workspaces no hace falta más.
- **Cinco paquetes** con dependencias en una sola dirección: `domain` ← `validation` ← `supabase`; `analytics` y `ui-tokens` son independientes. El `packages/core` inicial se dividió en estos cinco antes de fusionarse en `main`, así que ninguna interfaz publicada cambió.
- Los paquetes se consumen como **TypeScript fuente**, sin paso de build. Next usa `transpilePackages` y Metro los resuelve de forma nativa en monorepos.
- **Una sola versión de React** en todo el repo, la que fija el SDK de Expo. Si difieren, npm anida `next` bajo `apps/web` y rompe `eslint-config-next`.
- **Herramientas compartidas en la raíz:** `tsconfig.base.json`, `eslint.config.mjs` (paquetes y móvil) y `eslint.shared.mjs` (también lo importa web), `.prettierrc.json` y `vitest.config.ts` con un proyecto por paquete.
- **Aliases:** `@meguiars/*` entre workspaces y `@/*` dentro de cada app (paths de tsconfig; Next y Expo los soportan sin plugins).

## Dependencias agregadas y justificación

| Dependencia                                                    | Dónde      | Por qué                                                                                 |
| -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `zod`                                                          | validation | validación compartida cliente/servidor; sin dependencias transitivas                    |
| `@supabase/supabase-js`                                        | supabase   | cliente oficial                                                                         |
| `vitest`                                                       | raíz       | pruebas unitarias rápidas con soporte TS nativo y proyectos por paquete                 |
| `prettier`, `eslint-config-prettier`                           | raíz       | formato único; desactiva reglas de ESLint que chocan con Prettier                       |
| `typescript-eslint`, `@eslint/js`, `eslint-plugin-react-hooks` | raíz       | lint de TypeScript y hooks en paquetes y móvil (web usa `eslint-config-next`)           |
| `supabase` (CLI)                                               | raíz       | versión fija del CLI para `db:start`, `db:types` y `db push`                            |
| `server-only`                                                  | web        | impide que un módulo con acceso a datos del servidor termine en el bundle cliente       |
| `react-native-safe-area-context`                               | móvil      | reemplazo oficial de `SafeAreaView`, que está deprecado en RN 0.86; incluido en Expo Go |

## Consecuencias

- Si el tiempo de CI crece, podemos agregar Turborepo sin reestructurar.
- Ningún paquete puede importar APIs de plataforma (DOM, Node o React Native). Lo que las necesita, como el almacenamiento de sesión, se inyecta desde cada app.
