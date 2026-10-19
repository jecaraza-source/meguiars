# ADR 0039 — Recordatorios de cita por WhatsApp: plantilla con botones, disparo horario desde Supabase

- Estado: aceptado
- Fecha: 2026-10-19

## Contexto

Se pidió un recordatorio **24 h antes de cada cita** con la opción de confirmar o reagendar. Un día antes la ventana de 24 h de WhatsApp casi siempre está cerrada, así que sólo se puede escribir con una **plantilla aprobada** por Meta. El token de Meta vive sólo en el servidor web (Vercel) ([ADR 0032](0032-bandeja-api-oficiales-meta.md)).

Para respetar «24 h antes de cada cita» hay que revisar cada hora. Vercel Cron en el plan gratuito sólo permite una ejecución al día y un cron horario rompería el despliegue; no sabemos el plan del proyecto.

## Decisión

1. **Plantilla de utilidad con botones.** La organización elige en Configuración una plantilla `UTILITY` aprobada con 3 datos (`{{1}}` nombre, `{{2}}` fecha y hora en la zona del centro, `{{3}}` centro) y 2 botones de respuesta rápida (Confirmar, Reagendar). La base lo valida (`set_assistant_reminders`); la sincronización de plantillas ahora guarda cuántos botones tiene cada una. Es de utilidad: no requiere consentimiento de marketing y respeta la baja de promociones.
2. **La base decide qué se envía.** `reminders_due` lista las citas `programada` que empiezan dentro de las horas configuradas (24 por omisión), con al menos 2 h por delante, agendadas con al menos 12 h de anticipación y sin recordatorio previo. `prepare_appointment_reminder` deja el mensaje «pendiente» en la conversación de WhatsApp del cliente (la crea, cerrada, si no existe) y marca la cita: **un recordatorio por cita**, aunque el envío falle, para no insistir.
3. **El servidor sólo envía.** `GET /api/cron/recordatorios` (con `CRON_SECRET`) corre `runReminders` del dominio: prepara, envía la plantilla con el id de cada botón (`recordatorio:confirmar:<cita>` / `recordatorio:reagendar:<cita>`) y registra el resultado.
4. **Disparo horario desde Supabase.** `pg_cron` llama cada hora (minuto 7) a esa ruta con `pg_net`, leyendo la URL y el secreto de **Supabase Vault** (`meguiars_web_url`, `meguiars_cron_secret`). Funciona con cualquier plan de Vercel; sin esos secretos no hace nada. Si el dominio cambia, se actualiza el secreto de Vault.
5. **Botones.** «Confirmar» lo atiende la base sin IA (`assistant_handle_button`): sólo si el número es el del cliente de la cita (su conversación del recordatorio o su teléfono), marca `appointments.confirmed_at` con auditoría y responde. «Reagendar» lo atiende el asistente, que usa el flujo de cambio de cita con botón ([ADR 0038](0038-citas-por-whatsapp-con-boton.md)).
6. **Visibilidad.** La agenda (web y móvil) muestra «Recordatorio enviado» y «Confirmó».

## Consecuencias

- Requiere configuración manual: plantilla aprobada en WhatsApp Manager, sincronizarla, elegirla en Configuración, `CRON_SECRET` en Vercel y los dos secretos en Vault (ver la puesta en marcha del módulo).
- Si Meta rechaza un envío, el mensaje queda «no se envió» en la bandeja con la causa y la cita no recibe otro recordatorio.
- Si más adelante el proyecto está en Vercel Pro, el mismo endpoint puede llamarse con Vercel Cron cada hora en lugar de pg_cron.
