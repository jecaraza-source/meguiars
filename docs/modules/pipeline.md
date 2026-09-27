# Módulo C5 — Comercial / Pipeline (embudo y oportunidades)

## Alcance

Un pipeline básico para oportunidades **B2B** (empresas y flotillas) y de **clientes de alto valor** (B2C premium), sin convertirlo en un CRM empresarial. Tiene paridad web y móvil.

- **Oportunidad:**
  - tipo (B2B o B2C premium);
  - contacto o cuenta;
  - valor estimado;
  - siguiente acción con fecha;
  - responsable, centro y etapa;
  - origen y cierre esperado;
  - en B2B, además, una propuesta de convenio.
- **Etapas configurables.** Las mínimas son prospecto, contactado, propuesta, negociación, ganado y perdido.
- **Notas y tareas.** Las tareas usan la cola del CRM (`crm_tasks`).
- **Ganar una oportunidad B2B** crea la cuenta y el convenio sin recapturar datos y sin duplicar la empresa.
- **Métricas:** oportunidades, conversión, valor ganado y ciclo promedio. Se calculan **sólo desde los eventos**.

Decisiones en [ADR 0017](../adr/0017-pipeline-eventos-y-conversion-sin-duplicados.md).

## Modelo de datos (`20261006000000_pipeline.sql`)

```
pipeline_stages (organización) ─< sales_opportunities (centro) ─< opportunity_events (inmutable)
sales_opportunities ─ b2b_accounts? / clients? / converted_account_id / converted_agreement_id
crm_tasks.opportunity_id → sales_opportunities   (client_id opcional sólo para tareas de oportunidad)
```

| Tabla                 | Notas                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline_stages`     | Etapas por organización con `kind` (`abierta`, `ganada`, `perdida`), posición y probabilidad. Hay una sola etapa ganada y una sola perdida, con probabilidad fija de 100 y 0. Cada organización nueva recibe las etapas mínimas por trigger.                                                   |
| `sales_opportunities` | Contacto o cuenta: `b2b_account_id`, `client_id` o los datos del prospecto (empresa, razón social, RFC, contacto, teléfono o email). Guarda también la propuesta de convenio (`proposed_*`), el cierre (`won_value`, `loss_reason`), la conversión (`converted_*`) y `version` (concurrencia). |
| `opportunity_events`  | `creada`, `etapa`, `valor`, `responsable`, `nota`, `ganada`, `perdida`, `reabierta` y `convertida`. Cada evento guarda la etapa anterior y la nueva, el valor vigente, quién, cuándo y el comentario. No se actualiza ni se borra (trigger), y `seq` da un orden total.                        |

El RFC es único por organización en `b2b_accounts` (índice parcial): una empresa tiene una sola cuenta.

## Reglas

| Regla                   | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contacto / cuenta       | B2B: una cuenta existente, un cliente empresa o un prospecto (empresa, contacto y teléfono o email). B2C premium: siempre un cliente registrado del centro.                                                                                                                                                                                                                                                                                                                                                                                            |
| Sin duplicar la empresa | Al registrar o editar una oportunidad B2B, la base la liga sola a la empresa existente. Busca en este orden: la cuenta de su cliente; una cuenta con el mismo RFC; un cliente empresa con el mismo teléfono o email.                                                                                                                                                                                                                                                                                                                                   |
| Etapas                  | Moverse sólo entre etapas abiertas y activas. Ganar y perder tienen su propia RPC. El estado de la oportunidad es el tipo de su etapa (trigger).                                                                                                                                                                                                                                                                                                                                                                                                       |
| Siguiente acción        | Puede estar vencida, ser hoy, estar programada, sin fecha o faltar (la resalta el tablero). Al cerrar la oportunidad se limpia.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Ganar B2B               | Exige b2b.write (admin o comercial B2B) y hace lo siguiente sin recaptura:<br>1. Reutiliza la cuenta o el cliente existentes. Si no hay, crea el cliente empresa con el teléfono del prospecto.<br>2. Crea la cuenta (con el RFC y la razón social) y su contacto principal.<br>3. Si hay propuesta, crea el convenio activo: inicio elegido, fin = inicio + meses − 1 día, centro habilitado y términos propuestos. Las tarifas se configuran después en la cuenta. Si ya hay otro convenio activo en esas fechas, se puede ganar sin crear convenio. |
| Ganar B2C premium       | Sólo registra el cierre y el valor. La venta se captura en su módulo (OS o membresía).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Perder / reabrir        | Perder exige motivo y cancela las tareas pendientes de la oportunidad. Una oportunidad perdida se reabre con motivo. Una ganada no se reabre, porque ya es cuenta.                                                                                                                                                                                                                                                                                                                                                                                     |
| Tareas                  | `create_opportunity_task` (llamar, WhatsApp, email o reunión) las crea en `crm_tasks`. Se completan, cancelan o reprograman con las RPC del CRM. Con cliente registrado se respeta su consentimiento de contacto; los prospectos sin cliente no lo tienen todavía. La cola del CRM y sus conteos excluyen estas tareas.                                                                                                                                                                                                                                |
| Auditoría               | Oportunidades y etapas llevan `require_change_reason` y `audit_row` (actor, fecha, valores anterior y nuevo, motivo). Los eventos son el historial de negocio.                                                                                                                                                                                                                                                                                                                                                                                         |

## Indicadores (`@meguiars/analytics`)

Fuente única: `pipeline_metric_facts(centers[], from, to)`. Da un hecho por oportunidad, derivado **sólo** de `opportunity_events` y sin datos personales. Incluye las oportunidades creadas hasta `to` que seguían abiertas o que se cerraron desde `from`.

| KPI                  | Fórmula                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Oportunidades nuevas | Eventos «creada» en el rango.                                                                   |
| Ganadas / perdidas   | Último cierre vigente («reabierta» lo anula) con fecha en el rango.                             |
| Conversión           | Ganadas ÷ (ganadas + perdidas) × 100.                                                           |
| Valor ganado         | Σ valor del evento «ganada».                                                                    |
| Ciclo promedio       | Promedio de días entre «creada» y «ganada».                                                     |
| Pipeline abierto     | Σ último valor registrado de las oportunidades sin cierre.                                      |
| Pipeline ponderado   | Σ último valor × probabilidad de la etapa vigente.                                              |
| Embudo               | Oportunidades nuevas que llegaron a cada etapa o a una posterior. Perder no cuenta como avance. |

La prueba SQL comprueba que los hechos coinciden con el estado de cada oportunidad. También comprueba que alterar la tabla de oportunidades por fuera de las RPC no cambia las métricas.

## Permisos

| Capacidad                      | Roles                                           | Qué permite                                                          |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| `pipeline.read`                | admin_socio, encargado, comercial_b2b           | Ver oportunidades, historial y tareas del centro.                    |
| `pipeline.write`               | admin_socio, encargado, comercial_b2b           | Registrar y trabajar oportunidades B2C premium.                      |
| `pipeline.write` + `b2b.write` | admin_socio, comercial_b2b                      | Oportunidades B2B, incluido ganar (convertir en cuenta).             |
| `pipeline.metrics.read`        | admin_socio, encargado, comercial_b2b, contador | Indicadores sin datos personales. El contador sigue de sólo lectura. |
| `pipeline.manage`              | admin_socio corporativo                         | Etapas: alta y edición de abiertas, y renombrar las de cierre.       |

El responsable debe tener un rol comercial en el centro (o ninguno: «sin asignar»). El operador no ve el pipeline, ni tampoco sus tareas en la cola del CRM.

## RPC

| RPC                                                          | Uso                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `create_opportunity(center, request, kind, title, value, …)` | Alta idempotente; prospecto y propuesta en jsonb.              |
| `update_opportunity(id, version, …, reason)`                 | Edición (abierta); valor y responsable quedan en el historial. |
| `move_opportunity_stage(id, version, stage, note?)`          | Cambio de etapa con comentario.                                |
| `add_opportunity_note(id, note)`                             | Nota en el historial.                                          |
| `win_opportunity(id, version, value?, agreement?, start?)`   | Ganar; B2B convierte en cuenta y convenio.                     |
| `lose_opportunity(id, version, reason, notes?)`              | Perder con motivo.                                             |
| `reopen_opportunity(id, version, stage, reason)`             | Reabrir una perdida.                                           |
| `create_opportunity_task(id, request, kind, …)`              | Tarea en la cola del CRM.                                      |
| `list_opportunities(centers[], status?, kind?, owner?, id?)` | Lista y ficha con nombres de etapa, responsable y empresa.     |
| `opportunity_timeline(id)`                                   | Historial con nombres.                                         |
| `pipeline_owners(center, kind)`                              | Responsables posibles.                                         |
| `pipeline_metric_facts(centers[], from, to)`                 | Hechos para los KPIs.                                          |
| `upsert_pipeline_stage(org, id?, …, reason)`                 | Etapas.                                                        |

Errores:

- `40001`: la oportunidad cambió en otro dispositivo.
- `MG002`: regla visible (ya cerrada, convenio traslapado, responsable sin rol, falta el teléfono para convertir).
- `42501`: permiso.
- `22023`: validación.

## Pantallas

| Web                               | Móvil                   | Contenido                                                                                                  |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/comercial/pipeline`             | `PipelineScreen`        | Tablero por etapa (valor, ponderado, acción vencida), filtros abiertas, ganadas y perdidas, tipo y «Mías». |
| `/comercial/pipeline/nueva`       | `OpportunityNewScreen`  | Alta: cuenta, empresa registrada o prospecto; propuesta de convenio; cliente para B2C premium.             |
| `/comercial/pipeline/[id]`        | `OpportunityScreen`     | Ficha, mover de etapa, ganar, perder, reabrir, tareas, notas, historial y edición con motivo.              |
| `/comercial/pipeline/indicadores` | `PipelineMetricsScreen` | KPIs, embudo, abiertas por etapa, resumen por tipo y configuración de etapas (admin corporativo).          |

Accesos:

- «Nueva oportunidad» desde la ficha de una cuenta B2B y desde la ficha CRM de un cliente (persona).
- «Pipeline» desde el resumen comercial.

## Datos seed

Etapas mínimas de la organización demo. Cuatro oportunidades con su historial:

- prospecto B2B con propuesta de iguala;
- cliente B2C premium;
- ampliación de Transportes del Norte (cuenta existente);
- una oportunidad perdida.

## Variables de entorno

Ninguna nueva.

## Pendientes

- Tablero con arrastrar y soltar (hoy se mueve desde la ficha).
- Recordatorios automáticos de la siguiente acción. Hoy se resalta en el tablero; las tareas de la cola sirven de recordatorio.
- Oportunidades de prospectos B2C (hoy B2C premium exige un cliente registrado).
- Ligar la venta real (OS o membresía) a una oportunidad B2C premium ganada.
