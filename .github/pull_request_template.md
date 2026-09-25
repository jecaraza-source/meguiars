## Resumen

<!-- Qué cambia y por qué. Módulo/prompt (p. ej. F0.5). -->

## Checklist

Un PR sólo está listo para merge con el check **CI ok** en verde y esta lista completa.

- [ ] **Alcance:** sólo lo del módulo; sin módulos futuros ni dependencias sin justificar (ADR si hay una nueva).
- [ ] **Multicentro:** toda tabla operativa lleva `detail_center_id` y RLS probada (`supabase/tests`).
- [ ] **Migraciones:** nuevas, con versión mayor que la última de `main`; ninguna migración existente editada. Si hay transición de datos: `tests/upgrade/<migración>.{before,after}.sql`.
- [ ] **Mutaciones sensibles** por RPC o server action, con motivo y auditoría.
- [ ] **Paridad web/móvil** (o la diferencia documentada).
- [ ] **Estados:** carga, vacío, error y sin permiso.
- [ ] **Pruebas** de reglas, permisos y criterios de aceptación.
- [ ] **Variables de entorno** nuevas en `.env.example`, `docs/modules/ci-cd.md` y en Vercel/EAS/GitHub por ambiente. Sin secretos en el repo.
- [ ] **Docs** del módulo actualizados.

## Pruebas

<!-- Comandos ejecutados y resultado (npm run check, npm run test:db, e2e…). -->

## Despliegue y rollback

<!-- Migraciones a aplicar, configuración manual por ambiente y cómo revertir. "N/A" si no aplica. -->
