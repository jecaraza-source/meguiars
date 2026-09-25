# ADR 0007 — CI/CD: un check requerido, un proyecto Supabase por ambiente y migraciones hacia adelante

- Estado: aceptado
- Fecha: 2026-09-27

## Contexto

Hay que integrar y desplegar web (Vercel), base de datos (Supabase) y móvil (Expo) de forma segura y simple. No debe haber secretos en el repo, un PR roto no debe poder mergearse y las migraciones deben llegar en el mismo orden a todos los ambientes.

## Decisión

1. **Un solo check requerido, `CI ok`,** que depende de todos los jobs de CI y falla si alguno no pasó. La protección de `main` no cambia cuando se agregan jobs, y una prueba verifica que ninguno quede fuera.
2. **Tres ambientes** (local, preview/staging y production), **con un proyecto Supabase por ambiente**. El ambiente se declara (`NEXT_PUBLIC_APP_ENV`/`VERCEL_ENV` y `EXPO_PUBLIC_APP_ENV`) y se muestra en la UI fuera de producción. Un build no local que apunta a un Supabase local falla.
3. **Migraciones inmutables y hacia adelante:** una migración aplicada no se edita; la versión nueva va después de la última de `main`, y los cambios siguen expand → migrate → contract. Se aplican con `supabase db push` desde GitHub Actions: staging automático, production con aprobación del environment.
4. **Vercel sólo para la web** (integración de Git, build reproducible con `npm ci` y Node fijo). **Móvil con EAS**, disparado a mano desde Actions; CI sólo compila el bundle.
5. **Secretos sólo en GitHub Environments, Vercel y EAS.** Los workflows tienen `permissions: contents: read` y una prueba busca secretos versionados.

## Alternativas descartadas

- **Supabase Branching** (una base por PR): más aislamiento, pero con costo por rama y más piezas. Se puede revisar cuando haya más de un desarrollador.
- **Aplicar migraciones desde Vercel en el build:** mezcla el deploy de la web con el de la base y expondría credenciales de base al build.
- **Rollback con migraciones `down`:** Supabase no las usa y dan una falsa seguridad con datos. Se compensa hacia adelante.
- **Acciones de terceros** (`supabase/setup-cli`, `expo/expo-github-action`): la CLI de Supabase ya está fijada en `package-lock.json` y `eas-cli` se ejecuta con `npx` en una versión fija. No se agregan dependencias.

## Consecuencias

- Configuración manual única: la protección de `main`, los GitHub Environments y sus secretos, el proyecto `meguiars-staging`, las variables por ambiente en Vercel y EAS, y `eas init`.
- Un PR cuyo código necesita una migración nueva se divide en dos (primero la migración) o espera a que la migración se apruebe en producción.
