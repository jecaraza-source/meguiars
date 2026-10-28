# ADR 0045 — Asistente de WhatsApp: número del contacto en E.164 y límites de gasto y de citas

- Estado: aceptado
- Fecha: 2026-10-28

## Contexto

Una auditoría de seguridad del asistente de WhatsApp (ADR 0036) encontró tres problemas:

1. **Números extranjeros leídos como mexicanos.** `private.whatsapp_phone` quitaba el «+» antes de normalizar, y la regla de 10 dígitos de `normalize_phone` los tomaba como celular de México. Un contacto de Noruega (+47 7xxxxxxx), Singapur (+65 6xxxxxxx) o Dinamarca (+45 2xxxxxxx) podía coincidir con un cliente mexicano y ver su nombre, sus autos y sus citas, o reagendarlas.
2. **Gasto sin tope.** Cada mensaje entrante abría un turno con hasta 6 llamadas al modelo. Ningún límite por conversación ni por organización frenaba a un número automatizado.
3. **Agenda sin tope.** Un número podía proponer y confirmar citas sin límite y llenar todas las bahías.

## Decisión

1. `private.whatsapp_phone` sólo reescribe el prefijo de México `521` (a `+52`); cualquier otro número se conserva en E.164. Así coincide con `clients.phone` para México y nunca confunde un número extranjero.
2. `public.assistant_begin_turn` revisa límites antes de abrir el turno (`private.assistant_limits()`):
   - **12 turnos por conversación en una hora**: se pausa el asistente en esa conversación para que la atienda una persona (mismo mecanismo que cuando una persona responde).
   - **1,500 turnos o 6 millones de tokens por organización en 24 h**: el mensaje queda sin respuesta del asistente (`skip`) para el equipo; la conversación no se pausa.
3. `private.booking_execute` rechaza la confirmación cuando la conversación ya tiene **2 citas futuras programadas** y responde que le atiende una persona.
4. Los límites viven en una función, no en la configuración de la pantalla: cambiarlos es una migración. Se prefirió a columnas y pantalla nuevas (sobreingeniería para un tope que casi no cambia).

## Consecuencias

- Las conversaciones ya ligadas a un cliente equivocado por la regla anterior conservan ese vínculo; si aparece alguna, se corrige a mano en la bandeja.
- Si el negocio crece y el tope diario se queda corto, se sube en una migración.
- Pruebas: `supabase/tests/whatsapp_limits.test.sql`.
