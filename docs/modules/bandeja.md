# Módulo CR2 — Fase 2: conexiones oficiales y bandeja unificada

## Alcance

La bandeja reúne en un solo lugar los mensajes de **WhatsApp Business** (Cloud API), **Messenger** (páginas de Facebook) e **Instagram** (mensajes directos de una cuenta profesional). Todo pasa por las API oficiales de Meta, con paridad web y móvil.

- **Conversaciones por centro.** Cada cuenta oficial se asigna a un centro. Cada conversación tiene responsable, estado (abierta / atendida) y contador de no leídos, y puede ligarse a un prospecto.
- **Responder** dentro de la **ventana de 24 h** desde el último mensaje del contacto. Fuera de ella la bandeja lo bloquea y explica por qué: las tres plataformas sólo permiten plantillas aprobadas o etiquetas especiales, que todavía no se incluyen.
- **Registrar como prospecto sin recapturar.** El prospecto toma el canal, el teléfono si Meta lo comparte y el responsable. También se puede ligar la conversación a un prospecto existente.
- **Primer contacto.** La primera respuesta enviada a un prospecto ligado cuenta como su primer contacto (tiempo de primera respuesta) y lo avanza a «Contactado».
- **Estado de entrega.** Llegan por webhook: enviado, entregado, leído (WhatsApp; Messenger sólo reporta entregado) o no se envió, con la causa que da Meta.
- **Integraciones con estado real.** «Conectada» sólo después de que el servidor verificó la cuenta con Meta usando sus credenciales («Probar conexión»). Nunca se marca a mano.

Decisiones en [ADR 0032](../adr/0032-bandeja-api-oficiales-meta.md).

## Seguridad

| Regla                | Cómo se cumple                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credenciales         | Los tokens y el App Secret viven **sólo** en variables del servidor web (Vercel). No se guardan en la base, no llegan al navegador ni a la app. Integraciones sólo muestra si cada variable está presente. Los logs enmascaran tokens `EAA…` e `IGAA…`.                                                                         |
| Contraseñas          | Nunca se piden contraseñas de redes sociales: se usan tokens emitidos por Meta.                                                                                                                                                                                                                                                 |
| Webhook              | `POST /api/webhooks/meta` exige `X-Hub-Signature-256` = HMAC-SHA256 del cuerpo crudo con `META_APP_SECRET`. Sin firma válida responde 401 y no toca la base. `GET` sólo responde el `hub.challenge` con el `META_WEBHOOK_VERIFY_TOKEN` correcto.                                                                                |
| Escritura desde Meta | `ingest_inbound_messages`, `ingest_message_statuses`, `record_channel_verification` y `finish_outbound_message` sólo se ejecutan con la llave de servicio (`private.is_service_request`). Ningún usuario puede inyectar mensajes, marcar un envío como hecho o una cuenta como verificada.                                      |
| Envío                | En dos pasos. `prepare_outbound_message`, con la sesión de quien responde, valida permiso, cuenta verificada y ventana, y deja el mensaje «pendiente». Después el servidor lo envía con el token oficial y registra el resultado. La app móvil llama a `/api/inbox/send` con su token de Supabase y nunca tiene tokens de Meta. |
| Permisos             | Leer y responder: `leads.use` en el centro (admin, encargado, recepción, comercial). El contador no ve mensajes (datos personales). Registrar cuentas: `channels.manage` (admin de la organización).                                                                                                                            |
| Auditoría            | Alta, edición y verificación de cuentas: `audit_row` con motivo. Cambios de responsable, estado y prospecto de la conversación: bitácora propia. El texto de un mensaje no se edita ni se borra.                                                                                                                                |
| Duplicados           | Meta reintenta los webhooks: el `wamid` / `mid` es único por conversación y los reintentos no duplican. Los estados de entrega nunca retroceden (un «entregado» tardío no deshace un «leído»).                                                                                                                                  |

## Modelo de datos (`20261024000000_inbox_channels.sql`)

```
channel_accounts (organización, centro) ─< conversations (centro) ─< messages
conversations ─ leads? / clients? · assigned_to
```

| Tabla              | Notas                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel_accounts` | Canal, identificador de Meta (`phone_number_id`, id de página o IG ID), nombre interno, centro, estado (pendiente / verificada / error), nombre verificado, último webhook y activa. Sin secretos.    |
| `conversations`    | Una por cuenta y contacto (wa_id o BSUID, PSID, IGSID). Tiene teléfono si Meta lo comparte, nombre de perfil, responsable, estado, no leídos, último mensaje entrante (ventana), prospecto y cliente. |
| `messages`         | Entrantes (`recibido`) y salientes (`pendiente` → `enviado` → `entregado` → `leido`, o `fallido`), con id de Meta, tipo, texto, quién envió y error.                                                  |

### Triaje, notas, respuestas rápidas y plantillas (`20261027000000_inbox_triage_templates.sql`)

| Tabla / columna                                           | Para qué                                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations.priority`, `tags`, `pending`               | Triaje: prioridad (baja, normal, alta; las altas van primero), hasta 10 etiquetas en minúsculas y «pendiente». Se cambian con `set_conversation_triage` (versión y auditoría).                                   |
| `conversation_notes`                                      | Notas internas: inmutables, idempotentes por `request_id`, visibles para quien usa la bandeja del centro. **Nunca** se envían a Meta.                                                                            |
| `quick_replies`                                           | Respuestas rápidas por centro o para toda la organización. Sólo admiten `{nombre}` (primer nombre) y `{centro}`; cualquier otro marcador (p. ej. `{precio}`) se rechaza. Las administra el admin o el encargado. |
| `whatsapp_templates`                                      | Copia de las plantillas de la WABA traídas de Meta (`record_whatsapp_templates`, sólo servidor). Se borran las que Meta ya no devuelve.                                                                          |
| `prepare_outbound_message(…, p_expected_last_message_at)` | Guarda contra duplicados: si llegó un mensaje o alguien respondió después de abrir la conversación, el envío se detiene (40001) para que la persona revise.                                                      |
| `prepare_template_message`                                | Envío de plantilla fuera de 24 h: sólo WhatsApp con cuenta verificada, plantilla `APPROVED`, no de autenticación; las de **marketing** exigen que el contacto haya autorizado WhatsApp (prospecto o cliente).    |

## Configuración (una vez por negocio)

Lo hace el admin, con acceso a Meta Business Suite y a Vercel.

1. **App de Meta** (developers.facebook.com → Mis apps → Crear app, tipo _Business_), ligada al portafolio del negocio. Copia el **App Secret** (Configuración → Básica) en Vercel como `META_APP_SECRET`.
2. **Webhook.** En Vercel, define `META_WEBHOOK_VERIFY_TOKEN` con un texto largo aleatorio que tú eliges. En la app de Meta, en la configuración de webhooks de cada producto, usa:
   - URL de devolución: `https://meguiars-web.vercel.app/api/webhooks/meta`
   - Token de verificación: el mismo texto.

   Suscribe el campo **`messages`**. En Messenger e Instagram suscribe también la página o la cuenta a la app.

3. **WhatsApp Business (Cloud API).**
   1. Agrega el producto WhatsApp y registra el número del negocio.
   2. Crea un **usuario del sistema** en Business Suite con el permiso `whatsapp_business_messaging` y genera su token.
   3. En Vercel guarda el token como `WHATSAPP_ACCESS_TOKEN`.
   4. En la plataforma registra la cuenta con el **phone_number_id** (no el número visible).
4. **Messenger.**
   1. Agrega el producto Messenger y conecta la página.
   2. Genera el **token de la página** con `pages_messaging`. En Vercel guárdalo como `MESSENGER_PAGE_ACCESS_TOKEN`.
   3. Registra la cuenta con el **id de la página**.
5. **Instagram.** Usa la API de Instagram con inicio de sesión de Instagram; requiere una cuenta profesional.
   1. Genera el token de la cuenta con `instagram_business_manage_messages`. En Vercel guárdalo como `INSTAGRAM_ACCESS_TOKEN`.
   2. Registra la cuenta con su **IG ID**. La verificación comprueba que el token sea de esa misma cuenta.
6. **Revisión de Meta.** Mientras la app esté en modo desarrollo sólo funciona con cuentas de prueba o con roles en la app. Para clientes reales, la app necesita **verificación del negocio** y **App Review** de los permisos anteriores (acceso avanzado).
7. **Probar conexión.** Redespliega Vercel. En Plataforma → Comercial → Integraciones, usa «Probar conexión» en cada cuenta. Si Meta la acepta, el canal queda «Conectada»; si no, se muestra la causa, por ejemplo `(#190)` para un token inválido.
8. **Probar extremo a extremo.** Envía un mensaje real al número, a la página o a la cuenta y confirma que aparece en la Bandeja. Responde desde ahí. Hasta hacer esta prueba con una cuenta real no se debe declarar el canal operativo.

9. **Plantillas de WhatsApp (opcional, para escribir fuera de 24 h).**
   1. Crea las plantillas en **WhatsApp Manager** y espera la aprobación de Meta. La plataforma no crea ni edita plantillas.
   2. En Vercel define `WHATSAPP_BUSINESS_ACCOUNT_ID` con el id de la cuenta de WhatsApp Business (WABA), no el phone_number_id. El token del usuario del sistema necesita también `whatsapp_business_management`.
   3. En Integraciones usa «Sincronizar plantillas con Meta» (`GET /{WABA}/message_templates`). Vuelve a sincronizar cuando Meta apruebe, pause o rechace una plantilla.
   4. Envía una plantilla de utilidad a un número de prueba y confirma que llega. Hasta entonces, el envío de plantillas no se declara operativo.

`META_GRAPH_VERSION` es opcional (por omisión `v26.0`). Súbela cuando Meta retire la versión y vuelve a probar la conexión.

## Pantallas

| Web                        | Móvil                | Contenido                                                                                                                                                                                            |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/comercial/bandeja`       | `InboxScreen`        | Conversaciones del centro: filtros por estado, canal, «Mías», «Sin asignar», «Pendientes» y etiqueta; prioridad, notas, no leídos y ventana. En web, alta y edición de respuestas rápidas.           |
| `/comercial/bandeja/[id]`  | `ConversationScreen` | Hilo, responder dentro de la ventana (respuestas rápidas y guarda contra duplicados), plantilla aprobada con la ventana cerrada, notas internas, triaje, responsable, atendida / reabrir, prospecto. |
| `/comercial/integraciones` | `IntegrationsScreen` | Estado real por canal. En web, para el admin: URL del webhook, variables presentes o faltantes, cuentas, «Probar conexión», alta o edición de cuentas y plantillas de WhatsApp sincronizadas.        |

La app móvil responde a través de `EXPO_PUBLIC_WEB_URL` (`/api/inbox/send`). El registro de cuentas se hace sólo en web.

## Limitaciones por canal

| Canal     | Qué funciona                                                                                                                                                          | Qué no (todavía o por la plataforma)                                                                                                                                                                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp  | Recibir texto (y aviso de archivos), responder texto en 24 h, plantillas aprobadas de texto fuera de 24 h (pendiente de probar con la WABA real), estados de entrega. | Plantillas con encabezado multimedia o botones, crear plantillas desde la plataforma, archivos (se ven como aviso), llamadas. Un número conectado a la Cloud API no se usa en la app WhatsApp Business salvo en coexistencia; lo que respondas fuera de la plataforma no se copia. Si el contacto usa nombre de usuario, Meta puede no compartir su teléfono (se usa el BSUID). |
| Messenger | Recibir texto y aviso de adjuntos, responder en 24 h, «entregado».                                                                                                    | Etiquetas fuera de 24 h (p. ej. HUMAN_AGENT), comentarios de publicaciones, lectura (`read`). No se obtiene el nombre del perfil: se registra al crear el prospecto.                                                                                                                                                                                                            |
| Instagram | Recibir DM y aviso de adjuntos, responder en 24 h.                                                                                                                    | Comentarios, menciones, publicaciones y estados de entrega. Meta no comparte teléfono ni usuario en el webhook: se pide el @usuario al registrar el prospecto.                                                                                                                                                                                                                  |

Además:

- Los mensajes enviados desde las apps de Meta (Business Suite, WhatsApp Business) llegan como «eco» y **no** se copian a la bandeja.
- Google Business Profile y TikTok siguen sin conexión.

## Pruebas

- `supabase/tests/inbox.test.sql` cubre:
  - cuentas sin secretos;
  - verificación sólo por el servidor;
  - webhook sólo con la llave de servicio y reintentos sin duplicar;
  - bandeja por centro y contador sin acceso;
  - asignación y versión;
  - prospecto desde la conversación;
  - envío en dos pasos y primer contacto;
  - estados que no retroceden;
  - falla de Meta, ventana de 24 h y cuenta no verificada;
  - reabrir por mensaje nuevo y cuenta desactivada.

  `supabase/tests/inbox_extras.test.sql` cubre triaje y etiquetas inválidas, notas inmutables e idempotentes, respuestas rápidas (marcadores, permisos por rol y centro), guarda contra duplicados y plantillas (sólo servicio sincroniza; aprobada, categoría, consentimiento de marketing y número de datos).

  El barrido de aislamiento cubre las RPC nuevas.

- `packages/domain/src/inbox/inbox.test.ts` cubre:
  - los webhooks reales de WhatsApp (con BSUID), Messenger e Instagram;
  - ecos, estados y la firma;
  - el token de verificación;
  - las solicitudes a la Graph API y la lectura de respuestas y errores;
  - la ventana y el estado de integraciones.
- E2E con Meta simulado:
  - webhook sin firma → 401;
  - alta de cuenta y «Probar conexión»;
  - mensaje firmado sin duplicar;
  - respuesta enviada con el token del servidor;
  - estado «leído»;
  - prospecto desde la conversación;
  - ventana cerrada;
  - permisos.
- E2E de los extras: sincronizar plantillas (GET oficial con el token del servidor), respuesta rápida con `{precio}` rechazada y pegada con nombre y centro, guarda contra duplicados, triaje y nota sin envío a Meta, filtros, plantilla UTILITY enviada fuera de 24 h con el formato oficial (marketing sin consentimiento y no aprobadas excluidas) y permisos.

## Pendientes

- Validar las plantillas con la WABA real (falta `WHATSAPP_BUSINESS_ACCOUNT_ID` y una plantilla aprobada); hasta entonces sólo están probadas contra Meta simulado.
- Plantillas con encabezado, botones o multimedia; Messenger e Instagram fuera de 24 h (etiquetas de mensaje).
- Adjuntos (ver y enviar imágenes).
- Automatizaciones: hechas en la fase 4 como tareas ([automatizaciones](automatizaciones.md)); una respuesta del cliente en la bandeja detiene sus secuencias. Falta la asignación automática de conversaciones.
