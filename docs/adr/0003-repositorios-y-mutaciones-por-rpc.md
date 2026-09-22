# ADR 0003 — Puertos/adaptadores de repositorio y mutaciones sensibles por RPC

- Estado: aceptado
- Fecha: 2026-09-22

## Contexto

Web y móvil deben ejecutar los mismos casos de uso sin duplicar el acceso a datos. Las mutaciones sensibles deben hacerse del lado del servidor o por RPC, y dejar un motivo en la auditoría.

## Decisión

1. **Puertos en `domain`, adaptadores en `supabase`.** `domain` define interfaces (`DetailCenterRepository`) que devuelven `Result<T>`. `@meguiars/supabase` las implementa y traduce los errores de Postgres y PostgREST a `RepoError` (`permission_denied`, `validation`, `not_found`, `conflict`, `unavailable`). Así, la UI distingue "permiso denegado" de "error" sin conocer códigos SQL.
2. **`ViewState` compartido.** `toViewState(result)` produce `loading | empty | ready | permission_denied | error`. Ambas apps renderizan esos cinco estados con los textos de `centersCopy`.
3. **Validación en la frontera.** El adaptador valida cada comando con zod antes de llamar a la RPC. La base de datos vuelve a validar: CHECK, trigger de zona horaria y longitud del motivo.
4. **Mutaciones por RPC `security invoker`.** `update_detail_center` y `set_center_membership` fijan el motivo (`private.set_change_reason`) y ejecutan el cambio **bajo RLS**, de modo que la autorización se define en un solo lugar: las políticas. El trigger `private.require_change_reason` rechaza (`23514`) cualquier escritura directa de un cliente sin motivo, lo que convierte a la RPC en la única vía práctica.
5. **Sin borrado de membresías.** Se desactivan (`active = false`) para conservar el historial.

## Alternativas descartadas

- **RPC `security definer` con chequeos manuales:** duplicaría en PL/pgSQL la lógica de las políticas y abriría la puerta a que diverjan.
- **Mutaciones en Route Handlers de Next con `service_role`:** móvil no podría reutilizarlas sin pasar por web, y tener la llave en un servidor aumenta el riesgo. Queda reservado para procesos que de verdad requieran privilegios (onboarding de centros).
