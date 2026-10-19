# ADR 0040 — Fotos y archivos en la bandeja, y estado de la OS para el cliente

- Estado: aceptado
- Fecha: 2026-10-19

## Contexto

La bandeja sólo mostraba «Mensaje con archivo: ábrelo en la app de Meta» y no podía enviar fotos ([ADR 0032](0032-bandeja-api-oficiales-meta.md)). En el detallado las fotos son parte de la conversación: daños, cómo quedó el auto, comprobantes. Además, la pregunta más común después de agendar es «¿ya está mi coche?», y el asistente no veía las órdenes de servicio.

## Decisión

1. **Bucket privado `inbox-media`**, igual que las evidencias ([ADR 0012](0012-evidencias-storage-privado.md)): ruta `<organización>/<conversación>/<archivo>.<ext>`, hasta 16 MB, tipos de foto, PDF, audio y video. Las políticas de `storage.objects` usan la regla de la bandeja (`can_use_leads` del centro **actual** de la conversación): el contador y otros centros no leen. Se lee sólo con URL firmadas de 10 minutos.
2. **Entrantes (WhatsApp):** el webhook guarda el id, el tipo y el nombre del archivo de Meta. Después de responder 200, el servidor pide a Meta la URL (`GET /{media-id}`), lo descarga con el mismo token y lo guarda en el bucket; `record_message_media` (sólo llave de servicio) registra la ruta o el motivo si no se pudo (tipo no admitido, más de 16 MB, error de Meta). El hilo lo muestra en web y móvil. Las fotos siguen pasando a una persona (el asistente no las interpreta).
3. **Salientes:** quien responde sube la foto ya reducida (lado mayor ≤ 1600 px, JPEG, máximo 5 MB) con su sesión, y `prepare_outbound_media` aplica las mismas reglas que el texto (permiso, cuenta verificada, ventana de 24 h, guarda contra duplicados, idempotencia). El servidor la envía a Meta con `type: image` y un **enlace firmado de corta duración** (Meta la descarga), sin pasar el archivo por la Graph API de subida. Sólo WhatsApp por ahora.
4. **Estado de la OS:** `consultar_cliente` agrega las órdenes del cliente en curso (o entregadas en los últimos 3 días) con folio, estado en lenguaje del cliente, auto, servicios y hora promesa. **Nunca montos** por este medio. El cliente se identifica por su conversación o su teléfono de WhatsApp, igual que en las citas.

## Consecuencias

- Los archivos entrantes de Messenger e Instagram siguen como aviso (sus adjuntos traen otra URL; queda para después).
- Si la descarga falla, el motivo queda en el hilo y la persona puede pedir al cliente que lo reenvíe.
- Los archivos no se borran desde la plataforma (mismo criterio que los mensajes).
- El enlace firmado vence en 10 minutos: si Meta no lo descarga a tiempo, el envío queda «no se envió» con la causa y se puede reintentar.
