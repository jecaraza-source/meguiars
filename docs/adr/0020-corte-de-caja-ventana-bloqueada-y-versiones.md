# ADR 0020 — Corte de caja: esperado desde los pagos, ventana bloqueada y versiones del cierre

- Estado: aceptado
- Fecha: 2026-09-27

## Contexto

AF3 controla la caja diaria por centro y turno. La diferencia entre lo contado y lo esperado debe ser reproducible desde los pagos (AF1), y un corte cerrado no debe cambiar sin dejar rastro. Los pagos se registran en web y móvil, en paralelo al cierre, y los reversos pueden llegar días después.

## Decisión

1. **El esperado sale de los pagos, por ventana de tiempo.**
   - Esperado = fondo + efectivo de los recibos emitidos en la ventana − efectivo de los reversos ejecutados en la ventana.
   - No hay FK de pago a corte: la pertenencia se deduce de la hora, igual que para cualquier auditor.
   - Un reverso posterior se descuenta del turno en que se hace. El corte original no cambia.
2. **La ventana de un corte cerrado queda bloqueada.**
   - Un trigger en `payments` y `payment_reversals` rechaza (40001) cualquier fila cuya hora caiga en la ventana de un corte cerrado o reabierto.
   - El cierre y los cobros comparten un candado por centro (`pg_advisory_xact_lock`): el cierre espera a los cobros en curso, y un cobro que empezó antes pero llega después se reintenta (idempotente) en el turno siguiente.
   - Con esto, recalcular un corte cerrado siempre da lo mismo, y la ficha lo verifica.
3. **Cada cierre es una versión inmutable.**
   - `cash_closings` guarda la foto del corte: esperado, contado, diferencia y desglose.
   - Reabrir no borra ni edita: agrega `cash_reopenings` con motivo, y el nuevo cierre crea la versión siguiente.
   - `window_end` se fija en el primer cierre: reabrir sirve para corregir el conteo, no para meter ventas nuevas en un turno pasado.
4. **Una caja abierta por centro y un corte por día y turno.** El estado `reabierta` no ocupa el lugar de la caja abierta, así que el turno siguiente puede operar mientras el admin corrige.
5. **Permisos.**
   - Encargado y admin abren y cierran.
   - Sólo el admin reabre.
   - Recepción y contador consultan; el contador sigue de sólo lectura.
6. **Reglas, textos, resumen y CSV compartidos** en `@meguiars/domain`, para que web y móvil produzcan el mismo cierre.

## Consecuencias

- Un cobro no espera a que haya caja abierta. El efectivo cobrado sin caja se reporta como "fuera de corte"; bloquearlo queda pendiente.
- El candado por centro serializa los cobros de un mismo centro durante microsegundos. Es aceptable para el volumen de un centro.
- Los egresos en efectivo (AF2) no mueven el esperado. Si se pagan desde la caja, hoy aparecen como faltante (pendiente: retiros y egresos de caja).
- Reabrir no permite cambiar el fondo, el turno ni la ventana: cualquier otro ajuste es un movimiento del turno siguiente.
