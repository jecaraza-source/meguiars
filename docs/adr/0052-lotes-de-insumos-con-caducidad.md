# ADR 0052 — Lotes de insumos con caducidad y avisos

- Estado: aceptado
- Fecha: 2026-10-30

## Contexto

El dueño pidió saber qué productos están por caducar para usarlos primero o sacarlos y reemplazarlos. ADR 0012 dejó fuera existencias y almacenes: el consumo de insumos sólo congela estándar y costo en la OS.

## Decisión

1. **Lote, no inventario.** `supply_lots` (por centro) guarda insumo, lote, fecha de caducidad, fecha de recepción y cantidad recibida sólo informativa. No hay saldo ni movimientos; ADR 0012 sigue vigente.
2. **Estado calculado al leer** con la fecha del centro: `caducado` (antes de hoy), `por_caducar` (30 días o menos) o `vigente`. Fuente única `private.supply_lot_state`, espejo `supplyLotState` / `SUPPLY_EXPIRY_WARNING_DAYS` en el dominio. No se guarda el estado.
3. **Ciclo de vida:** alta con `register_supply_lot` (idempotente por `request_id`); cierre con `close_supply_lot` (versión y motivo): `agotado` si se terminó, `retirado` si se sacó (caducado o dañado). Nunca se borra; triggers de motivo y auditoría.
4. **Quién:** admin, encargado y recepción del centro (`private.can_use_supply_lots`, capacidad `operations.write`). Técnico, contador y comercial no lo ven.
5. **Aviso:** Operación del día (web y móvil) muestra cuántos lotes están caducados y cuántos por caducar, con enlace a «Lotes y caducidad» (Operación). Sin correo ni WhatsApp por ahora.

## Consecuencias

- Si algún día se construye inventario, podrá leer estos lotes como base de existencias por lote.
- El aviso depende de que recepción registre los lotes al recibirlos.
