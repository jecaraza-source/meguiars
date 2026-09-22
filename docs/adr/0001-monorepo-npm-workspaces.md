# ADR 0001 — Monorepo con npm workspaces y paquete core en TypeScript fuente

- Estado: aceptado
- Fecha: 2026-09-22

## Contexto
El stack exige web (Next.js) y móvil (Expo) con paridad de casos de uso y un paquete compartido de dominio, tipos, validaciones, cliente Supabase y KPIs.

## Decisión
- **npm workspaces** (`apps/*`, `packages/*`), sin Turborepo, Nx ni pnpm. Con tres paquetes no hace falta más, y así no agregamos herramientas.
- `@meguiars/core` se consume como **TypeScript fuente** (`exports` → `src/index.ts`), sin paso de build. Next lo transpila con `transpilePackages` y Metro/Expo lo resuelve de forma nativa en monorepos.
- **Una sola versión de React** en todo el repo, la que fija el SDK de Expo. Next.js 16 acepta cualquier React 19.x; si las versiones difieren, npm anida `next` bajo `apps/web` y rompe `eslint-config-next`.
- Dependencias de core: `zod` (validación compartida en cliente/servidor, sin dependencias transitivas) y `@supabase/supabase-js` (cliente oficial). `vitest` para pruebas unitarias.

## Consecuencias
- Si el tiempo de CI crece, podemos agregar Turborepo sin reestructurar nada.
- core no debe importar APIs específicas de plataforma (DOM, Node o React Native). Lo que sí las necesita (almacenamiento de sesión, por ejemplo) se inyecta desde cada app.
