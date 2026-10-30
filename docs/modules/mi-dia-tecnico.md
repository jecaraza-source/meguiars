# «Mi día» del técnico / lavador

## Para qué

Una pantalla muy sencilla para quien lava o detalla el auto. Ve sólo lo que tiene asignado y lo marca con botones grandes, sin entrar a la Orden de Servicio completa:

- **Agenda del día** (Hoy / Mañana): autos por trabajar, terminados de hoy y citas asignadas cuyo auto aún no llega.
- **Por auto:** vehículo y placas, hora (o hora de entrega prometida), bahía, folio, indicaciones de recepción y avance («1 de 2 servicios»).
- **Por servicio:** **Empezar** y **Trabajo terminado**. «Trabajo terminado» también funciona si no se tocó «Empezar».
- **Foto antes / Foto después** con la cámara (app móvil). Se comprimen igual que en la OS (lado mayor 1600 px, JPEG 70 %).
- **Comentario** (p. ej. «tiene un rayón en la puerta») y **Reportar problema** (llega a recepción como incidencia abierta).
- Cuando termina el último servicio, la OS queda **terminada** y recepción la entrega al cliente.

No ve precios, costos, datos de contacto del cliente, catálogo ni indicadores.

## Rol `tecnico`

| Regla                    | Cómo se cumple                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rol nuevo                | `tecnico` («Técnico / lavador») en `app_role`, sólo de centro (`role_assignments_not_tecnico`). Capacidades: `center.read` y `work.mine`.                                                                                                             |
| Sin acceso genérico      | `has_center_role(centro)` y `has_org_role(org)` **sin lista de roles** ya no cuentan al técnico. Así no lee catálogo (costos), clientes, OS, indicadores, tableros ni datos del asistente, aunque esas políticas usen «cualquier rol del centro».     |
| Ve su centro             | Las políticas de `detail_centers` y `organizations` y `set_active_center` lo aceptan con `is_center_technician`, para elegir centro en la app.                                                                                                        |
| Entra directo a «Mi día» | `landingScreen` (dominio): sin `operations.read` y con `work.mine`, el inicio es «Mi día» (web redirige `/` → `/mi-dia`; móvil lo abre). «Mi centro» no aparece en su menú.                                                                           |
| Sólo su trabajo          | Las RPC `my_work_*` son security definer y exigen que la OS esté asignada al técnico de la sesión (`can_work_on_order`): técnico de la OS, participante, técnico de un servicio o de la cita ligada. Las RPC generales de OS siguen cerradas para él. |
| Mismas reglas de la OS   | `my_work_*` llaman a las RPC de ejecución existentes (`set_service_order_status`, `set_service_order_item_work`, `register_service_order_evidence`, `report_service_order_incident`): transiciones, tiempos, bitácora y auditoría son los mismos.     |
| Fotos                    | La política de Storage del bucket `service-order-evidence` también deja subir y ver al técnico asignado; la ruta sigue siendo `<org>/<centro>/<OS>/<archivo>`.                                                                                        |
| Bitácora                 | Nuevo evento `comentario`. Inicio, fin, fotos y problemas quedan a nombre del técnico (`actor_id`).                                                                                                                                                   |

## Puesta en marcha

1. **Usuario:** Equipo → Usuarios → alta con rol «Técnico / lavador» en su centro.
2. **Ligarlo:** Agenda → «Técnicos y su usuario («Mi día»)» (encargado o admin): elegir el usuario de cada técnico y un motivo. Un usuario sólo se liga a un técnico por centro. Para quitar el acceso, «Sin usuario».
3. **Asignar trabajo:** el técnico de la OS o de la cita, los participantes de la OS o el técnico de un servicio. La OS aparece en «Mi día» desde que está **autorizada**.

Un usuario con otro rol (p. ej. recepción) también puede estar ligado a un técnico; las RPC lo permiten, pero la pantalla «Mi día» sólo aparece en el menú del rol técnico.

## Qué ve cada día

`public.my_work(centro, día)`:

- **OS** asignadas en estado autorizada, en proceso o pausada, programadas (cita, hora prometida o alta) para ese día o antes, si el día es hoy; para mañana, sólo las de mañana.
- **OS terminadas** ese día (para ver lo hecho y agregar la foto de después).
- **Citas** asignadas a él, programadas o recibidas, sin OS todavía.

## Web y móvil

| Función                             | Móvil (`MyWorkScreen`) | Web (`/mi-dia`)          |
| ----------------------------------- | ---------------------- | ------------------------ |
| Hoy / Mañana, avance e indicaciones | Sí                     | Sí                       |
| Empezar / Trabajo terminado         | Sí                     | Sí                       |
| Comentario y reportar problema      | Sí                     | Sí                       |
| Foto antes / después                | Sí (cámara)            | No: se toman con la app  |
| Ligar técnico ↔ usuario             | No                     | Agenda (encargado/admin) |

## Modelo de datos (`20261029000000_technician_role.sql`, `20261029000100_technician_work.sql`)

| Objeto                                                                                                                   | Para qué                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `app_role` + `tecnico`                                                                                                   | Rol de centro (archivo propio: un valor de enum no se usa en su misma transacción). |
| `technicians_center_profile_key`                                                                                         | Un usuario ligado a un solo técnico por centro.                                     |
| `private.my_technician_id`, `private.can_work_on_order`                                                                  | Técnico de la sesión y asignación de la OS.                                         |
| `public.center_technician_users`, `link_technician_user`                                                                 | Usuarios del centro y vínculo con motivo (auditoría).                               |
| `public.my_work`, `my_work_start`, `my_work_done`, `my_work_note`, `my_work_register_evidence`, `my_work_report_problem` | «Mi día».                                                                           |
| `service_order_events.kind` + `comentario`                                                                               | Comentarios del técnico.                                                            |

## Pruebas

- `supabase/tests/technician_work.test.sql` (46 aserciones): técnico sin rol corporativo; ve su centro y organización pero no catálogo, clientes, OS ni técnicos; centro activo; sin vínculo no hay «Mi día»; sólo encargado/admin ligan, sólo usuarios del centro, uno por centro, con auditoría; OS abierta no aparece; cita de hoy y de mañana; sin precios ni contacto; no trabaja OS ajenas ni de otro centro; las RPC generales siguen cerradas; empezar inicia la OS a su nombre (bitácora e historial) y es idempotente; comentario validado; foto en Storage sólo en sus OS; problema; trabajo realizado sin empezar; el último servicio termina la OS; recepción ve todo; participante ve la OS; al desligarlo pierde el acceso.
- Dominio (`work.test.ts`, `roles.test.ts`, `navigation.test.ts`), validación (`work.test.ts`), repositorio (`work.test.ts`) y paridad SQL ↔ TypeScript (roles agregados con `alter type`, eventos vigentes, RPC tipadas).

## Pendientes

- Probarlo en el piloto con los lavadores (tamaño de botones, cámara en sus teléfonos).
- Tomar fotos desde la web (hoy sólo móvil).
- Notificación al técnico cuando le asignan un auto.

## Mi semana (pago lunes–domingo)

Los cortes de los operadores van de lunes a domingo (día del centro) y se pagan el martes siguiente. La pestaña **Mi semana** (web `/mi-dia?vista=semana`, móvil «Mi semana») muestra cada servicio que el técnico terminó en la semana, agrupado por día, con su pago, el total y el día de pago. Se puede ver la semana pasada.

- Fuente: `public.my_work_week(centro, día)` (migración `20261110000000`). Suma `service_order_items.operator_commission_amount` de las líneas del técnico ligado al usuario (`technician_id`), terminadas en la semana y sin OS canceladas. La comisión se congela en la línea al agregar el servicio (ADR 0026).
- El operador ve su pago, no el precio al cliente ni la venta del centro. Un técnico no ve la semana de otro.
- Presentación compartida: `presentMyWorkWeek` y `weekdayLabel` (`packages/domain/src/work/work.ts`).
- En «Hoy», lo pendiente va arriba con los botones grandes y lo terminado en una lista corta (con «Foto después» mientras la OS no se entrega).
