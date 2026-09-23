# Guardrail del proyecto — Meguiar's Detail Center

Actúa como arquitecto senior y programador full stack responsable de un sistema productivo para Meguiar's Detail Center. Trabaja sobre el repositorio existente y respeta su arquitectura antes de crear archivos nuevos.

## Stack obligatorio

- GitHub para control de versiones, ramas y pull requests.
- Next.js + TypeScript para web, desplegable en Vercel (`apps/web`).
- React Native + Expo + TypeScript para aplicación móvil (`apps/mobile`).
- Supabase para PostgreSQL, Auth, RLS, Storage y funciones de backend cuando sean necesarias (`supabase/`).
- Un monorepo con paquetes compartidos para dominio, tipos, validaciones, cliente Supabase y definición de KPIs (`packages/domain`, `validation`, `supabase`, `analytics`, `ui-tokens`).

## Reglas de arquitectura

1. Multicentro: toda entidad transaccional debe identificar `detail_center_id` cuando aplique.
2. Seguridad: implementar Row Level Security real en Supabase. Nunca confiar sólo en permisos de UI.
3. Paridad web/móvil: implementar el mismo caso de uso en ambas aplicaciones; compartir dominio, validaciones y acceso a datos. La UI puede ser específica por plataforma.
4. Auditoría: cualquier cambio sensible debe dejar actor, fecha, valor anterior/nuevo y motivo cuando aplique.
5. La Orden de Servicio es el eje operacional.
6. Evitar sobreingeniería: entregar la solución mínima productiva y extensible.
7. No introducir dependencias nuevas sin justificar utilidad, mantenimiento y compatibilidad.
8. No romper interfaces existentes; si una migración es incompatible, proponer plan de transición.
9. Toda fórmula de KPI debe tener definición única, fuente de datos y pruebas.
10. Todas las fechas se almacenan en UTC y se presentan en zona horaria configurada del centro.

## Calidad

- TypeScript strict.
- Validación de entrada en frontera cliente/servidor.
- Manejo explícito de loading/empty/error/permission denied.
- Pruebas unitarias para reglas de negocio y SQL/integración para RLS y KPIs críticos.
- Lint, typecheck y tests en CI.
- README del módulo y ADR cuando exista una decisión arquitectónica relevante.

## Forma de trabajo

Antes de programar: inspecciona el repositorio, resume lo existente, identifica dependencias y propone un plan breve. Luego implementa en commits lógicos. Al terminar entrega: archivos modificados, migraciones, variables de entorno, pruebas ejecutadas, instrucciones de despliegue, riesgos y deuda técnica. No declares terminado algo que no hayas validado.

## Cómo aplicar estas reglas en este repo

- **Dónde va cada cosa** (ver `packages/README.md`): entidades, reglas, textos compartidos y puertos de repositorio en `domain`; esquemas zod en `validation`; adaptadores Supabase y tipos generados en `supabase`; KPIs en `analytics`; colores/espacios en `ui-tokens`. Las apps sólo tienen UI y composición.
- **Paridad:** cada caso de uso tiene un `src/lib/<caso>.ts` en web y en móvil que llama al mismo repositorio y devuelve un `ViewState` de `domain`. Los textos salen de `domain` para que ambas UIs digan lo mismo.
- **Mutaciones sensibles:** siempre por RPC `security invoker` que valida y llama `private.set_change_reason(p_reason)`. El trigger `private.require_change_reason()` bloquea escrituras directas sin motivo. La autorización sigue en RLS con `private.has_center_role(...)`.
- **Auditoría:** agrega `create trigger <tabla>_audit ... execute function private.audit_row()` y `<tabla>_require_reason` a cada tabla sensible.
- **Migraciones:** cada una lleva pruebas en `supabase/tests/*.test.sql` (`npm run test:db`). Después regenera los tipos (`npm run db:types`); `schema-parity.test.ts` falla si los roles o las RPC de TS y SQL divergen.
- **KPIs:** decláralos con `defineKpi` en `packages/analytics`, regístralos en `kpiRegistry` y agrega su prueba.
- **Dependencias móviles:** `npx expo install <paquete>` dentro de `apps/mobile` (sin red a api.expo.dev: usa la versión de `node_modules/expo/bundledNativeModules.json`). React se mantiene en la versión que fija Expo en todo el repo.
- Lee también `apps/web/AGENTS.md` (Next.js 16: p. ej. `export const dynamic` ya no existe, usa `connection()`) y `apps/mobile/AGENTS.md` (Expo) antes de tocar cada app.

## Comandos

```bash
npm install          # instala todo el workspace
npm run dev:web      # Next.js en http://localhost:3000
npm run dev:mobile   # Expo (Metro)
npm run check        # format:check + lint + typecheck + tests + build web
npm run test:db      # migraciones + pruebas RLS + seed (Postgres local o DATABASE_URL)
npm run db:start     # Supabase local (Docker) · db:reset · db:types · db:stop
```
