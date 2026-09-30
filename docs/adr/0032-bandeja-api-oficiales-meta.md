# ADR 0032 — Bandeja sobre las API oficiales de Meta, con credenciales sólo en el servidor

- Estado: aceptado
- Fecha: 2026-09-30

## Contexto

CR2 pide conectar Instagram, Facebook y WhatsApp Business con estas condiciones:

- sólo integraciones oficiales;
- nunca pedir contraseñas;
- no simular conexiones;
- mostrar el estado real;
- verificar los webhooks;
- guardar las credenciales en el servidor;
- auditar.

La web corre en Vercel, que ya usa la llave de servicio para el cron y para Usuarios (ADR 0028). La app móvil es un cliente público.

Revisamos la documentación oficial de Meta (Graph API v26.0):

- **Webhooks.** El GET de verificación usa `hub.*` y cada POST viene firmado con `X-Hub-Signature-256` (HMAC-SHA256 con el App Secret).
- **WhatsApp Cloud API.** Se envía con `/{phone-number-id}/messages`. Desde 2026 el contacto se identifica con el BSUID cuando usa nombre de usuario, y en ese caso se envía con `recipient`.
- **Messenger.** Se envía con `/{page-id}/messages`, usando PSID y `messaging_type` RESPONSE.
- **Instagram.** Se envía con `/{ig-id}/messages` en `graph.instagram.com`, usando IGSID.
- **Ventana de atención.** En las tres plataformas hay texto libre sólo durante 24 h desde el último mensaje del contacto. Fuera de ella se requieren plantillas o etiquetas.

## Decisión

1. **Sin secretos en la base.**
   - `channel_accounts` guarda sólo el identificador público de la cuenta, el centro, el estado y la última verificación.
   - Los tokens (`WHATSAPP_ACCESS_TOKEN`, `MESSENGER_PAGE_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`) y el App Secret viven en variables del servidor.
   - Una cuenta por canal por despliegue es suficiente para el piloto. Varias cuentas por canal requerirán una bóveda (Supabase Vault) en su momento.
2. **El estado lo fija sólo el servidor.**
   - «Probar conexión» consulta la cuenta en la Graph API con el token del servidor y registra el resultado con la llave de servicio (`record_channel_verification`).
   - Integraciones muestra «Conectada» sólo con una cuenta activa verificada **y** las credenciales presentes.
   - Una cuenta registrada pero no verificada, o con error, queda «Pendiente de configurar» con la causa.
3. **Webhook firmado → RPC exclusivas de la llave de servicio.** La ruta verifica la firma antes de leer el JSON. La entrada en la base (`ingest_*`) no la puede ejecutar ningún usuario.
4. **Envío en dos pasos.**
   - La base, con la sesión de quien responde, valida permiso, cuenta verificada y ventana, y deja el mensaje «pendiente».
   - El servidor lo envía y registra el id de Meta o el error.
   - Así un usuario no puede enviar sin permiso ni marcar como enviado algo que no salió.
   - La app móvil usa la misma función a través de `/api/inbox/send` con su token de Supabase.
5. **Ventana de 24 h en la base.** `prepare_outbound_message` rechaza el texto libre fuera de la ventana. Las plantillas de WhatsApp y las etiquetas de Messenger quedan para una fase posterior, con su propia revisión de consentimiento.
6. **Integración con el embudo.**
   - Una conversación se convierte en prospecto sin recapturar (canal y teléfono).
   - La primera respuesta enviada a un prospecto ligado cuenta como su primer contacto.
   - Así el tiempo de primera respuesta deja de depender del registro manual.

## Consecuencias

- Rotar un token es cambiar la variable en Vercel y redesplegar. Después se vuelve a probar la conexión.
- Si faltan credenciales, nada se rompe: Integraciones dice qué falta y la bandeja se puede leer pero no responder.
- Lo que se responda desde las apps de Meta no se copia a la bandeja: los ecos se ignoran para no duplicar ni atribuir mal. Está documentado como límite.
- En Messenger e Instagram no se consulta el perfil (nombre o usuario) para no pedir permisos extra. El nombre o el @ se capturan al registrar el prospecto.
- Mientras la app de Meta no pase App Review, sólo funcionará con cuentas de prueba. Ningún canal se declara operativo sin una prueba con una cuenta real del negocio.
