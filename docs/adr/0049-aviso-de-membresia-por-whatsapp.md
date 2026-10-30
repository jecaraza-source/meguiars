# ADR 0049 — Aviso por WhatsApp para usar la membresía

- Estado: aceptado
- Fecha: 2026-10-30

## Contexto

Clientes con membresía dejan sin usar los servicios incluidos de su periodo. El dueño pidió avisarles por WhatsApp para que la usen. Ya existe el envío de plantillas aprobadas por Meta para los recordatorios de cita (ADR 0039): la base decide a quién y prepara el mensaje en la conversación del cliente; el servidor web lo envía con el token de Meta desde `/api/cron/recordatorios`, que pg_cron llama cada hora. El CRM (ADR 0014) no envía mensajes: sus pendientes son tareas para el equipo.

## Decisión

1. **Cuándo:** membresía activa o por vencer, con servicios incluidos sin usar en su periodo actual (`membership_balance`), y sin visita ni uso en N días (configurable de 7 a 60, por defecto 14). Como máximo un aviso por membresía cada N días, sólo entre 10:00 y 19:00 del centro.
2. **A quién:** sólo clientes activos, con celular, que aceptaron WhatsApp (`contact_preferences`). Sin consentimiento no hay aviso.
3. **Plantilla:** aprobada por Meta (Marketing o Utilidad), con 2 datos (`{{1}}` nombre, `{{2}}` servicios disponibles, por ejemplo «2 Lavado») y sin botones. Si el cliente responde, lo atiende el asistente como cualquier mensaje (puede agendar).
4. **Mecánica:** `membership_reminders_due` y `prepare_membership_reminder` (sólo servidor) con la bitácora `membership_reminders` (RLS por centro). El envío reutiliza `runReminders` con otro gateway; la misma ruta del cron manda recordatorios de cita y avisos de membresía.
5. **Configuración:** el admin lo enciende en Asistente de WhatsApp (web) con plantilla, días y motivo (`set_membership_reminders`, auditado). Móvil muestra el estado.

## Consecuencias

- Requiere crear y aprobar la plantilla en WhatsApp Manager y sincronizarla en Integraciones.
- Un aviso que no se pudo preparar (sin cuenta verificada, sin plantilla) queda en la bitácora sin enviar y no se reintenta hasta pasados N días.
- Pruebas: SQL (`membership_reminders.test.sql`: consentimiento, días sin visita, sin beneficios, ventana horaria, plantilla, idempotencia, permisos), dominio y validación.
