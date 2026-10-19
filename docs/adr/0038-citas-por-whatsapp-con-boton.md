# ADR 0038 — Citas por WhatsApp: el asistente propone, el cliente confirma con un botón y la base agenda

- Estado: aceptado
- Fecha: 2026-10-19

## Contexto

En F1 el asistente de WhatsApp sólo mostraba horarios libres y pasaba la conversación a una persona para agendar ([ADR 0036](0036-asistente-whatsapp-con-claude.md)). Se quiere que el cliente agende, reprograme y cancele solo, sin anticipo, con estas condiciones:

- el modelo nunca debe poder «confirmar» una cita con texto ni inventar disponibilidad;
- dos clientes (o un cliente y la recepción) no pueden quedarse con la misma bahía;
- una cita necesita cliente y vehículo, y quien escribe por WhatsApp a veces no es cliente todavía;
- muchas personas no traen la placa a la mano cuando agendan.

## Decisión

1. **Proponer ≠ agendar.** Las herramientas `proponer_cita`, `proponer_cambio_cita` y `proponer_cancelacion` sólo crean una fila en `bot_booking_proposals` con un resumen generado por la base (centro, fecha en la zona del centro, servicios, auto y nombre). El sistema envía ese resumen al cliente como mensaje interactivo con botones **Confirmar** / **Cambiar**. El texto del modelo en ese turno no se envía.
2. **El botón lo atiende la base, sin IA.** El webhook guarda el id del botón (`messages.payload`). `assistant_handle_button` valida que la propuesta sea de esa conversación, esté pendiente y vigente, y la ejecuta en una transacción: crea el cliente (si el teléfono no existe) y el auto, y la cita con `source = 'whatsapp'`; o la mueve; o la cancela. Con un reintento del webhook devuelve la misma respuesta (idempotente por propuesta y por mensaje). «Cambiar» descarta la propuesta y deja que el asistente siga la conversación.
3. **El horario se valida dos veces y en la base.** Al proponer y al confirmar: horario del centro (el servicio termina antes del cierre), anticipación mínima, días hacia adelante, capacidad (citas activas contra bahías activas) y una bahía libre que se asigna. Al confirmar se toma un candado por centro y las _exclusion constraints_ de la agenda siguen siendo la última palabra. Si alguien ganó el horario, la propuesta queda «fallida» y el cliente recibe otra opción.
4. **Placa opcional.** `vehicles.plate` acepta `null`; la base y la UI muestran «sin placa» (`private.vehicle_label` ↔ `vehicleLabel`). La OS **sí** la exige: un trigger en `service_orders` lo dice con un mensaje claro y la agenda avisa «Falta placa» para que la recepción la capture al recibir el auto. Los formularios del personal la siguen pidiendo.
5. **Identidad del contacto por su teléfono de WhatsApp.** El cliente de la conversación es el ligado o el de la organización con el mismo teléfono. El número se normaliza sin «+» para aplicar la regla del 521 de México (`private.whatsapp_phone` ↔ `normalizePhone`). Un cliente nuevo nace **sin** consentimiento de marketing.
6. **Interruptor por organización** (`bot_settings.self_booking`, encendido por omisión). Apagado, el asistente vuelve a F1: muestra horarios y pasa a una persona con motivo «agendar».
7. **Visibilidad para el equipo.** Cada confirmación deja una nota interna en la conversación, un evento en la bitácora (`appointment.whatsapp_*`) y la auditoría de la cita con su motivo («Cita confirmada por el cliente en WhatsApp»). La agenda (web y móvil) marca la cita como «WhatsApp».

## Consecuencias

- Las citas de WhatsApp quedan con `created_by` nulo; el origen y el motivo están en la cita y en la auditoría.
- Un auto puede quedar duplicado si el cliente lo da de alta sin placa dos veces; la recepción lo corrige al capturar la placa (la placa sigue siendo única por organización).
- Los servicios «con valoración» (p. ej. cerámico) siguen pasando a una persona.
- Las listas existentes que concatenaban la placa se redefinieron para mostrar «sin placa» en lugar de un texto vacío.
- El recordatorio de la cita y su confirmación con plantilla quedan para la siguiente parte (mismo mecanismo de botón).
