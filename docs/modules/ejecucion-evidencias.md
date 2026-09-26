# Módulo O5 — Operación / Ejecución, evidencias y consumos

## Alcance

Registrar **qué se hizo, quién lo hizo, cuánto tardó, con qué fotos y cuánto insumo se usó** en cada OS, desde el piso (móvil primero) y desde la web.

- **Avance por línea:** iniciar, pausar, reanudar y terminar cada línea de la OS, con técnico y nota. El tiempo real lo calcula la base (nunca el reloj del dispositivo) y nunca es negativo.
- **Técnicos participantes** de la OS; el técnico principal siempre está incluido.
- **Evidencias fotográficas** antes, durante, después y de incidencias, con nota y línea opcional. Se guardan en un bucket **privado** de Supabase Storage y se ven con **URL firmadas** de 10 minutos.
- **Consumo estándar vs. real de insumos**, sólo en servicios con insumos configurados. Estándar y costo se congelan al registrar.
- **Incidencias y retrabajos** básicos: reportar y resolver con descripción.
- **Bitácora de ejecución** (`service_order_events`): de solo anexar, auditable.

**Fuera de alcance:** existencias, almacenes, entradas y salidas, lotes y compras (WMS). `inventory_items` es sólo un catálogo mínimo (clave, nombre, unidad y costo) para valorizar el consumo. Tampoco incluye video, anotaciones sobre la foto ni evidencias firmadas por el cliente.

## Modelo de datos (`20261001000000_execution_evidence.sql`)

```
service_orders 1─* service_order_items (+ work_status, started_at, finished_at, work_started_at, worked_minutes, technician_id)
      │                    └─* service_order_consumptions *─1 inventory_items
      ├─* service_order_staff (técnicos)                        └─* service_supply_standards *─1 services
      ├─* service_order_events (bitácora, solo anexar)
      ├─* service_order_evidence ──> storage.objects (bucket service-order-evidence)
      └─* service_order_incidents (incidencia | retrabajo)
```

| Tabla                        | Notas                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_order_items`        | Enum `item_work_status` (`pendiente`, `en_proceso`, `pausada`, `terminada`); `worked_minutes ≥ 0`; checks de fechas y de "en proceso ⇔ tramo abierto".        |
| `service_order_staff`        | PK (OS, técnico); técnicos del mismo centro (FK compuesta).                                                                                                   |
| `service_order_events`       | 14 tipos (`os_inicio` … `incidencia_resuelta`), línea y técnico opcionales, nota, actor y `clock_timestamp()`. Lo escribe `private.log_order_event`.          |
| `service_order_evidence`     | `kind`, `storage_path` único con prefijo `<org>/<centro>/<OS>/`, tipo (jpeg/png/webp), tamaño ≤ 5 MiB, dimensiones, nota. Se retira con motivo (soft delete). |
| `inventory_items`            | Por organización: clave única, nombre, unidad (`ml`, `l`, `g`, `kg`, `pza`), costo por unidad (4 decimales) y activo.                                         |
| `service_supply_standards`   | Cantidad estándar por **unidad** del servicio.                                                                                                                |
| `service_order_consumptions` | Una fila por línea e insumo: estándar (estándar × cantidad de la línea), real, unidad y costo congelados.                                                     |
| `service_order_incidents`    | `incidencia` o `retrabajo`, descripción, estatus `abierta`/`resuelta` y solución.                                                                             |

## Reglas

| Regla              | Detalle                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transiciones línea | `pendiente → en_proceso`, `en_proceso → pausada \| terminada`, `pausada → en_proceso \| terminada` (SQL y dominio; `schema-parity.test.ts` las compara).                                 |
| Cuándo             | Las líneas se trabajan sólo con la OS **en proceso**. Pausar la OS pausa sus líneas en curso; terminarla termina las iniciadas (trigger, con evento).                                    |
| Tiempo real        | `private.elapsed_minutes` con `greatest(0, …)` y `check (worked_minutes ≥ 0)`: un reloj adelantado cuenta 0, nunca negativo.                                                             |
| Evidencia          | Mientras la OS no esté entregada ni cancelada. Primero se sube el archivo y luego se registra (idempotente por ruta); retirar exige motivo y **conserva el archivo**.                    |
| Consumo            | OS en proceso, pausada o terminada; sólo insumos configurados para el servicio; cantidad ≥ 0 (3 decimales). Volver a registrar actualiza el real, no el estándar ni el costo congelados. |
| Variación          | `consumptionVariance`: real − estándar, % sobre el estándar y costo (definición única en dominio).                                                                                       |
| Auditoría          | Triggers `private.audit_row` en todas las tablas nuevas (actor, fecha, valores anteriores y nuevos, motivo) más la bitácora de eventos. Sin `delete` para `authenticated`.               |

## Storage (ADR 0012)

- Bucket `service-order-evidence`: **privado**, 5 MiB, `image/jpeg|png|webp`.
- Ruta: `<organización>/<centro>/<OS>/<uuid>.<ext>` (`evidencePath`). El uuid lo genera el cliente: un reintento reusa la ruta y no duplica.
- Políticas de `storage.objects` alineadas con la RLS: `private.can_read_order_evidence(name)` (select) y `private.can_upload_order_evidence(name)` (insert; OS abierta hasta terminada, del centro de la ruta y con `can_use_orders`). Sin `update` ni `delete`.
- Lectura sólo con `createSignedUrls` (TTL 600 s). Nunca URL públicas ni `service_role` en clientes.

## Fotos: tamaño y compresión

Mismas reglas en web y móvil (`EVIDENCE_MAX_DIMENSION = 1600`, `EVIDENCE_JPEG_QUALITY = 0.7`, `targetImageSize`):

- **Móvil:** `expo-image-picker` (cámara primero, galería como alternativa) → `expo-image-manipulator` redimensiona y guarda JPEG 70 % → sube `ArrayBuffer` con la sesión del usuario.
- **Web:** `<input type="file" capture="environment">`; el navegador redimensiona con `createImageBitmap` + canvas (respeta EXIF) y envía el JPEG a una Server Action, que lo sube con la sesión del usuario (`bodySizeLimit: 6mb`). El servidor toma tipo y tamaño del archivo recibido, no de lo que declare el cliente.

Una foto de 12 MP (4000×3000) queda en 1600×1200 y ~80–400 KB.

## Permisos

| Capacidad         | Roles                            | Qué permite                                                          |
| ----------------- | -------------------------------- | -------------------------------------------------------------------- |
| `orders.read`     | admin_socio, encargado, operador | ver la ejecución, fotos, consumos, incidencias y bitácora del centro |
| `orders.write`    | admin_socio, encargado, operador | trabajar líneas, técnicos, fotos, consumos e incidencias             |
| `catalog.read`    | todos los roles del centro       | consultar insumos y estándares                                       |
| admin corporativo | admin_socio corporativo          | alta/edición de insumos y estándares por servicio (con motivo)       |

El contador y el comercial B2B no ven la ejecución (mismo criterio que la OS). Un usuario del centro B no lee ni sube fotos de una OS del centro A (pruebas SQL con `storage.objects`).

## RPC

| RPC                                                                           | Uso                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `set_service_order_item_work(item, status, technician?, note?)`               | Iniciar, pausar, reanudar o terminar una línea.              |
| `set_service_order_staff(order, technician_ids[])`                            | Técnicos participantes (incluye siempre al principal).       |
| `register_service_order_evidence(order, path, kind, type, size, …)`           | Registrar la foto ya subida (verifica que el objeto exista). |
| `remove_service_order_evidence(evidence, reason)`                             | Retirar con motivo; el archivo se conserva.                  |
| `record_service_order_consumption(item, inventory_item, actual, note?)`       | Consumo real vs. estándar congelado.                         |
| `report_service_order_incident` / `resolve_service_order_incident`            | Incidencia o retrabajo.                                      |
| `upsert_inventory_item` / `set_service_supply_standard(quantity null=quitar)` | Catálogo mínimo de insumos y estándares (admin corporativo). |

Las RPC de ejecución bloquean la OS (`private.lock_order_for_execution`) sin exigir `version`: son acciones de piso que no deben chocar con ediciones de recepción.

## Pantallas

| Web                       | Móvil                  | Contenido                                                                                                                           |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/ordenes/[id]/ejecucion` | `OrderExecutionScreen` | Líneas con acciones y técnico, técnicos, fotos (captura y galería), consumos, incidencias y bitácora. En móvil, la foto va primero. |
| `/catalogo/insumos`       | `SuppliesScreen`       | Insumos (consulta; alta y edición para el admin corporativo).                                                                       |
| `/catalogo/[id]`          | `CatalogDetailScreen`  | Tarjeta "Insumos estándar por unidad".                                                                                              |
| `/ordenes/[id]`           | `OrderDetailScreen`    | Botón "Ejecución y evidencias".                                                                                                     |

## Datos seed

- Insumos `SHP-NEU`, `CERA-LIQ`, `LIMP-VEST` y 4 estándares.
- Técnico Luis Gómez; `CDMX-01-000001` con dos técnicos, una línea en proceso y consumo 300 ml vs. 250 ml estándar.

## Dependencias

- `expo-image-picker` y `expo-image-manipulator` (SDK 57): cámara/galería y redimensionado nativo. Sin alternativa sin dependencias en Expo; ambos son módulos oficiales.
- Web: ninguna (canvas del navegador).

## Variables de entorno

Ninguna nueva. El bucket se crea en la migración.
