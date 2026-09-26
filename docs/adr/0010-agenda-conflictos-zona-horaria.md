# ADR 0010 — Agenda: conflictos en la base de datos y hora del centro

- Estado: aceptado
- Fecha: 2026-09-29

## Contexto

La agenda no debe sobreasignar bahías ni técnicos, aunque web y móvil agenden al mismo tiempo. A veces el encargado necesita encimar a propósito, con autorización y auditoría. Además, cada centro opera en su zona horaria.

## Decisión

1. **Conflictos con _exclusion constraints_** (`btree_gist`, `tstzrange && `), uno por bahía y otro por técnico, sólo sobre citas activas y sin override. La base es la que decide, así que dos altas simultáneas no pueden encimarse.
2. **Override "a demanda":** el RPC intenta sin override. Sólo si hay `exclusion_violation`, y el usuario es encargado o admin con motivo, marca `conflict_override` y registra el evento auditado. Un override sin conflicto real no desprotege la cita.
3. **Transiciones de estatus en SQL**, con su espejo en el dominio y una prueba de paridad.
4. **UTC en la base y el día y la hora del centro en la UI:**
   - `list_appointments` calcula el día con la zona del centro;
   - `zonedToUtc` y `utcToZoned` (con `Intl`, sin dependencias) convierten la captura en web y móvil.
5. **Técnicos como referencia simple** (`technicians`), sin exigir cuenta. `profile_id` es opcional.

## Alternativas descartadas

- **Validar conflictos sólo en la app o en el RPC con un `select`:** hay condiciones de carrera entre web y móvil.
- **Slots fijos de agenda:** es rígido para servicios de 5 minutos a 8 horas.
- **Librerías de fechas (date-fns-tz, luxon):** `Intl` basta y no agrega dependencias.

## Consecuencias

- Una cita marcada con override ya no participa en las reglas de conflicto. Si se cancela la cita original, la marca queda como historial y no se recalcula.
- Para el KPI de ocupación hace falta el horario de apertura de cada centro. Queda pendiente.
