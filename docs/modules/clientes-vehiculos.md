# Módulo O1 — Operación / Clientes y vehículos

## Alcance

Expediente operativo cliente–vehículo:

- alta, consulta y edición controlada de clientes, con uno o varios vehículos;
- búsqueda por nombre, teléfono, email o placa;
- centro habitual, última visita e historial cronológico;
- prevención de duplicados con aviso, sin bloqueo ciego;
- consentimiento comercial por canal, preparado para la fase Comercial.

Web (`/clientes`) y móvil (pestaña Operación → Clientes y vehículos) tienen las mismas pantallas y llaman al mismo repositorio.

**Fuera de alcance:**

- órdenes de servicio, membresías y cuentas B2B. Quedan las interfaces para enlazarlas (ver [Integraciones futuras](#integraciones-futuras));
- fusión de clientes duplicados y transferencia de un vehículo a otro cliente.

## Modelo de datos (`20260927000000_clients_vehicles.sql`)

```
organizations 1─* clients 1─* vehicles
                     │ home_detail_center_id (centro habitual)
                     └─* client_centers *─1 detail_centers   (centros donde se ha atendido: visibilidad + última visita)
```

| Tabla            | Clave                                       | Notas                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients`        | `id`, único `(organization_id, request_id)` | Guarda: nombre, teléfono (E.164), email, tipo (`person`/`company`), notas, centro habitual, última visita y consentimiento (`marketing_*`). `search_name` y `phone_digits` son columnas generadas para la búsqueda. |
| `client_centers` | `(client_id, detail_center_id)`             | Centros donde se ha atendido al cliente, con `first_seen_at` y `last_visit_at`. Define quién lo ve.                                                                                                                 |
| `vehicles`       | `id`, único `(organization_id, request_id)` | Guarda: marca, modelo, año, placa normalizada y un identificador opcional (VIN o número económico). La placa y el identificador son **únicos entre los vehículos activos** de la organización.                      |

**Integridad:**

- FKs compuestas `(organization_id, detail_center_id)`: un cliente no puede apuntar a un centro de otra organización.
- Columnas de origen inmutables: organización, `request_id`, centro y usuario de alta, fecha de alta, y el cliente de un vehículo.
- Sin borrado físico: un vehículo se da de baja (`active = false`) con motivo.

**Normalización** (idéntica en SQL, en `packages/domain/src/clients/normalize.ts` y en `packages/validation/src/clients.ts`):

- **Teléfono:** a E.164. 10 dígitos sin `+` se toman como número de México (+52); también se aceptan `52…`, el prefijo móvil anterior `521…` y cualquier número internacional con `+`.
- **Placa e identificador:** mayúsculas, sólo letras y dígitos.
- **Email:** en minúsculas y con forma válida.
- **Nombre:** con espacios simples.

Los casos de prueba son los mismos en `normalize.test.ts` y en `clients_vehicles.test.sql`.

## Seguridad y permisos

| Capacidad       | Roles                                                     | Qué permite                                                          |
| --------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `clients.read`  | admin_socio, encargado, operador_recepcion, comercial_b2b | buscar y ver expedientes vinculados a sus centros                    |
| `clients.write` | admin_socio, encargado, operador_recepcion                | alta, edición, vehículos y vincular un cliente existente a su centro |

El contador **no** ve datos personales de clientes.

**Visibilidad (RLS):** un usuario ve a un cliente si tiene `clients.read` en su centro habitual o en algún centro de `client_centers`. El historial filtra **cada entrada** por su centro, así que un operador de CDMX no ve lo que pasó en Monterrey aunque el cliente sea de ambos. El rol corporativo cuenta en todos los centros de su organización.

**Escrituras (RPC con motivo y auditoría):**

| RPC                                | Qué hace                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_client`                    | Da de alta al cliente y sus vehículos en una transacción, vinculado al centro activo. **Idempotente** por `request_id`. Si hay coincidencias y no se envía `p_duplicate_reason`, devuelve `MG001`.                                                                           |
| `update_client`                    | Edición con motivo. Cambiar el teléfono o el email a los de otro cliente devuelve `MG001` salvo `p_confirm_duplicate`. Cambiar el centro habitual exige permiso en el nuevo centro y lo vincula. Si cambia el consentimiento, se guardan la fecha y el origen (web o móvil). |
| `add_vehicle` / `update_vehicle`   | Alta idempotente de un vehículo. La edición o baja exige motivo.                                                                                                                                                                                                             |
| `link_client_to_center`            | "Usar este cliente" cuando existe en otro centro. Es `security definer`: exige `clients.write` en el centro y que el cliente sea de la misma organización. Queda en la auditoría (`client.linked_to_center`).                                                                |
| `find_client_matches`              | Coincidencias por teléfono, email, placa o identificador **en toda la organización**. Si el cliente no es visible, devuelve el nombre y el teléfono enmascarados (`José P.`, `•••• 5678`).                                                                                   |
| `search_clients`, `client_history` | Lectura (`security invoker`, bajo RLS).                                                                                                                                                                                                                                      |

**Auditoría:**

- Cada fila escrita queda en `audit_log` con actor, fecha, valores anteriores y nuevos, y motivo.
- Confirmar un duplicado registra el evento `client.duplicate_confirmed` con las coincidencias.
- Las escrituras directas por PostgREST fallan con `23514` porque no llevan motivo.

## Duplicados: aviso, no bloqueo ciego

1. Al enviar el alta, la app llama a `find_client_matches` con el teléfono, el email, la placa y el identificador.
2. Si hay coincidencias, muestra el aviso con tres opciones:
   - **Usar este cliente:** si ya es visible desde el centro, abre su expediente;
   - **Vincular a este centro:** si existe en otro centro, lo vincula;
   - **Es otro cliente: registrar de todos modos:** pide el motivo (p. ej. familiares que comparten teléfono).
3. La base vuelve a verificar al registrar (`MG001`). Un candado por organización y teléfono serializa altas simultáneas desde web y móvil.
4. La **placa activa** sí es única: no puede haber dos vehículos activos con la misma placa. Si un auto cambió de dueño, se da de baja en el cliente anterior.

## Web y móvil: el mismo registro

- **Mismo formulario y mismo comando.** Web (server actions) y móvil validan con `newClientFormSchema` y arman el comando con `toCreateClientCommand`. La prueba `validation/src/clients.test.ts` verifica que un formulario capturado con formatos distintos produce el mismo comando.
- **Idempotencia.** Cada formulario lleva una llave (`requestId`), generada al abrirlo: `randomUUID` en el servidor web y `newRequestId()` en móvil. Reintentos, doble envío o una red lenta devuelven el registro ya creado.
- **Mismos textos y presentadores.** `clientsCopy`, `presentSearchResult`, `presentClientDetail` y `presentHistoryEntry` salen de `@meguiars/domain`. Las fechas se muestran en la zona horaria del centro activo.

## Pantallas

| Web               | Móvil                | Contenido                                                                                                                            |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/clientes?q=`    | `ClientsScreen`      | Búsqueda (los clientes del centro activo aparecen primero) y botón de alta. Estados: sin búsqueda, cargando, sin resultados y error. |
| `/clientes/nuevo` | `ClientNewScreen`    | Datos del cliente, consentimiento por canal, primer vehículo y aviso de duplicados.                                                  |
| `/clientes/[id]`  | `ClientDetailScreen` | Centro habitual, última visita, vehículos, historial, agregar o dar de baja vehículos, y edición con motivo.                         |

## Integraciones futuras

- **Órdenes de servicio:**
  - referenciarán `clients(id)` y `vehicles(id)`, con FK compuesta por organización;
  - registrarán visitas con `private.register_client_visit(client, center, at)`, que actualiza la última visita global y por centro;
  - agregarán sus entradas (`kind = 'service_order'`) a `client_history`.
- **Membresías:** referenciarán `clients(id)`.
- **B2B:** `clients.kind = 'company'` identifica flotillas. La cuenta B2B se enlazará al cliente.
- **Comercial:** usará `marketing_opt_in`, `marketing_channels` y la fecha y origen del último cambio. Sólo se contacta por los canales aceptados.

## Datos seed

`supabase/seed.sql` agrega tres clientes a la organización demo:

- **José Pérez:** atendido en CDMX y Monterrey, acepta promociones por WhatsApp;
- **Transportes del Norte:** flotilla de Monterrey con dos camionetas;
- **María López:** de CDMX.

## Variables de entorno

Ninguna nueva.

## Pruebas

- **SQL** (`supabase/tests/clients_vehicles.test.sql`), 63 aserciones:
  - normalización;
  - alta idempotente;
  - duplicados (aviso, enmascarado, confirmación con motivo);
  - vinculación entre centros;
  - placa única entre vehículos activos;
  - búsqueda (placa parcial, últimos 4 dígitos, nombre sin acentos, sin comodines);
  - edición con motivo, consentimiento y auditoría;
  - escrituras directas bloqueadas;
  - permisos por rol (operador, comercial B2B, contador, corporativo, otra organización);
  - historial por centro;
  - registro de visitas.
- **Unitarias:**
  - normalización y reglas (`domain/src/clients/*.test.ts`);
  - presentadores con zona horaria;
  - esquemas y paridad web/móvil (`validation/src/clients.test.ts`);
  - adaptador (`supabase/src/repositories/clients.test.ts`);
  - navegación por rol.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 15 comprobaciones:
  - navegación;
  - búsqueda que respeta los centros;
  - validaciones;
  - aviso de duplicado enmascarado;
  - alta con confirmación e idempotencia;
  - búsqueda por placa, teléfono y nombre;
  - edición con motivo;
  - vehículos (placa en uso, baja con motivo);
  - historial;
  - vincular un cliente de otro centro;
  - vista de móvil sin scroll horizontal;
  - contador sin acceso.
