# Módulo C2 — CRM comercial, recurrencia y próxima visita

## Alcance

CRM operativo por centro, con paridad web y móvil:

- **Ficha comercial:** última visita, visitas, próxima recomendación (servicio, fecha y OS de origen), membresía y valor acumulado (servicios entregados + cobros de membresía).
- **Segmentos:** nuevo, recurrente, miembro, inactivo y contacto B2B.
- **Lista de próxima visita** vencida, próxima (≤ 14 días) o programada, con filtros por centro (o todos mis centros), segmento y búsqueda.
- **Seguimientos (tareas):** llamar, WhatsApp, email, renovar membresía y ofrecer mantenimiento, con fecha, resultado, reprogramación y cancelación con motivo.
- **Consentimiento por canal** (llamada, WhatsApp, SMS, email) respetado en todo momento.

**La plataforma no envía mensajes.** Los seguimientos forman una cola; la persona contacta por fuera (enlaces `tel:`, `wa.me` y `mailto:` sólo para canales aceptados) y registra el resultado. Ver [ADR 0014](../adr/0014-crm-consentimiento-y-cola-de-seguimientos.md).

**Fuera de alcance:** envío por proveedores de mensajería, campañas masivas, puntos y referidos, scoring predictivo.

## Modelo de datos (`20261003000000_crm.sql`)

```
clients 1─* contact_preferences (canal, acepta, origen)          ← sincronizado con clients.marketing_*
clients 1─* crm_tasks *─1 detail_centers
                 ├─ service_orders (OS que originó la recomendación)
                 ├─ memberships (renovación)
                 └─ services (servicio recomendado)
private.customer_order_facts (vista: OS por cliente y centro)
private.crm_rows(centros, hoy, zona, cliente?) → métricas derivadas
```

| Objeto                         | Notas                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contact_preferences`          | Único por cliente y canal. Sólo se escribe con `private.put_contact_preference` (RPC con motivo o trigger de `clients`). `llamada` sólo vive aquí; WhatsApp, SMS y email se reflejan en `clients.marketing_channels`.                  |
| `crm_tasks`                    | Tipo, canal (el tipo fija el canal para llamar/WhatsApp/email), estado `pendiente`/`hecha`/`cancelada`, fecha, origen (`manual`, `os_terminada`, `proxima_visita`, `membresia`), resultado, `dedupe_key` y `request_id`. Sin `delete`. |
| `private.customer_order_facts` | Visitas (OS no canceladas), última visita, valor de OS entregadas y OS B2B por cliente y centro.                                                                                                                                       |

## Reglas

| Regla              | Detalle                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segmento           | Prioridad: **B2B** (cliente empresa u OS B2B) > **miembro** (membresía activa o próxima a vencer) > **inactivo** (última visita hace > 180 días) > **recurrente** (≥ 2 visitas) > **nuevo**. `private.customer_segment` ↔ `customerSegment`.               |
| Próxima visita     | La de la OS no cancelada más reciente con fecha (terminada o, si no, creada; desempate por folio). **Vencida** si ya pasó, **próxima** si faltan ≤ 14 días, si no **programada**. `private.next_visit_state` ↔ `nextVisitState`.                           |
| Valor acumulado    | Σ total de OS **entregadas** + Σ cobros de membresía (altas y renovaciones), en los centros autorizados. Coincide con el histórico transaccional (prueba SQL).                                                                                             |
| OS terminada       | Sin recomendación y con un servicio recurrente → próxima visita = hoy + 30 días, mismo servicio. Con próxima visita → tarea "ofrecer mantenimiento" 3 días antes (no antes de hoy), por el mejor canal aceptado (WhatsApp > llamada > email > presencial). |
| Deduplicación      | Una tarea automática por OS (`os:<id>`) o por periodo de membresía (`mem:<id>:<vence>`). La recomendación más reciente reemplaza la tarea de mantenimiento pendiente anterior del cliente en ese centro.                                                   |
| Generar pendientes | `generate_crm_tasks(centro)` agrega renovaciones (membresías próximas a vencer o vencidas hace ≤ 30 días) y próximas visitas vencidas (≤ 30 días) o cercanas. Idempotente.                                                                                 |
| Consentimiento     | Seguimiento por un canal no aceptado → `MG002`. Retirar un canal cancela sus pendientes ("El cliente retiró el consentimiento"). Presencial siempre permitido.                                                                                             |
| Seguimiento manual | Cliente vinculado al centro activo, fecha de hoy en adelante, idempotente por `request_id`. Completar exige resultado; cancelar y reprogramar exigen motivo.                                                                                               |
| Auditoría          | `private.audit_row` + `require_change_reason` en `contact_preferences` y `crm_tasks` (actor, fecha, valores anteriores/nuevos y motivo).                                                                                                                   |

Umbrales en `private.crm_rule` ↔ `CRM_RULES` (`inactiveDays` 180, `dueSoonDays` 14, `recurrentReturnDays` 30, `taskLeadDays` 3), verificados por la prueba de paridad.

## Permisos

| Capacidad   | Roles                                           | Qué permite                                                    |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `crm.read`  | admin_socio, encargado, operador, comercial_b2b | ver clientes del CRM, ficha y cola del centro                  |
| `crm.write` | admin_socio, encargado, operador, comercial_b2b | crear, completar, reprogramar y cancelar seguimientos; generar |

- El contador no tiene CRM (datos personales).
- Cambiar el consentimiento exige además poder editar al cliente (`private.can_edit_client`).
- `crm_customers` sólo devuelve clientes vinculados a centros donde la persona tiene CRM (`private.can_use_crm`), aunque se pidan otros centros.

## RPC

| RPC                                                                                          | Uso                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `crm_customers(centers[], segment?, due?, query?, limit?, client?)`                          | Lista y ficha con métricas derivadas.                     |
| `set_contact_preference(client, channel, opted_in, source, reason)`                          | Consentimiento por canal.                                 |
| `create_crm_task(center, request, client, kind, channel?, due, notes?, vehicle?, assigned?)` | Seguimiento manual idempotente.                           |
| `complete_crm_task(task, outcome, notes?)`                                                   | Registrar el resultado del contacto.                      |
| `reschedule_crm_task(task, due, reason)` / `cancel_crm_task(task, reason)`                   | Reprogramar o cancelar con motivo.                        |
| `generate_crm_tasks(center)`                                                                 | Renovaciones y próximas visitas pendientes (idempotente). |

Errores: `MG002` → regla visible (sin consentimiento, ya cerrado), `42501` → permiso o cliente no vinculado, `22023` → validación.

## Pantallas

| Web                            | Móvil                                   | Contenido                                                                                      |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/comercial/clientes`          | `CrmCustomersScreen`                    | Filtros por centro / todos mis centros, segmento, próxima visita y búsqueda.                   |
| `/comercial/clientes/[id]`     | `CrmCustomerScreen`                     | KPIs, recomendación con enlace a la OS, consentimiento, contacto manual y seguimientos.        |
| `/comercial/seguimientos`      | `CrmTasksScreen`                        | Cola del centro por estado y vencimiento (vencidas, hoy, próximas 7 días); generar pendientes. |
| `/clientes/[id]`, `/comercial` | `ClientDetailScreen`, `ComercialScreen` | Accesos a la ficha comercial y al CRM.                                                         |

## Datos seed

- José Pérez acepta llamada (además de su consentimiento previo); seguimiento pendiente por WhatsApp.
- Seguimiento "Renovar membresía" para `MEM-000002` de María López (próxima a vencer).

## Variables de entorno

Ninguna nueva.

## Pendientes

- Programar `generate_crm_tasks` (pg_cron o job) cuando se decida la frecuencia; hoy se ejecuta con "Generar pendientes".
- Asignación de seguimientos por persona (`assigned_to` ya existe en la tabla).
- Conector de mensajería que consuma la cola respetando `contact_preferences`.
