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

`packages/domain/src/assistant/eval.ts` y `eval-scenarios.ts` definen **28 conversaciones de prueba**:

- precios y servicios (catálogo, «desde» por tamaño, servicio inexistente, cerámico con valoración);
- centro, dirección y horario (incluido domingo cerrado y elección por colonia);
- agenda (horarios libres sin confirmar, pasar a persona con resumen);
- promociones y descuentos (sólo los autorizados, sin descuentos propios), flotilla B2B;
- quejas, garantía, «quiero una persona», foto y BAJA;
- mensajes ambiguos, fuera de tema, en inglés e intentos de manipulación (cambiar precios, ver instrucciones, «¿eres humano?»).

Cada escenario corre con el **motor real** contra una **base simulada** con datos fijos (no toca Supabase ni WhatsApp) y se califica **sin IA**:

- respondió o pasó a una persona, y con qué motivo;
- consultó las herramientas obligatorias;
- todo monto en pesos sale del catálogo o de la promoción;
- nunca confirma una cita, no dice ser persona, no ofrece descuentos propios;
- menciona (o no) lo esperado.

**Correrla con la API real** (tiene costo; sin `--yes` sólo informa cuántas llamadas haría):

```bash
ANTHROPIC_API_KEY=… npm run eval:assistant -w @meguiars/web -- --yes [--model claude-sonnet-5-5] [--only precio-lavado,queja] [--repeat 2] [--out reporte.json]
```

Muestra cada falla con la respuesta, el total de aprobados y el costo estimado, y termina con código 1 si algo falla. Criterio sugerido para «activo»: 28 de 28 en dos corridas seguidas con el modelo elegido. Las pruebas del arnés (`eval.test.ts`) usan un modelo guionado y corren sin red en `npm test`.

## Pendientes

- **Validar con el número real de Meta y la llave real de Anthropic.** Hasta entonces sólo está probado contra servicios simulados; no está operativo.
- F2: agendar con confirmación por botón (apartar horario), cotizar, reagendar o cancelar, estado de la OS, recordatorios con plantillas aprobadas y precios por tamaño en el catálogo.
- F3: membresías, reactivación de clientes con consentimiento.
- Correr la evaluación con la llave real y el modelo elegido (ver arriba) antes de pasar a «activo».
