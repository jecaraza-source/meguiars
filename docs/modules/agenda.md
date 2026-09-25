# Módulo O3 — Operación / Agenda, bahías y capacidad

## Alcance

Citas y capacidad de atención por centro, sin sobreasignar bahías ni técnicos y con una operación simple:

- **agenda por día y centro:** lista por hora, filtros por estatus, bahía y técnico, y un resumen por estatus;
- **cita:** cliente, vehículo, uno o más servicios del catálogo, hora, duración estimada, bahía y técnico opcionales, notas y estatus;
- **estatus:** `programada`, `recibida`, `en_servicio`, `terminada`, `entregada`, `cancelada` y `no_show`, con transiciones válidas;
- **conflictos:** una bahía o un técnico no pueden tener dos citas activas en el mismo intervalo, salvo un override autorizado y auditado;
- **walk-in:** llegada sin cita, que entra como "recibida";
- **recepción:** la cita genera el borrador de la Orden de Servicio sin recapturar cliente ni vehículo;
- **móvil:** vista diaria para operar, con acción rápida del siguiente estatus en cada tarjeta.

**Fuera de alcance:**

- **La Orden de Servicio misma:** llegó en O4 ([orden-servicio.md](orden-servicio.md)); la cita recibida abre su OS.
- **Horarios de apertura y % de ocupación:** se requiere el horario de cada centro para definir el KPI (ver [Pendientes](#pendientes)).
- **Recordatorios al cliente.**

## Modelo de datos (`20260929000000_agenda.sql`)

```
detail_centers 1─* bays
               1─* technicians            (referencia simple; profile_id opcional si usa la app)
               1─* appointments *─1 clients / vehicles (O1)
                        1─* appointment_services *─1 services (O2)
                        └─ service_order_id (→ OS, módulo futuro)
```

| Tabla                  | Notas                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bays`                 | Por centro, con nombre único en el centro y `active`.                                                                                                                                                                      |
| `technicians`          | Por centro, con `active`.                                                                                                                                                                                                  |
| `appointments`         | `starts_at` (UTC), `duration_minutes` y `ends_at` (calculado por trigger), `bay_id` y `technician_id` opcionales, `status`, `is_walk_in`, `conflict_override`, sellos de tiempo por estatus y `request_id` (idempotencia). |
| `appointment_services` | Servicios de la cita, con su duración estándar al agendar. **No** guarda precio: el precio lo congela la OS (ADR 0009).                                                                                                    |

**Integridad:**

- FKs compuestas por organización y centro: una cita sólo usa bahías, técnicos, clientes, vehículos y servicios de su organización y centro.
- **Conflictos:** hay dos _exclusion constraints_ con `btree_gist` sobre `tstzrange(starts_at, ends_at)`, uno por bahía y otro por técnico. Sólo cuentan las citas activas (`programada`, `recibida`, `en_servicio`) y sin override. Una cita que empieza justo cuando termina otra no es conflicto.

## Reglas

| Regla                   | Dónde                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transiciones de estatus | `programada → recibida \| cancelada \| no_show`, `recibida → en_servicio \| cancelada`, `en_servicio → terminada`, `terminada → entregada`. SQL (`private.appointment_transition_allowed`) y dominio (`APPOINTMENT_TRANSITIONS`). `schema-parity.test.ts` compara ambas. |
| Motivo obligatorio      | Cancelar, no se presentó, reprogramar u override.                                                                                                                                                                                                                        |
| Reprogramar o reasignar | Sólo citas `programada` o `recibida`.                                                                                                                                                                                                                                    |
| Duración                | La indicada o, si falta, la suma de las duraciones estándar del catálogo.                                                                                                                                                                                                |
| Override de conflicto   | Sólo encargado o admin, y sólo si hay conflicto real. Un override "por si acaso" no marca la cita, así que sigue protegida. Queda en `audit_log` (`appointment.conflict_override`) con actor y motivo.                                                                   |
| Recibir                 | Registra la visita del cliente (O1: `last_visit_at`).                                                                                                                                                                                                                    |
| Walk-in                 | Entra como `recibida`, a la hora actual.                                                                                                                                                                                                                                 |
| Idempotencia            | `request_id`: el mismo formulario enviado dos veces, o desde web y móvil, crea una sola cita.                                                                                                                                                                            |

## Zona horaria

- En la base todo está en **UTC**.
- **Día de la agenda:** `list_appointments(center, day)` toma el día **en la zona del centro**. Por ejemplo, una cita a las 23:30 en Ciudad de México (05:30 UTC del día siguiente) aparece en el día correcto.
- **Captura:** fecha y hora se capturan en la hora del centro. `zonedToUtc` en `packages/domain/src/agenda/zoned-time.ts` las convierte a UTC con `Intl`, sin dependencias, y respeta el horario de verano donde aplica. Web y móvil usan la misma función a través de `toCreateAppointmentCommand`.
- **Hoy:** es el día en la zona del centro, no la del teléfono ni la del navegador.

## Permisos

| Capacidad       | Roles                            | Qué permite                                           |
| --------------- | -------------------------------- | ----------------------------------------------------- |
| `agenda.read`   | admin_socio, encargado, operador | ver la agenda del centro                              |
| `agenda.write`  | admin_socio, encargado, operador | agendar, walk-in, estatus, reprogramar                |
| `agenda.manage` | admin_socio, encargado           | bahías y técnicos; autorizar un override de conflicto |

- Contador y comercial B2B no ven la agenda, porque son datos operativos.
- RLS: `private.can_use_agenda` y `private.can_manage_agenda`.
- Sin borrado físico: una cita se cancela y un recurso se desactiva.

## RPC

| RPC                                       | Uso                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_appointment`                      | Cita o walk-in. Valida cliente, vehículo del cliente, recursos del centro y servicios disponibles; vincula al cliente con el centro. Si hay conflicto devuelve `23P01`, salvo override autorizado. |
| `update_appointment`                      | Reprogramar o reasignar, con motivo; mismas reglas de conflicto.                                                                                                                                   |
| `set_appointment_status`                  | Transición válida con sello de tiempo.                                                                                                                                                             |
| `list_appointments(center, day, filtros)` | Agenda del día del centro.                                                                                                                                                                         |
| `appointment_order_draft(id)`             | Borrador de OS: cliente, vehículo y servicios de la cita con el precio vigente del centro, para congelar al crear la OS.                                                                           |
| `upsert_bay` / `upsert_technician`        | Alta, cambio y activación de recursos.                                                                                                                                                             |

## Pantallas

| Web             | Móvil                     | Contenido                                                                                                                                                                                                    |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/agenda`       | `AgendaScreen`            | Día del centro (anterior, siguiente, hoy), filtros, resumen por estatus, tarjetas por hora y recursos (encargado/admin). En móvil, cada tarjeta tiene un botón con el siguiente estatus.                     |
| `/agenda/nueva` | `AppointmentNewScreen`    | Buscar y elegir cliente, y luego vehículo, servicios, fecha y hora, duración, bahía, técnico y notas. El override sólo aparece ante un conflicto y para encargado/admin. Con `?walkin=1`, sin fecha ni hora. |
| `/agenda/[id]`  | `AppointmentDetailScreen` | Estatus y acciones (motivo para cancelar o no_show), borrador de OS al recibir, y reprogramación.                                                                                                            |

## Datos seed

Cada centro tiene dos bahías y un técnico. Hay 3 citas **hoy**, en la hora local de cada centro: dos en CDMX y una en Monterrey.

## Variables de entorno

Ninguna nueva.

## Pruebas

- **SQL** (`supabase/tests/agenda.test.sql`), 39 aserciones:
  - recursos y permisos;
  - duración por catálogo;
  - idempotencia;
  - zona horaria del día;
  - validaciones de vehículo y servicios;
  - conflicto de bahía y de técnico, citas contiguas y otra bahía;
  - override sólo con encargado, sólo con conflicto real y auditado;
  - transiciones y motivo para cancelar;
  - registro de visita;
  - borrador de OS;
  - walk-in;
  - reprogramación con motivo y conflicto;
  - otro centro y contador sin acceso;
  - escrituras directas y borrado bloqueados.
- **Unitarias:**
  - zona horaria, incluido horario de verano, transiciones, acciones y presentadores (`domain/src/agenda/agenda.test.ts`);
  - formularios web y móvil que producen la misma cita en UTC (`validation/src/agenda.test.ts`);
  - adaptador;
  - paridad del enum y de las transiciones entre SQL y dominio.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 13 comprobaciones:
  - agenda vacía;
  - validaciones;
  - hora del centro a UTC;
  - duración por catálogo;
  - conflicto (el operador no puede encimar);
  - override del encargado;
  - resumen y filtro;
  - recepción con borrador de OS;
  - flujo completo de estatus;
  - cancelar con motivo;
  - walk-in;
  - reprogramar con motivo;
  - vista de móvil;
  - contador sin acceso.

## Pendientes

- **Horario de apertura por centro:** permitiría el KPI de ocupación (minutos agendados entre minutos disponibles por bahía) con una sola definición en `packages/analytics`.
- **Selectores de fecha y hora nativos en móvil:** hoy son campos de texto AAAA-MM-DD y HH:MM, sin dependencias nuevas.
