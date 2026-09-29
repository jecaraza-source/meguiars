# Operación del día y Resumen financiero

Las dos pantallas eran marcadores de la Fundación ("Vista previa del diseño"). Ahora leen datos reales del centro activo, en web (`/operacion`, `/finanzas`) y móvil (mismos loaders; la paridad la vigila `scripts/dashboard-parity.test.mjs`).

## Operación del día

Fuente única: RPC `public.center_day_summary(p_detail_center_id)` (security definer, sólo `authenticated`). El día es `private.center_today` en la zona horaria del centro.

| Bloque     | Permiso                     | Contenido                                                                                                                                                                            |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `orders`   | `private.can_use_orders`    | OS activas por estado (abierta, autorizada, en proceso, pausada, terminada), lista de hasta 50 (terminadas primero), entregadas hoy (número, total y saldo pendiente) y abiertas hoy |
| `agenda`   | `private.can_use_agenda`    | Citas de hoy por estado y próximas (programadas/recibidas, hasta 20)                                                                                                                 |
| `payments` | `private.can_read_payments` | Cobros válidos recibidos hoy (número y total)                                                                                                                                        |

Sin rol en el centro, la función falla con `42501`. Un bloque sin permiso regresa `null` y la pantalla lo oculta.

Indicadores: en taller, por iniciar, listas para entregar, entregadas hoy, cobrado hoy, por cobrar de entregadas y citas de hoy. Cada OS enlaza a su detalle; cada cita, a la agenda. "Nueva orden" y "Nueva cita" aparecen según permiso.

## Resumen financiero

Sin tablas nuevas; reúne lo que ya existe, cada tarjeta con su permiso y enlace:

- Ventas, utilidad bruta (con margen) y EBITDA del mes a la fecha (`pnl.read`, P&L consolidado del centro) → P&L.
- Cobrado hoy (`payments.read`) → Cobranza.
- Por cobrar (`payments.read`, saldos de OS) → Cobranza.
- Caja de hoy: efectivo esperado de la sesión abierta (`cash.read`) → Corte de caja.

## Pruebas

- SQL: `supabase/tests/day_summary.test.sql` (aislamiento por centro, orden de la lista, entregadas/cobradas hoy, agenda, contador sólo con cobros, operador ajeno → 42501).
- Unitarias: `packages/domain/src/day/day.test.ts`, `packages/supabase/src/repositories/day.test.ts`.
- e2e: operación vacía y con OS + cita, resumen financiero para contador, operador sin acceso a finanzas, 390 px sin scroll horizontal.

## Rollback

Revertir el PR regresa los marcadores. La función puede quedarse (sólo lectura) o eliminarse con `drop function public.center_day_summary(uuid);`.
