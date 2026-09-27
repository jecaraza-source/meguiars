# Módulo AF3 — Administración y Finanzas / Corte de caja y conciliación diaria

## Alcance

Controlar la caja de cada centro por día y turno y detectar faltantes o sobrantes, con paridad web y móvil.

- **Apertura** por centro y turno (día completo, matutino, vespertino o nocturno) con **fondo inicial**.
- **Efectivo esperado** calculado por la base desde los pagos (AF1), nunca capturado.
- **Efectivo contado** capturado por el encargado en el arqueo; la **diferencia** la calcula el sistema.
- **Conciliación informativa** de tarjeta, transferencia y liquidaciones sin efectivo (membresía, crédito B2B).
- **Corte cerrado bloqueado**: ningún cobro ni reverso puede caer en su ventana.
- **Reapertura** sólo del admin, con motivo obligatorio y auditoría; se conserva cada versión del cierre.
- **Exportación**: resumen de texto (imprimir en web, compartir en móvil) y CSV.

Decisiones en [ADR 0020](../adr/0020-corte-de-caja-ventana-bloqueada-y-versiones.md).

## Efectivo esperado (reproducible desde los pagos)

```
esperado = fondo inicial
         + Σ efectivo de los recibos emitidos en la ventana   (el cambio ya está descontado)
         − Σ efectivo de los reversos ejecutados en la ventana (reembolsos que salen de caja)
diferencia = contado − esperado   (faltante < 0, sobrante > 0)
```

La **ventana** del corte es `[apertura, primer cierre)`. Un recibo cobrado y revertido en el mismo turno suma cero. Un recibo cobrado en un corte ya cerrado y revertido después se descuenta **del turno del reverso**, sin tocar el corte cerrado.

La tarjeta y la transferencia se reportan netas de reversos, sólo para conciliar contra la terminal y el banco. No entran al esperado.

## Modelo de datos (`20261009000000_cash_sessions.sql`)

```
cash_sessions (centro, día, turno) ─< cash_closings (versiones del cierre, inmutables)
cash_sessions ─< cash_reopenings (inmutables) ─ cash_closings (versión reabierta)
private.cash_window_facts / cash_window_totals: esperado desde payments, payment_tenders y payment_reversals
```

| Tabla             | Notas                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash_sessions`   | Folio por centro (`CDMX-01-C-000001`), día del centro, turno, fondo, estado (`abierta`, `cerrada`, `reabierta`), apertura, `window_end` (fija desde el primer cierre), último cierre, versión y `request_id`. Una abierta por centro; un corte por día y turno. |
| `cash_closings`   | Una fila por cierre (`sequence` 1, 2, …): ventana, fondo, efectivo cobrado y reembolsado, esperado, contado, diferencia, tarjeta, transferencia, sin efectivo, conteos, desglose por forma de pago (jsonb), nota, quién y cuándo. Inmutable.                    |
| `cash_reopenings` | Motivo (3–500), quién, cuándo y la versión del cierre reabierta. Inmutable.                                                                                                                                                                                     |

Todas con RLS de sólo lectura; las escrituras van por RPC. Las tres llevan `audit_row` (actor, fecha, valores anterior y nuevo, motivo). El cierre y la reapertura emiten además los eventos `cash_session.closed` y `cash_session.reopened`. Nada se borra.

## Reglas

| Regla          | Detalle                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apertura       | Encargado o admin del centro (42501). Fondo ≥ 0 con 2 decimales (22023). Una caja abierta por centro y un corte por día y turno (MG002). Idempotente por `request_id`.                                                                  |
| Cierre         | Encargado o admin del centro (42501); el centro B no puede cerrar la caja de A. Contado ≥ 0 (22023); con diferencia distinta de cero, nota obligatoria (22023). Versión (40001). Idempotente por `request_id`.                          |
| Bloqueo        | Trigger en `payments` y `payment_reversals`: si la hora cae en la ventana de un corte cerrado o reabierto, se rechaza (40001) y el reintento (idempotente) cae en el turno siguiente. Un corte cerrado no se edita (22023) ni se borra. |
| Concurrencia   | El cierre y cada cobro o reverso toman el mismo candado por centro: el cierre espera a los cobros en curso y los que llegan después quedan fuera de la ventana. Verificado con dos conexiones.                                          |
| Reapertura     | Sólo admin (42501), sólo un corte cerrado (22023), motivo obligatorio. Queda `reabierta`: la ventana no cambia y el esperado tampoco; el nuevo cierre crea la versión siguiente y conserva la anterior.                                 |
| Cobro sin caja | Se permite (la cobranza no se detiene), pero se reporta como **efectivo fuera de corte** por centro y día.                                                                                                                              |
| Sin conexión   | Las mutaciones requieren conexión (sin cola offline); el `request_id` hace seguro el reintento.                                                                                                                                         |

## Permisos

| Capacidad      | Roles                                 | Espejo en SQL              |
| -------------- | ------------------------------------- | -------------------------- |
| `cash.read`    | admin, encargado, recepción, contador | `private.can_read_cash`    |
| `cash.operate` | admin, encargado                      | `private.can_operate_cash` |
| `cash.reopen`  | admin                                 | `private.can_reopen_cash`  |

El contador consulta cortes, versiones y movimientos, y sigue de sólo lectura. El comercial B2B no ve el corte.

## RPC

| RPC                   | Uso                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `open_cash_session`   | Apertura (turno, fondo, notas; idempotente).                                             |
| `close_cash_session`  | Arqueo y cierre (contado, nota; versión y solicitud). Devuelve la versión del cierre.    |
| `reopen_cash_session` | Reapertura con motivo (admin).                                                           |
| `list_cash_sessions`  | Cortes por centros y días; esperado al momento si está abierta, si no el cierre vigente. |
| `cash_session_detail` | Ficha (jsonb): totales recalculados, versiones, reaperturas y movimientos de la ventana. |
| `cash_uncovered`      | Efectivo cobrado sin caja abierta, por centro y día.                                     |

## Pantallas

| Web                   | Móvil                | Contenido                                                                                                                        |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/finanzas/caja`      | `CashSessionsScreen` | Caja abierta del centro activo o apertura, efectivo fuera de corte y cortes (hoy, 7 o 30 días; centro activo o todos).           |
| `/finanzas/caja/[id]` | `CashSessionScreen`  | Resumen, conciliación, arqueo con diferencia en vivo, reapertura, versiones, movimientos. Web: CSV e imprimir; móvil: compartir. |

Estados de carga, vacío, error y sin permiso en todas. Reglas (`cashTotals`, `cashDifference`, `closeNoteRequired`, `cashSessionActions`), textos (`cashCopy`), resumen (`cashSummaryText`) y CSV (`cashSummaryCsv`) viven en `@meguiars/domain`, así el cierre en web y en móvil produce el mismo resultado.

## Datos seed

CDMX: corte de ayer cerrado con fondo $1,000, contado $980 y faltante de $20 explicado; caja de hoy abierta desde antes del anticipo de AF1 (esperado $1,500 = fondo $1,000 + efectivo $500).

## Pruebas

- **SQL** (`supabase/tests/cash_sessions.test.sql`), 38 aserciones:
  - apertura: permisos (recepción, contador, otro centro), fondo, turno, idempotencia, una abierta por centro, un corte por día y turno;
  - esperado con efectivo con cambio, tarjeta, transferencia y un reverso en el mismo turno;
  - cierre: centro B no cierra A ni lo ve, nota ante faltante, decimales, versión, idempotencia, auditoría y evento;
  - bloqueo: el corte cerrado no se edita ni se borra, la versión es inmutable, un cobro dentro de la ventana cerrada se rechaza;
  - diferencia reproducible desde los pagos, también tras revertir después un cobro de un corte cerrado (el reembolso cae en el turno siguiente);
  - efectivo fuera de corte;
  - reapertura: sólo admin, motivo, auditoría (actor, motivo, valores), versión 2 con el mismo esperado y la versión 1 intacta.
- **Concurrencia** (manual, dos conexiones): el cierre espera al cobro en curso y lo incluye; un cobro que alcanza un cierre ya comprometido se rechaza.
- **Unitarias:** `cashTotals` con el mismo escenario que la prueba SQL, diferencia, nota, acciones, matriz de roles, resumen y CSV; validación; repositorio; paridad SQL.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 8 comprobaciones: recepción sin abrir caja y efectivo fuera de corte; apertura; esperado con cambio, tarjeta y reembolso; cierre con faltante y nota; CSV; contador y otro centro sin operar; comercial sin acceso; reapertura del admin y versión 2.

## Variables de entorno

Ninguna nueva.

## Pendientes

- Conteo por denominación (billetes y monedas) y arqueo ciego (ocultar el esperado a quien cuenta).
- Retiros parciales y depósitos a banco durante el turno; fondo que se deja para el siguiente turno.
- Egresos pagados en efectivo desde la caja (hoy los egresos de AF2 no mueven el esperado).
- Conciliación automática contra la terminal y el estado de cuenta bancario.
- Bloquear el cobro en efectivo sin caja abierta (hoy sólo se reporta).
