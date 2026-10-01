# Módulo CR2 — Fase 4: automatizaciones comerciales y panel comercial

## Alcance

- **Automatizaciones** (`/comercial/automatizaciones`). Cada regla tiene:
  - disparador;
  - condiciones;
  - acción;
  - responsable;
  - límites de frecuencia;
  - historial de ejecución.
- **Panel comercial** (`/comercial/panel`).
  - Muestra indicadores con filtros por periodo, canal, campaña, servicio, responsable y centros.
  - Cada indicador trae su fórmula, el origen del dato y el modelo de atribución.

Decisiones en [ADR 0034](../adr/0034-automatizaciones-como-tareas-y-panel-de-un-toque.md).

## Automatizaciones

| Disparador               | Tipo        | Qué hace                                                                                                                                                 | «Días» significa              |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Prospecto nuevo          | operativa   | Crea la tarea «contactar» y, si la regla tiene responsable y el prospecto no, lo asigna (queda en su historial). Filtra por canal y servicio de interés. | no aplica                     |
| Cotización sin respuesta | operativa   | Recordatorio de la cotización enviada sin decisión ni reserva.                                                                                           | días desde el envío           |
| Reserva próxima          | operativa   | Confirmar la cita programada.                                                                                                                            | días antes de la cita         |
| Servicio entregado       | operativa   | Pedir la valoración (OS no B2B). Filtra por servicio.                                                                                                    | días después de entregar      |
| Mantenimiento / recompra | promocional | Proponer el siguiente servicio a quien no ha vuelto ni tiene cita (servicios recurrentes o los elegidos).                                                | días desde el último servicio |
| Cliente inactivo         | promocional | Reactivar a quien no tiene visitas ni cita.                                                                                                              | días sin visitas              |

- **Acción.** Es una tarea en Seguimientos, o en el prospecto, con:
  - el **mensaje sugerido**, que sólo admite `{nombre}`, `{servicio}`, `{centro}`, `{fecha}` y `{folio}` con datos reales, sin precios ni promociones inventados;
  - el canal;
  - el plazo;
  - el horario de contacto.

  La persona responsable envía el mensaje. La plataforma **no envía mensajes sola**: fuera de la ventana de 24 h, WhatsApp exige plantillas aprobadas por Meta, que no están configuradas.

- **Operativa o promocional.**
  - Las promocionales sólo alcanzan a clientes que autorizaron el canal. Si no, la corrida los cuenta como «sin consentimiento».
  - Las operativas usan el canal autorizado o, si no hay, llamada al teléfono registrado, salvo rechazo expreso.
  - Con un prospecto, que escribió primero, se usa WhatsApp si lo autorizó; si no, llamada o correo.
- **Límites.**
  - Una sola acción por regla y sujeto (llave única), así que ni los reintentos ni las corridas repetidas duplican.
  - No se repite con el mismo cliente dentro de _N_ días. Entre promocionales el límite es compartido.
  - Tope de tareas por corrida.
  - Se aplica el horario de contacto.
- **Paro de secuencias.** La tarea pendiente se cancela con motivo, y queda en el historial como «detenida», cuando:
  - el cliente responde en la bandeja (al instante);
  - reserva una cita (al instante; aplica a prospectos, cotizaciones y promocionales);
  - retira el consentimiento (al instante);
  - se decide, reserva o vence la cotización (en la siguiente corrida);
  - cambia la cita (en la siguiente corrida);
  - se cierra el prospecto (en la siguiente corrida);
  - se desactiva la regla.
- **Ejecución.**
  - Cada día a las 08:00 de Ciudad de México y Monterrey (`pg_cron` `automatizaciones-comerciales`, `0 14 * * *` UTC).
  - «Ejecutar ahora» corre la regla al momento.
  - «Vista previa» dice qué haría hoy sin crear nada.
  - Cada corrida registra evaluados, creadas, detenidas y omitidos por motivo.
  - Un error en una regla no detiene a las demás.
- **Arranque.**
  - Las reglas nacen **inactivas**: revisa la vista previa y actívalas con motivo.
  - Al activarla, la regla de prospecto nuevo sólo toma los prospectos registrados desde ese momento.

Operación de `pg_cron`:

- Ver ejecuciones: `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'automatizaciones-comerciales') order by start_time desc limit 10;`
- Pausar: `select cron.unschedule('automatizaciones-comerciales');`

## Panel comercial

| KPI                                      | Fórmula                                                                 | Origen          |
| ---------------------------------------- | ----------------------------------------------------------------------- | --------------- |
| Prospectos                               | prospectos registrados en el periodo                                    | interno         |
| Prospecto → reserva                      | reservaron ÷ prospectos × 100                                           | interno         |
| Reserva → venta                          | reservaron y compraron ÷ reservaron × 100                               | interno         |
| Tiempo de primera respuesta              | mediana (primer contacto − alta), en minutos                            | interno         |
| Ventas / ticket promedio                 | Σ OS entregadas (sin B2B) / ventas ÷ OS                                 | interno         |
| Clientes nuevos / recurrentes            | primera OS entregada en el periodo / ya habían comprado                 | interno         |
| Inversión publicitaria                   | Σ gasto de campañas del periodo (egreso ligado o captura)               | registro manual |
| Costo por prospecto                      | inversión ÷ prospectos con campaña                                      | registro manual |
| Costo por cliente adquirido              | inversión ÷ clientes nuevos atribuidos                                  | registro manual |
| Ingresos atribuidos                      | Σ OS entregadas que ganaron a un prospecto con campaña                  | interno         |
| ROAS                                     | ingresos atribuidos ÷ inversión. **No es rentabilidad neta**            | registro manual |
| Margen de contribución atribuido         | Σ (total − costo directo, incluido el pago al operador) de lo atribuido | interno         |
| Margen atribuido después de la inversión | margen atribuido − inversión                                            | registro manual |

Reglas:

- **Atribución de un toque.** Un prospecto tiene a lo más una campaña, y cada OS gana a un solo prospecto (índice único), así que ninguna venta se atribuye dos veces.
- **«Sin datos» cuando no hay denominador**, nunca 0. Con inversión y sin ventas atribuidas, los ingresos atribuidos son un 0 real.
- **La inversión se separa sólo por canal y campaña.** Con filtro de servicio o responsable, lo que usa inversión dice «Sin datos» y la pantalla lo explica.
- **No hay datos del proveedor.** Ninguna API de anuncios está conectada, y el panel lo dice.

El cálculo vive en `@meguiars/analytics` (`commercial-panel.ts`). El cargador `lib/commercial-panel.ts` es idéntico en web y móvil (prueba de paridad).

## Permisos

| Acción                           | Quién                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Ver automatizaciones e historial | `automations.read`: admin, encargado y comercial (el historial trae nombres; el contador no) |
| Configurar, activar, ejecutar    | `automations.manage`: admin de la organización o admin/encargado del centro                  |
| Panel comercial                  | `commercial.metrics.read`: admin, encargado, comercial y contador (sin datos personales)     |

- Escrituras sólo por RPC `security definer`, con motivo y `audit_log`.
- `authenticated` no escribe en las tablas.
- La corrida del sistema (`private.run_automations_all`) no la ejecuta ningún rol de la API.
- El barrido multicentro cubre las RPC nuevas.

## Modelo de datos (`20261026000000_commercial_automations.sql`)

| Tabla                   | Notas                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `automations`           | Regla por organización o centro: disparador, tipo, días, servicios, canales, responsable, plazo, mensaje, frecuencia, tope, horario, activa. |
| `automation_runs`       | Corrida: modo (programada, manual, vista previa), evaluados, creadas, detenidas, omitidos por motivo, error.                                 |
| `automation_executions` | Cada acción («tarea creada») o paro («detenida») con su sujeto, tarea y motivo.                                                              |

Cambios en tablas existentes:

- `crm_tasks.automation_id` y el origen `automatizacion`.
- Hechos del panel:
  - `commercial_funnel_facts` suma la campaña y la etapa;
  - nuevos `commercial_sales_facts` y `campaign_spend_facts`.

## Web y móvil

| Pantalla         | Web                                                                                            | Móvil                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Automatizaciones | alta con plantillas sugeridas, edición, activar/desactivar, vista previa, ejecutar, historial  | lista, vista previa y ejecutar (configurar es en web)          |
| Panel comercial  | KPIs, etapas y canales con filtros de periodo, canal, campaña, servicio, responsable y centros | KPIs, etapas y canales con filtros de periodo, canal y campaña |

## Pruebas

- **SQL** (`supabase/tests/automations.test.sql`):
  - permisos;
  - marcadores inventados rechazados;
  - vista previa sin efectos;
  - prospecto nuevo:
    - tarea con WhatsApp autorizado y mensaje real;
    - asignación;
    - no toca prospectos anteriores;
    - sin duplicados;
  - paro al responder en la bandeja;
  - promocional sin consentimiento omitida;
  - límite de frecuencia compartido;
  - paro al reservar y al retirar el consentimiento;
  - confirmación de cita operativa por llamada sin consentimiento promocional, y su paro al cancelar;
  - valoración con servicio y folio reales;
  - paro al rechazar la cotización;
  - desactivar cancela lo pendiente;
  - historial;
  - contador y otro centro sin acceso;
  - corrida diaria sin repetir;
  - hechos de ventas (primeras compras) y del embudo.
- **Barrido multicentro** (216 funciones) y verificación del seed.
- **Unitarias:**
  - reglas de dominio y plantillas;
  - validación;
  - KPIs del panel (filtros, «sin datos», atribución única);
  - repositorio;
  - paridad de esquema y web/móvil.
- **E2E (servidor simulado):**
  - reglas y avisos;
  - vista previa con omitidos;
  - marcador `{precio}` rechazado;
  - alta con plantilla y vista previa del mensaje;
  - ejecutar sin duplicar;
  - historial;
  - desactivar con motivo;
  - panel con 15 KPIs, origen y notas;
  - filtro por servicio sin repartir la inversión;
  - permisos del contador y de recepción.

## Datos demo

Centro CDMX:

- «Nuevo prospecto: contactar hoy», «Recordar cotización sin respuesta» y «Confirmar cita de mañana», activas, con su primera corrida (tarea para Mariana Soto);
- «Recompra de lavado», promocional, en pausa.

`supabase/demo/marketing.sql` agrega reglas en ambos centros (contactar prospectos nuevos, recordar cotizaciones, confirmar citas, agradecer y pedir reseña) con su primera corrida, y dos promocionales en pausa.

## Limitaciones

- **Sin envío automático.** Las automatizaciones crean tareas. Enviar sin intervención requiere plantillas aprobadas de WhatsApp (utilidad o marketing con consentimiento), y para Messenger e Instagram etiquetas de mensaje. Queda preparado, no conectado.
- **El paro por estado es diario.** Una cotización decidida o una cita que cambia detienen la tarea en la siguiente corrida. Responder, reservar o retirar el consentimiento la detienen al instante.
- **Inversión sin separar por servicio ni responsable.** El panel no reparte la inversión por servicio ni por responsable: no hay base para hacerlo sin inventar.
- **Sin datos de proveedor.** Mientras no se conecten las API de anuncios, toda la inversión es «registro manual».
