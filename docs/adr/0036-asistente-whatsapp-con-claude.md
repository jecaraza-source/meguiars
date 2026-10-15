# ADR 0036 — Asistente de WhatsApp con Claude: sólo datos de la plataforma, en el servidor

- Estado: aceptado
- Fecha: 2026-10-15

## Contexto

Se quiere un asistente en WhatsApp para preguntar precios, horarios y disponibilidad, y para pedir citas. Las condiciones son:

- un número central para todos los centros;
- sin anticipo;
- integraciones oficiales;
- nunca inventar precios, promociones ni disponibilidad;
- respetar consentimiento y bajas;
- poder pasar siempre a una persona;
- no declararlo operativo sin probarlo con el número real.

La Bandeja ya recibe WhatsApp por el webhook firmado de Meta y envía por la Cloud API desde el servidor ([ADR 0032](0032-bandeja-api-oficiales-meta.md)).

Opciones evaluadas:

- **Menús y botones.** Sin IA: predecible y barato, pero rígido.
- **IA libre.** Natural, pero sin control de lo que promete.
- **Híbrido (elegido).** La IA conversa, pero todo dato sale de herramientas que leen la base. Las acciones con efecto (citas) las confirma una persona en F1 y botones en F2.

## Decisión

1. **Nueva dependencia: `@anthropic-ai/sdk` (0.132.1, exacta) sólo en `apps/web`.**
   - Es el SDK oficial de Anthropic.
   - Se usa la Messages API con herramientas propias y un bucle manual corto (máximo 6 rondas). Así cada llamada se registra y el escalamiento termina el turno.
   - No se usa el Agent SDK ni Managed Agents: el asistente no necesita sandbox ni archivos.
   - Defaults: Claude Opus 5.5, razonamiento adaptativo, esfuerzo `low` (chat) y `max_tokens` 8000. Timeout de 40 s con 1 reintento.
   - Herramientas con `strict: true`. Opus y Sonnet llevan `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`); Haiku no lo admite.
   - El admin elige entre Opus 5.5, Sonnet 5.5 y Haiku 5.5. El costo lo decide la organización.
2. **La llave vive sólo en el servidor.** `ANTHROPIC_API_KEY` está en Vercel. La app móvil y el navegador nunca la ven. `ANTHROPIC_BASE_URL` sólo se usa en pruebas con un servidor falso.
3. **La base decide y limita.**
   - `assistant_begin_turn` abre un turno por mensaje entrante (idempotente frente a reintentos de Meta) y aplica las reglas de cuándo atender: modo, números de prueba, pausa, persona atendiendo y mensaje más reciente.
   - Las herramientas (`assistant_*`) sólo se ejecutan con la llave de servicio y reciben el turno: la organización y la conversación salen del turno, nunca del modelo.
   - Una sola respuesta por turno (`request_id` = turno). Si llegó otro mensaje mientras tanto, no se responde.
4. **El motor es puro y está en el dominio** (`packages/domain/src/assistant`). Instrucciones, herramientas, validación de entradas, historial y el bucle del turno reciben base, modelo y envío inyectados. Se prueba sin red. El servidor sólo adapta el SDK y el envío de Meta.
5. **Siempre hay una persona.**
   - «Pide persona», «agendar» (F1) y «falla técnica» no se desactivan.
   - Cualquier falla (API, respuesta vacía o truncada, rechazo, demasiadas rondas) pasa la conversación a una persona.
   - Si una persona responde, el asistente se retira de esa conversación.
6. **Ejecución después de responder a Meta** (`after` de Next.js, `maxDuration` 60 s). Meta no espera a la IA, y si el turno falla el mensaje sigue en la Bandeja.
7. **Datos que el asistente necesita y no existían:**
   - `center_public_info` y `center_hours` para dirección, horario y zonas;
   - `bot_service_settings` para lo que ofrece de cada servicio;
   - la baja por WhatsApp en la conversación, que también bloquea las plantillas de marketing.

   El precio por tamaño queda para F2: requiere que cotizaciones y OS lo usen, para no prometer un precio que el mostrador no aplica.

## Consecuencias

- Costo variable por conversación: se registra por turno (tokens) y se muestra estimado. La factura real está en la consola de Anthropic.
- El modelo puede equivocarse al redactar. Por eso los datos vienen de la base, las acciones las confirma una persona, y cada respuesta queda visible en la Bandeja marcada como «Asistente».
- Antes de pasar a «activo» hace falta un conjunto de conversaciones de prueba (evaluación) y validar con el número y la llave reales.
- Vercel debe permitir 60 s de ejecución en la ruta del webhook.
