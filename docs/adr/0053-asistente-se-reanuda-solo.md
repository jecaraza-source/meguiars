# ADR 0053 — El asistente de WhatsApp se reanuda solo tras 2 horas sin respuesta del equipo

- Estado: aceptado
- Fecha: 2026-11-05

## Contexto

El asistente se pausa en una conversación cuando la toma una persona: contestó a mano desde la Bandeja, el asistente la escaló (p. ej. el cliente pidió una persona) o llegó al límite de mensajes por hora. Es a propósito, para no interrumpir. Pero si después nadie del equipo responde, el cliente se queda sin respuesta indefinidamente: así pasó en pruebas con dos conversaciones pausadas desde hacía horas o días.

## Decisión

1. **Reanudación al siguiente mensaje del cliente.** `assistant_begin_turn`, al encontrar la conversación pausada, la reactiva si la pausa y la última respuesta del equipo (mensajes salientes no enviados por el asistente) tienen más de `auto_resume_minutes` (120). Si no, sigue sin contestar, como antes. No hay proceso programado: sólo importa cuando el cliente vuelve a escribir.
2. **Pausas manuales se respetan.** Si una persona pausó el asistente a propósito desde la Bandeja («Pausado por …»), no se reanuda solo.
3. **Trazabilidad.** La reanudación queda en la auditoría de la conversación con su motivo y como nota interna visible para el equipo («se reanudó solo porque nadie del equipo respondió en 2 h»), una por mensaje (idempotente ante reintentos de Meta).
4. **Tiempo en un solo lugar:** `private.assistant_limits()` → `auto_resume_minutes`, junto a los límites de gasto (ADR 0045). Cambiarlo es una migración de una línea.

## Consecuencias

- Un cliente nunca queda más de 2 horas sin respuesta por una pausa automática olvidada.
- Si el equipo sigue atendiendo, cada respuesta suya reinicia las 2 horas.
- Si el equipo no quiere que el asistente vuelva en una conversación, debe pausarlo manualmente desde la Bandeja.
