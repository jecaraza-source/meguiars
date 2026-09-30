# Módulo CR2 — Servicios complementarios de Social Media (fase 1: base comercial)

## Alcance

CR2 se entrega por fases:

1. **Base comercial**: este documento.
2. Conexiones oficiales y bandeja.
3. Calendario de contenido y campañas.
4. Automatizaciones y analítica avanzada.

La fase 1 funciona **sin ninguna red conectada**. Las consultas que llegan por Instagram, Facebook, WhatsApp u otro canal se registran a mano, y todo lo demás (embudo, cotización, reserva, venta, rentabilidad y reportes) ya queda medido. Tiene paridad web y móvil.

- **Prospectos (CRM de consultas):**
  - canal de origen (Instagram, Facebook, WhatsApp, recomendación, Google, visita y otro) y su detalle;
  - contacto y usuario de redes;
  - servicios de interés y vehículo;
  - consentimiento por canal;
  - responsable, siguiente acción con fecha y tareas (cola del CRM);
  - notas e historial inmutable.
- **Embudo configurable.** Las etapas iniciales son nuevo, contactado, cotizado, pendiente de reserva, reservado, ganado y perdido. Perder exige motivo; reabrir exige motivo.
- **Cotizaciones:**
  - folio `<CENTRO>-COT-00001`;
  - precio, costo y % del operador congelados;
  - descuentos con la misma regla de autorización que la OS;
  - vigencia;
  - texto listo para compartir por WhatsApp o redes;
  - **reservar** crea la cita en la agenda.
- **Cita → OS con el precio cotizado.** Al entregarse la OS, el prospecto se marca ganado y la venta queda atribuida a su canal.
- **Rentabilidad**, incluido el **Lavado manual detallado**: pago al operador = base aplicable × % ÷ 100. Reutiliza la base de ADR 0026. El margen de la cotización es estimado; el real es el de la OS.
- **Duplicados:** candidatos por teléfono o email (nunca sólo por nombre) y fusión supervisada con motivo, sin reescribir la historia financiera.
- **Segmentos:** servicios comprados o de interés, visitas, gasto, recencia y consentimiento.
- **Reportes comerciales** con la fórmula de cada indicador; "sin datos" en lugar de 0.
- **Integraciones:** pantalla con el estado real de cada canal. Hoy todos están en "Aún no disponible".

Decisiones en [ADR 0031](../adr/0031-prospectos-cotizaciones-y-fusion-sin-reescribir-historia.md).

## Modelo de datos (`20261023000000_commercial_leads_quotes.sql`)

```
lead_stages (organización) ─< leads (centro) ─< lead_events (inmutable)
leads ─< lead_services (interés) · leads ─ clients? · leads.service_order_id (única) → service_orders
crm_tasks.lead_id → leads
quotes (centro) ─< quote_items · quotes ─< quote_discounts · quotes ─ leads? / clients? / vehicles?
appointments.quote_id (único) → quotes          service_order_items.price_source += 'cotizacion'
clients.merged_into_id / merged_at / merged_by   (fusión supervisada)
```

| Tabla             | Notas                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `lead_stages`     | Por organización. `kind` abierta/ganada/perdida. `milestone` único por organización (contactado, cotizado, reservado). Se siembran solas.     |
| `leads`           | Canal, contacto, `phone_key` (últimos 10 dígitos), consentimiento, estado, etapa, responsable, siguiente acción, `version` y `request_id`.    |
| `lead_events`     | Creado, etapa, responsable, nota, contacto, cotización, reserva, ganado, perdido, reabierto, cliente y fusión. No se edita ni se borra.       |
| `quotes`          | Estados borrador, enviada, aceptada, rechazada, cancelada y convertida. «Vencida» se calcula. `cost_total` y `contribution_margin` generados. |
| `quote_items`     | Precio, costo estándar y % del operador congelados. `operator_pay` generado.                                                                  |
| `quote_discounts` | Igual que los descuentos de la OS: nivel de autorización, quién autorizó y anulación con motivo.                                              |

## Reglas

| Regla             | Detalle                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta de prospecto | Nombre, canal y al menos un teléfono, email o usuario de redes. Si llega por recomendación, hay que indicar quién recomendó. Si el teléfono o el email ya existen en otro prospecto o cliente, se muestran y hay que confirmar que es otra persona.                                                   |
| Hitos             | Registrar un contacto, crear una cotización o reservar marcan el hito (y adelantan la etapa si iba atrás). Así el embudo mide lo mismo aunque se renombren etapas.                                                                                                                                    |
| Primera respuesta | Minutos entre el alta y el primer contacto registrado. Mientras no haya integraciones, mide desde el registro, no desde que llegó el mensaje.                                                                                                                                                         |
| Cotización        | Prospecto o cliente. Vigencia de 15 días por omisión (máximo 90). Se edita en borrador o enviada. Rechazar o cancelar exige motivo. Una cotización vencida, rechazada o cancelada no se reserva.                                                                                                      |
| Reservar          | `book_quote` crea la cita con la agenda de siempre (mismas reglas de choque y horario) y liga la cotización a la cita. El prospecto pasa a «reservado». Requiere un cliente con vehículo: desde la ficha del prospecto se registra el cliente sin recapturar.                                         |
| OS desde la cita  | Las líneas usan el precio cotizado (`price_source = 'cotizacion'`, con el precio de lista en `list_unit_price`) y las cantidades de la cotización. Los descuentos se copian con su nivel y quien los autorizó. Costo y % del operador son los vigentes al vender. Una OS B2B usa la tarifa convenida. |
| Venta atribuida   | Una OS por prospecto. Al entregarse, el prospecto se marca ganado (trigger `service_orders_win_lead`). También se puede ganar a mano ligando una OS del cliente.                                                                                                                                      |
| Fusión            | Sólo `clients.merge` (admin o encargado) y con motivo. Se elige cuál conservar. Mueve vehículos, consentimiento, prospectos y tareas abiertas. No toca OS, cobros, membresías ni CxC. El duplicado queda inactivo con `merged_into_id`; ficha, historial y hechos del CRM leen la familia completa.   |
| Precio que cambió | Si el precio de lista cambió después de cotizar, la ficha lo advierte. La OS respeta lo cotizado mientras la cotización esté vigente.                                                                                                                                                                 |
| Auditoría         | Prospectos, etapas, cotizaciones y fusiones llevan `require_change_reason` y `audit_row`.                                                                                                                                                                                                             |

## Indicadores (`@meguiars/analytics`, `COMMERCIAL_KPIS`)

Fuentes:

- `commercial_funnel_facts(centers[], from, to)`: un hecho por prospecto registrado en el periodo (cohorte), sin datos personales.
- `commercial_quote_facts(centers[], from, to)`: un hecho por cotización.

| KPI                              | Fórmula                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| Prospectos                       | Registrados en el periodo (fecha del centro).                          |
| Prospecto → cotización           | Con al menos una cotización ÷ prospectos × 100.                        |
| Prospecto → reserva              | Con reserva ÷ prospectos × 100.                                        |
| Reserva → venta                  | Con reserva que ya compraron (OS entregada) ÷ con reserva × 100.       |
| Primera respuesta (mediana)      | Mediana de (primer contacto − alta) en minutos, de los ya contactados. |
| Sin contactar                    | Abiertos sin ningún contacto.                                          |
| Ventas atribuidas                | Σ total de las OS que ganaron a los prospectos del periodo.            |
| Ticket promedio atribuido        | Ventas atribuidas ÷ prospectos ganados.                                |
| Margen de contribución atribuido | Σ (total − costo total, que incluye el pago al operador) de esas OS.   |
| Valor cotizado                   | Σ total de las cotizaciones del periodo sin canceladas.                |
| Cotización → reserva             | Reservadas ÷ cotizaciones sin canceladas × 100.                        |
| Descuento sobre lo cotizado      | Σ descuentos ÷ Σ (total + descuentos) × 100.                           |

Reglas de presentación:

- Un denominador en cero se muestra como «sin datos», nunca como 0 %.
- Hay desglose por canal, responsable y centro, además de los motivos de pérdida.
- No se muestra ROAS. Las ventas por peso invertido de cada campaña se reportan en [Campañas](marketing.md), nunca como utilidad.

## Permisos

| Capacidad                 | Roles                                                     | Qué permite                                  |
| ------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `leads.use`               | admin_socio, encargado, operador_recepcion, comercial_b2b | Prospectos, cotizaciones, reservar y tareas. |
| `commercial.metrics.read` | admin_socio, encargado, contador, comercial_b2b           | Reportes comerciales (sin datos personales). |
| `clients.merge`           | admin_socio, encargado                                    | Ver duplicados y fusionar con motivo.        |
| `leads.manage`            | admin_socio corporativo                                   | Etapas del embudo.                           |

Segmentos usa `crm.read`. Toda escritura va por RPC `security definer` con verificación explícita de permiso por centro. Las tablas no tienen `insert`/`update`/`delete` para `authenticated`. El barrido de aislamiento cubre las RPC nuevas.

## RPC

| Grupo        | RPC                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prospectos   | `lead_matches`, `create_lead`, `update_lead`, `log_lead_contact`, `move_lead_stage`, `add_lead_note`, `lose_lead`, `reopen_lead`, `win_lead`, `link_lead_client`, `create_lead_task`, `list_leads`, `lead_timeline`, `lead_owners`, `upsert_lead_stage` |
| Cotizaciones | `create_quote`, `set_quote_item`, `add_quote_discount`, `void_quote_discount`, `update_quote`, `set_quote_status`, `book_quote`, `list_quotes`                                                                                                          |
| Duplicados   | `client_duplicate_candidates`, `merge_clients`                                                                                                                                                                                                          |
| Segmentos    | `commercial_segment`                                                                                                                                                                                                                                    |
| Métricas     | `commercial_funnel_facts`, `commercial_quote_facts`                                                                                                                                                                                                     |

Errores:

- `40001`: el registro cambió en otro dispositivo.
- `MG002`: regla visible (cotización vencida, etapa inválida, fusión bloqueada).
- `42501`: permiso.
- `22023`: validación.

## Pantallas

| Web                             | Móvil                     | Contenido                                                                                               |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/comercial/prospectos`         | `LeadsScreen`             | Tablero por etapa, sin contactar y acción vencida; filtros de estado, canal y «Sólo míos».              |
| `/comercial/prospectos/nuevo`   | `LeadNewScreen`           | Alta con aviso de coincidencias por teléfono o email.                                                   |
| `/comercial/prospectos/[id]`    | `LeadScreen`              | Contacto, etapa, perder o reabrir, tareas, cotizaciones, cliente e historial. Edición y etapas, en web. |
| `/comercial/cotizaciones`       | `QuotesScreen`            | Lista con estado, total y margen.                                                                       |
| `/comercial/cotizaciones/nueva` | `QuoteNewScreen`          | Servicios con estimado de total, pago al operador y margen.                                             |
| `/comercial/cotizaciones/[id]`  | `QuoteScreen`             | Líneas, descuentos, estado, compartir texto y reservar.                                                 |
| `/comercial/segmentos`          | `SegmentsScreen`          | Web: filtros libres. Móvil: segmentos predefinidos.                                                     |
| `/comercial/duplicados`         | `DuplicatesScreen`        | Web: fusión con motivo. Móvil: consulta.                                                                |
| `/comercial/reportes`           | `CommercialReportsScreen` | KPIs con fórmula, desglose por canal, responsable y centro, y motivos de pérdida.                       |
| `/comercial/integraciones`      | `IntegrationsScreen`      | Estado real de cada canal y flujo manual mientras no esté conectado.                                    |

Accesos: «Crear cotización» desde la ficha CRM del cliente, «Precio cotizado» en la OS y «Registrar como cliente» desde el prospecto (`/clientes/nuevo?prospecto=`).

## Integraciones por canal

Desde la fase 2, WhatsApp Business, Messenger e Instagram tienen conexión oficial con la bandeja. El estado real, la configuración y los límites por canal están en [bandeja.md](bandeja.md). Google Business Profile y TikTok siguen «Aún no disponible»: sus consultas se registran a mano con canal Google u «Otro».

## Datos seed

- Tres prospectos abiertos: Instagram (cotizado, CDMX), WhatsApp (nuevo, con tarea de seguimiento, CDMX) y Facebook (contactado, MTY).
- Dos cotizaciones: `CDMX-01-COT-00001` con el Lavado manual detallado (450, pago al operador 135) y `MTY-01-COT-00001` (900 / 270).
- El historial de cada prospecto.

## Variables de entorno

Ninguna nueva.

## Pendientes

- Calendario, campañas con UTM y promociones: hechos en la fase 3 ([marketing](marketing.md)).
- Automatizaciones y panel comercial: hechos en la fase 4 ([automatizaciones](automatizaciones.md)).
- Fusión desde móvil. Hoy en móvil se consulta y la fusión se hace en web.
