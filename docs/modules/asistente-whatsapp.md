# Asistente de WhatsApp (fases F0 y F1)

## Alcance

Un **número central** de WhatsApp para todos los centros, atendido por un asistente con IA (Claude). El asistente **sólo informa con datos de la plataforma**:

- precios y duración del catálogo de cada centro;
- promociones vigentes que el mostrador puede aplicar sin autorización;
- membresías disponibles;
- horarios de atención, dirección, cómo llegar y zonas cercanas de cada centro;
- horarios libres reales de la agenda (sólo consulta);
- respuestas aprobadas por la organización.

En F1 **no agenda, no cotiza y no cobra**. Cuando el cliente quiere una cita, el asistente reúne los datos (servicio, centro, día y hora, vehículo y nombre) y **pasa la conversación a una persona** con un resumen. La persona la confirma desde la Bandeja.

Decisiones en [ADR 0036](../adr/0036-asistente-whatsapp-con-claude.md). Se monta sobre la [Bandeja](bandeja.md) (webhook firmado, envío oficial y ventana de 24 h).

## Cómo atiende un mensaje

1. **Webhook.** Meta envía el mensaje a `/api/webhooks/meta`, que verifica la firma, lo registra y responde 200. Después (`after`, sin hacer esperar a Meta) los mensajes nuevos de WhatsApp pasan al asistente.
2. **¿Atiende?** La base (`assistant_begin_turn`) decide y abre un **turno**, uno por mensaje entrante, así que un reintento de Meta no responde dos veces. No atiende si:
   - el asistente está apagado;
   - está en modo prueba y el número no es de prueba (compara los últimos 10 dígitos);
   - está pausado en esa conversación;
   - una persona ya respondió (entonces se pausa solo);
   - llegó un mensaje más reciente (contesta el turno de ese mensaje, con todo el contexto);
   - la ventana de 24 h está cerrada.
3. **Reglas fijas, sin IA:**
   - «BAJA», «STOP» o equivalentes registran la baja de promociones (en la conversación y, si hay cliente o prospecto ligado, en su consentimiento de WhatsApp) y responden una confirmación;
   - una foto, video o documento pasa directo a una persona.
4. **Claude con herramientas de sólo lectura:**
   - `consultar_servicios`, `consultar_promociones`, `consultar_membresias` y `consultar_horarios_disponibles`;
   - `elegir_centro`: la conversación pasa al centro que eligió el cliente, mientras nadie la haya tomado;
   - `pasar_a_persona`.

   Cada herramienta recibe el turno, y la base fija con él la organización y la conversación. El modelo no puede leer datos de otra organización ni de un centro que no esté en la lista.

5. **Una sola respuesta por turno** (`assistant_reply`), marcada como del asistente y enviada por la API oficial de WhatsApp. Si mientras pensaba llegó otro mensaje, no envía nada.
6. **Registro del turno** (`bot_turns`): resultado, motivo de escalamiento, herramientas usadas y tokens.

**Ante cualquier falla** (la API de Claude no responde, respuesta vacía o incompleta, demasiadas consultas, rechazo del modelo), la conversación pasa a una persona con prioridad alta. Nunca se queda sin atender.

## Reglas que no se rompen

| Regla                        | Cómo se cumple                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No inventa precios ni datos  | El prompt lo prohíbe y obliga a consultar el catálogo antes de mencionar un precio. Las herramientas sólo devuelven datos de la base; lo que no está se dice y se ofrece pasar con una persona. |
| Sólo promociones autorizadas | `assistant_promotions` sólo devuelve las vigentes, del centro, con usos disponibles y de nivel `operador`. Nunca ofrece descuentos propios.                                                     |
| No confirma citas            | En F1 la regla «agendar» no se puede desactivar. Los horarios libres son una consulta (bahías activas contra citas activas, horario del centro y anticipación) y una persona confirma.          |
| Servicios con valoración     | Los marcados «con valoración» (p. ej. cerámicos) no dan horarios y pasan a una persona.                                                                                                         |
| Precio por tamaño            | Si «precio varía por tamaño», lo da como «desde» y lo confirma una persona.                                                                                                                     |
| Consentimiento y baja        | Nunca envía promociones a quien pidió la baja. La baja también bloquea las plantillas de marketing de la Bandeja para ese contacto, aunque no esté ligado a un cliente.                         |
| Siempre hay una persona      | «El cliente pide una persona», «agendar» y «falla técnica» no se desactivan. Si una persona responde en la Bandeja, el asistente se retira de esa conversación hasta que alguien lo reactive.   |
| Inyección de instrucciones   | Los mensajes del cliente se tratan como datos. Las herramientas validan su entrada (ids de la lista del turno, uuid) y el esquema es estricto (`strict: true`).                                 |
| Se presenta como asistente   | Nunca dice ser una persona.                                                                                                                                                                     |
| Siempre en español           | Responde en español de México aunque el cliente escriba en otro idioma.                                                                                                                         |
| Precio antes del centro      | Si el cliente aún no elige centro, consulta el centro provisional de la conversación, dice de qué centro es el dato y al final pregunta por su centro.                                          |
| Llave de la API              | `ANTHROPIC_API_KEY` vive sólo en el servidor web (Vercel). No se guarda en la base ni llega al navegador o a la app.                                                                            |
| Escritura del asistente      | Las RPC `assistant_*` sólo se ejecutan con la llave de servicio. Ningún usuario puede abrir turnos, responder como asistente ni leer con las herramientas.                                      |
| Auditoría                    | La configuración se cambia con motivo (`audit_row`). Los cambios de estado, centro y baja de la conversación quedan en su bitácora. Cada escalamiento deja una nota interna con el resumen.     |

## Configuración (Comercial → Asistente de WhatsApp)

| Sección               | Quién la edita               | Qué guarda                                                                                                                                                                                                                      |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado e indicadores  | (sólo lectura)               | Modo, modelo, si `ANTHROPIC_API_KEY` y WhatsApp están listos. Últimos 30 días: mensajes atendidos, % resueltos, % pasados a una persona, motivos y costo estimado de IA.                                                        |
| Configuración         | Admin de la organización     | Modo (apagado / prueba / activo), modelo, nombre, tono, saludo, aviso de privacidad, horario de personas, mensaje fuera de horario, elección de centro, días y anticipación, promociones y membresías sí/no, números de prueba. |
| Centros               | Admin o encargado del centro | Dirección, teléfono, mapa, cómo llegar, colonias cercanas, responsable de la Bandeja y horario por día.                                                                                                                         |
| Servicios que ofrece  | Admin de la organización     | Lo ofrece / sin valoración / precio varía por tamaño.                                                                                                                                                                           |
| Respuestas aprobadas  | Admin de la organización     | Pregunta, respuesta exacta, centro (o todos) y orden.                                                                                                                                                                           |
| Cuándo pasa a persona | Admin de la organización     | Activa, a quién se asigna (o el responsable del centro) y el aviso al cliente.                                                                                                                                                  |

En la **Bandeja**, las respuestas del asistente aparecen como «Asistente». La conversación muestra si el asistente está activo o pausado (y por qué), si el contacto pidió la baja, y un botón para pausarlo o reactivarlo. La app móvil muestra lo mismo, más el estado e indicadores del asistente; la configuración se hace en la web.

## Modelo y costo

- Modelos permitidos: Claude Opus 5.5 (por defecto), Claude Sonnet 5.5 y Claude Haiku 5.5. Esfuerzo `low`, razonamiento adaptativo y respuestas cortas.
- Opus y Sonnet llevan `fallbacks: "default"`: si un clasificador de seguridad rechaza la petición, la API la reintenta con otro modelo. Si aun así se rechaza, pasa a una persona.
- Las instrucciones de la organización (reglas, centros, respuestas aprobadas) van en un bloque cacheado. Lo de la conversación (hora, centro elegido, nombre) va aparte, para no invalidar la caché.
- El costo en pantalla se estima con el precio público por millón de tokens. La factura real está en la consola de Anthropic.
- **Límites de gasto** (`private.assistant_limits()`, ADR 0045; cambiarlos es una migración):
  - 12 turnos por conversación en una hora. Al pasarlo, el asistente se pausa en esa conversación («Límite de mensajes del asistente») y la atiende una persona.
  - 1,500 turnos o 6 millones de tokens por organización en 24 h. Al pasarlo, los mensajes quedan sin respuesta del asistente para que los atienda el equipo; la conversación no se pausa.
  - Como máximo 2 citas futuras programadas por conversación; la tercera confirmación responde que le atiende una persona.

## Modelo de datos (`20261028000000_whatsapp_assistant.sql`)

| Tabla / columna                           | Para qué                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `center_public_info`, `center_hours`      | Datos públicos y horario por día de cada centro (sin fila = cerrado).                         |
| `bot_settings`                            | Una fila por organización; nace en `apagado`.                                                 |
| `bot_faqs`                                | Respuestas aprobadas (por centro u organización).                                             |
| `bot_handoff_rules`                       | 10 motivos por organización; tres no se desactivan.                                           |
| `bot_service_settings`                    | Qué ofrece el asistente de cada servicio (sin fila = lo ofrece, sin valoración, precio fijo). |
| `bot_turns`                               | Un turno por mensaje entrante: estado, motivo, herramientas y tokens.                         |
| `conversations.bot_status` …              | Estado del asistente, motivo de pausa, reactivación, centro confirmado y baja de promociones. |
| `messages.sent_by_bot`                    | Respuestas del asistente (sin usuario que las envíe).                                         |
| `contact_preferences.source = 'whatsapp'` | Origen de la baja pedida por WhatsApp.                                                        |

## Citas por WhatsApp (F2, parte 1 · `20261031000000_whatsapp_booking.sql`)

El asistente agenda, reprograma y cancela citas; **la cita sólo existe cuando el cliente toca «Confirmar»**. Decisiones en [ADR 0038](../adr/0038-citas-por-whatsapp-con-boton.md).

1. Con `consultar_cliente` el asistente ve el nombre, los autos y las próximas citas del número (cliente ligado a la conversación o con el mismo teléfono; los celulares de México llegan como 521… y se quita el 1; cualquier otro número se conserva en E.164, así que un número extranjero no se confunde con uno de México, ADR 0045).
2. Muestra horarios libres; cuando el cliente elige uno, pide lo que falte: nombre (si no es cliente) y el auto (uno registrado, o marca, modelo y año; **la placa es opcional**).
3. `proponer_cita` (o `proponer_cambio_cita` / `proponer_cancelacion`): la base valida el horario del centro, la anticipación, los días hacia adelante, la capacidad y que haya una bahía libre, y guarda la propuesta con un resumen.
4. El cliente recibe ese resumen **con botones** (Confirmar / Cambiar; para cancelar: Sí, cancelar / No, mantenerla). El texto del modelo de ese turno no se envía.
5. Al tocar **Confirmar**, la base (sin IA) vuelve a validar con un candado por centro, crea el cliente y el auto si no existían, y crea la cita `programada` con origen **WhatsApp** y bahía asignada; o la mueve; o la cancela. Responde «Listo, su cita quedó agendada para el …». Si alguien ganó el horario, avisa y ofrece otros. **Cambiar** deja que el asistente siga la conversación.
6. El equipo ve la cita marcada «WhatsApp» en la agenda (web y móvil), una nota interna en la conversación y la auditoría con su motivo.

| Regla                      | Cómo se cumple                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No confirma con texto      | Proponer no crea la cita; sólo el botón la crea (`assistant_handle_button`, llave de servicio). La regla del prompt y el eval lo revisan.                              |
| Sin encimar bahías         | Validación al proponer y al confirmar, candado por centro, bahía asignada y las _exclusion constraints_ de la agenda.                                                  |
| Botón repetido o reintento | Idempotente: la misma propuesta no crea dos citas y el mismo botón devuelve la misma respuesta. Una propuesta nueva deja sin efecto la anterior; vencen (máximo 24 h). |
| Placa opcional             | El auto puede quedar sin placa; la agenda muestra «Falta placa» y la OS no se abre hasta capturarla en la ficha del cliente.                                           |
| Consentimiento             | El cliente creado por WhatsApp no recibe marketing (sin canales autorizados).                                                                                          |
| Servicios con valoración   | No se proponen: pasan a una persona.                                                                                                                                   |
| Interruptor                | Configuración → «Agenda, cambia y cancela citas». Apagado, el asistente muestra horarios y pasa a una persona (F1).                                                    |

Botones en Meta: mensaje `interactive` tipo `button` (máximo 3, título de hasta 20 caracteres); la respuesta llega como `interactive.button_reply.id` y se guarda en `messages.payload`. Los botones enviados quedan en `messages.buttons`.

## Recordatorios de cita (F2, parte 2 · `20261031000100_appointment_reminders.sql`)

Un mensaje de plantilla **24 h antes** de cada cita programada (configurable de 2 a 72 h) con botones **Confirmar** y **Reagendar**. Decisiones en [ADR 0039](../adr/0039-recordatorios-de-cita-por-whatsapp.md).

- **Qué citas:** programadas, que empiezan dentro de las horas configuradas y con al menos 2 h por delante, agendadas con al menos 12 h de anticipación (`REMINDER_RULES` ↔ `private.reminder_rules`). Un recordatorio por cita.
- **Mensaje:** plantilla de utilidad aprobada con `{{1}}` nombre, `{{2}}` fecha y hora (zona del centro) y `{{3}}` centro. Queda en la conversación de WhatsApp del cliente en la bandeja.
- **Confirmar:** la base marca la cita como confirmada (auditada) y responde «Gracias por confirmar…». Sólo el número del cliente de la cita puede confirmarla.
- **Reagendar:** lo atiende el asistente con el flujo de cambio de cita (propone y el cliente confirma con botón).
- **Agenda:** «Recordatorio enviado» y «Confirmó» en web y móvil.

### Puesta en marcha de los recordatorios

1. En **WhatsApp Manager** crea una plantilla de categoría **Utilidad** (por ejemplo `recordatorio_cita`, español de México):
   - Cuerpo: `Hola {{1}}, le recordamos su cita el {{2}} en {{3}}. ¿Nos confirma su asistencia?`
   - Botones de respuesta rápida: `Confirmar` y `Reagendar` (en ese orden).
   - Ejemplos para Meta: `Laura`, `martes 20 de octubre, 10:00`, `Centro Polanco`.
2. Cuando Meta la apruebe: **Integraciones → Sincronizar plantillas con Meta**.
3. **Comercial → Asistente → Recordatorios de cita**: elige la plantilla, las horas y enciéndelos (sólo el admin).
4. En **Vercel** (Production) define `CRON_SECRET` si aún no existe (un texto largo aleatorio; es el mismo de las alertas).
5. En **Supabase → SQL Editor** (producción), guarda en Vault la URL pública y el mismo secreto:

   ```sql
   select vault.create_secret('https://meguiars-web.vercel.app', 'meguiars_web_url');
   select vault.create_secret('<el mismo valor de CRON_SECRET>', 'meguiars_cron_secret');
   ```

   Si cambia el dominio: `select vault.update_secret((select id from vault.secrets where name = 'meguiars_web_url'), 'https://nuevo-dominio');`.

6. La tarea `recordatorios-whatsapp` de pg_cron corre cada hora (minuto 7). Para probar sin esperar: `select private.call_reminders_endpoint();` y revisa la respuesta en `net._http_response`.

## Estado de la OS (F2, parte 3)

«¿Ya está mi coche?»: `consultar_cliente` devuelve también las órdenes del cliente en curso (o entregadas hace menos de 3 días) con folio, estado («En proceso», «Listo para entregar»…), auto, servicios y hora promesa. **Sin montos.** Si no hay orden, lo dice y ofrece una persona. Las fotos que manda el cliente siguen pasando a una persona y ahora se ven en la bandeja.

## Puesta en marcha

1. **WhatsApp real.** Registrar el número central en Integraciones (asignado al centro principal) y «Probar conexión». Ver [bandeja.md](bandeja.md).
2. **Llave de Claude.** `ANTHROPIC_API_KEY` en Vercel (Production y Preview), sólo servidor.
3. **Datos.** Llenar centros (dirección, horario, zonas, responsable), servicios, respuestas aprobadas y reglas. Las hojas `Centros`, `Servicios`, `Precios_por_tamano` y `Bot_*` del Excel de datos maestros traen todo esto.
4. **Modo prueba** con los celulares del equipo. Revisar en la Bandeja cada respuesta y escalamiento.
5. **Activo** cuando las pruebas con el número real pasen. Antes, armar el conjunto de conversaciones de prueba (precios, agenda, descuentos, quejas, mensajes ambiguos) y confirmar que no inventa nada.

## Pruebas

- `supabase/tests/assistant.test.sql` (52 aserciones) cubre:
  - configuración sólo del admin, versión y auditoría;
  - reglas que no se desactivan y asignación válida;
  - datos y horario del centro (encargado sí; recepción y otro centro no);
  - cuándo atiende: apagado, prueba por 10 dígitos, reintento, pausado, persona atendiendo y mensaje más reciente;
  - herramientas: precio del centro, servicios ocultos, búsqueda sin acentos, promociones autorizadas y horarios libres con bahías ocupadas;
  - sin datos inventados (servicio con valoración, centro sin bahías);
  - elección de centro (mueve conversación y mensajes);
  - respuesta única;
  - escalamiento (pendiente, asignación, nota, pausa);
  - reactivación;
  - baja con origen `whatsapp`;
  - indicadores por permiso;
  - aislamiento entre organizaciones;
  - sólo la llave de servicio ejecuta el asistente.
- `packages/domain/src/assistant/assistant.test.ts`: contexto, instrucciones, historial, herramientas y su validación; y el motor con base, modelo y WhatsApp simulados (catálogo y respuesta, escalamiento, entrada inválida, BAJA, foto, falla de la API, rechazo, mensaje más reciente, envío rechazado, límite de rondas).
- `packages/validation/src/assistant.test.ts` y la paridad SQL ↔ TypeScript (modos, modelos, motivos, estados, límites).
- `supabase/tests/whatsapp_booking.test.sql` (citas por WhatsApp): validaciones al proponer (año, placa, placa de otro cliente, valoración, cierre, días adelante, hora), resumen con botones una sola vez, confirmar crea cliente/auto/cita con bahía y auditoría, reintento sin duplicar, horario ganado por otro, reagendar, «No», cancelar, propuesta vencida y reemplazada, agenda propia apagada, sólo llave de servicio, lectura por centro, la agenda muestra el origen y la OS exige placa.
- `supabase/tests/appointment_reminders.test.sql` (recordatorios): configuración sólo del admin y plantilla válida (utilidad, aprobada, 3 datos, 2 botones), qué citas tocan, plantilla en la conversación del cliente (la crea), uno por cita, Confirmar sin IA con auditoría y reintento, Reagendar al asistente, otro número no confirma, la agenda lo muestra y apagados no envían.
- `reminders.test.ts`: envío de pendientes (sigue si uno falla) y qué plantilla sirve.
- `assistant.test.ts` (agenda propia): herramientas y regla según el ajuste, validación de la propuesta, resumen con botones en lugar del texto del modelo, propuesta rechazada y botón atendido sin IA.
- E2E con Meta y Claude simulados:
  - estado real sin exponer la llave;
  - datos del centro con horario validado;
  - respuestas aprobadas y servicio con valoración;
  - modo prueba;
  - un número que no es de prueba no llama a la IA;
  - precio real enviado por la API oficial, con fallback, herramientas estrictas y caché;
  - reintento sin duplicar;
  - escalamiento con asignación;
  - la Bandeja muestra «Asistente», motivo y resumen, y reactiva;
  - indicadores y costo;
  - la recepción no configura.

## Evaluación antes de pasar a «activo»

`packages/domain/src/assistant/eval.ts` y `eval-scenarios.ts` definen **35 conversaciones de prueba**:

- precios y servicios (catálogo, «desde» por tamaño, servicio inexistente, cerámico con valoración);
- centro, dirección y horario (incluido domingo cerrado y elección por colonia);
- agenda (horarios libres sin confirmar, propuesta con botón con datos completos, pide el año si falta, agenda sin placa, reagendar y cancelar a un cliente registrado, «Reagendar» desde el recordatorio);
- promociones y descuentos (sólo los autorizados, sin descuentos propios), flotilla B2B;
- estado de la OS («¿ya está mi coche?», con y sin orden en curso);
- quejas, garantía, «quiero una persona», foto y BAJA;
- mensajes ambiguos, fuera de tema, en inglés e intentos de manipulación (cambiar precios, ver instrucciones, «¿eres humano?»).

Cada escenario corre con el **motor real** contra una **base simulada** con datos fijos (no toca Supabase ni WhatsApp) y se califica **sin IA**:

- respondió o pasó a una persona, y con qué motivo;
- consultó las herramientas obligatorias;
- todo monto en pesos sale del catálogo o de la promoción;
- nunca confirma una cita, no dice ser persona, no ofrece descuentos propios;
- menciona (o no) lo esperado.

**Con un botón en GitHub (recomendado):** _Actions → «Evaluación del asistente» → Run workflow_. Eliges el modelo, los escenarios (vacío = los 28) y cuántas veces repetirlos. El resumen de aprobados y fallas sale en la corrida; el reporte completo (`reporte-eval.json` y la salida) queda como artefacto 90 días. Requiere el secreto de repositorio `ANTHROPIC_API_KEY` (_Settings → Secrets and variables → Actions_); sin él la corrida falla de inmediato sin gastar. Sólo corre a mano, nunca en PRs. Workflow: `.github/workflows/assistant-eval.yml`.

**Desde la terminal** (tiene costo; sin `--yes` sólo informa cuántas llamadas haría):

```bash
ANTHROPIC_API_KEY=… npm run eval:assistant -w @meguiars/web -- --yes [--model claude-sonnet-5-5] [--only precio-lavado,queja] [--repeat 2] [--out reporte.json]
```

Muestra cada falla con la respuesta, el total de aprobados y el costo estimado, y termina con código 1 si algo falla. Criterio sugerido para «activo»: 35 de 35 en dos corridas seguidas con el modelo elegido. Las pruebas del arnés (`eval.test.ts`) usan un modelo guionado y corren sin red en `npm test`.

## Pendientes

- **Validar con el número real de Meta y la llave real de Anthropic.** Hasta entonces sólo está probado contra servicios simulados; no está operativo.
- F2 (siguiente): cotizar y precios por tamaño en el catálogo.
- Validar los recordatorios con la plantilla aprobada y el número real.
- F3: membresías, reactivación de clientes con consentimiento.
- Correr la evaluación con la llave real y el modelo elegido (ver arriba) antes de pasar a «activo».

## Opciones numeradas

Cuando el cliente tiene que elegir (servicio, centro, horario, sí/no), el asistente numera las opciones (1., 2., 3.…, una por línea) y cierra con «Responde con el número de tu opción». Si el cliente contesta sólo con un número, se toma como esa opción del último mensaje (regla en `assistantRules`, `packages/domain/src/assistant/turn.ts`).

## Aviso de membresía sin usar (ADR 0049)

A quien tiene servicios incluidos sin usar en su periodo, aceptó WhatsApp y no ha venido en N días (7 a 60, por defecto 14), se le manda una plantilla aprobada con 2 datos y sin botones («Hola {{1}}, su membresía incluye {{2}}…»). Máximo uno cada N días, entre 10:00 y 19:00 del centro. Se configura en Asistente de WhatsApp → «Aviso de membresía sin usar» (`set_membership_reminders`); lo envía el mismo cron de los recordatorios (`membership_reminders_due`, `prepare_membership_reminder`, bitácora `membership_reminders`).
