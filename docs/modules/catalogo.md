# Módulo O2 — Operación / Catálogo de servicios, precios y motores

## Alcance

El catálogo homologado define **qué se vende, cuánto cuesta, cuánto dura y a qué motor de ingreso pertenece**. Incluye:

- CRUD de servicios sólo para roles autorizados, sin borrado físico: un servicio se desactiva;
- disponibilidad por centro, con precio y costo propios opcionales, porque cada centro es un centro de costos independiente;
- clasificación obligatoria por motor: `recurrente`, `valor_medio`, `premium`, `producto_complemento` y `membresia`;
- historial de cambios de precio y costo, más auditoría de cada cambio;
- un catálogo filtrable por centro y motor.

Web (`/catalogo`) y móvil (pestaña Operación → Catálogo) consumen el mismo catálogo.

**Fuera de alcance:**

- **Variantes de precio por tamaño o tipo de vehículo:** `vehicles` todavía no tiene tamaño, y el prompt pide modelarlas sólo si es simple. Ver [Pendientes](#pendientes).
- **Paquetes y combos.**
- **Órdenes de servicio:** se definió su contrato de precio congelado (ver [Precios históricos y OS](#precios-históricos-y-os)).

## Modelo de datos (`20260928000000_service_catalog.sql`)

```
organizations 1─* services 1─* service_center_config *─1 detail_centers
                     └─* service_price_history (base: detail_center_id null · centro: con detail_center_id)
```

| Tabla                   | Contenido                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `services`              | Servicio homologado de la organización: clave única (`code`), nombre, descripción, `revenue_engine` (enum obligatorio), duración estándar en minutos (5 a 1440), precio base y costo directo estándar en MXN con IVA incluido, y `active`. |
| `service_center_config` | Una fila por centro y servicio: `available`, `price_override` y `direct_cost_override`. **Sin fila**, el servicio está disponible con los valores base. Un override en `null` también usa el valor base.                                   |
| `service_price_history` | Append-only. Los triggers la escriben con cada alta o cambio de precio o costo, base o del centro, junto con el motivo. Nadie la escribe directamente.                                                                                     |

**Integridad:**

- FKs compuestas `(organization_id, …)`: un centro sólo configura servicios de su organización.
- La clave y la organización de un servicio son inmutables.
- No hay `DELETE` para `authenticated`.

**Índices:**

- `services (organization_id, active, revenue_engine)`;
- `service_center_config (detail_center_id, available)` y `(service_id)`;
- `service_price_history (service_id, detail_center_id, valid_from desc)`.

## Permisos

| Acción                                                         | Quién                                  | Dónde se aplica                         |
| -------------------------------------------------------------- | -------------------------------------- | --------------------------------------- |
| Consultar catálogo e historial (`catalog.read`)                | todos los roles de la organización     | RLS `services_select`, `center_catalog` |
| Crear o editar servicios homologados, precio base y desactivar | **admin_socio corporativo**            | RLS `services_insert/update`            |
| Disponibilidad, precio y costo del centro (`catalog.manage`)   | admin_socio del centro (o corporativo) | `private.can_manage_center_catalog`     |

- Encargado, operador, comercial y contador consultan.
- El contador ve el catálogo por los costos y márgenes, pero no la operación del día.
- Los valores propios de un centro, y su historial, sólo los ven los usuarios con rol en ese centro.

## RPC

| RPC                                                  | Qué hace                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_service`                                     | Alta con clave normalizada a mayúsculas. Una clave repetida en la organización devuelve `23505`.                                                                              |
| `update_service`                                     | Edición de datos homologados, precio y costo base, y activación o desactivación. **Motivo obligatorio.**                                                                      |
| `set_service_center_config`                          | Disponibilidad y valores propios del centro. Un importe vacío vuelve al valor base. **Motivo obligatorio.**                                                                   |
| `center_catalog(center, engine?, include_inactive?)` | Catálogo efectivo del centro: precio y costo vigentes, origen (`base` o `center`) y disponibilidad. Por defecto sólo lo vendible, es decir, activo y disponible en el centro. |
| `service_price_at(service, center, at?)`             | Precio y costo vigentes en un instante: los del centro si los tenía en ese momento; si no, los base.                                                                          |

Toda escritura queda en `audit_log` con actor, fecha, valores anteriores y nuevos, y motivo. La prueba verifica un cambio de precio de 250 a 300. Las escrituras directas fallan con `23514` porque no llevan motivo.

## Precios históricos y OS

**Contrato para el módulo de Órdenes de Servicio:**

- **Al vender**, la OS copia a su línea el precio, el costo, la duración, la clave y el motor vigentes en el centro. Usa `FrozenServiceLine` y `freezeServiceLine()` de `@meguiars/domain`, a partir de `center_catalog`.
- **Después**, la OS nunca vuelve a leer el precio del catálogo. Por eso **cambiar el precio actual no altera OS históricas**. La prueba SQL lo verifica con una línea de OS simulada.
- **Auditoría:** `service_price_at` permite reconstruir el precio vigente en cualquier fecha, por ejemplo para revisar un cobro pasado.

## Margen estándar (definición única)

`standardMargin(precio, costo)` en `packages/domain/src/catalog/presenter.ts`:

- **monto** = precio − costo directo estándar;
- **porcentaje** = monto / precio, con un decimal;
- con precio 0, el porcentaje es 0.

Web y móvil usan esa misma función. El KPI de margen real se calculará con las OS en su módulo.

## Pantallas

| Web               | Móvil                 | Contenido                                                                                                                                |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/catalogo`       | `CatalogScreen`       | Catálogo del centro activo, filtro por motor e inactivos, y botón de alta (sólo admin corporativo).                                      |
| `/catalogo/nuevo` | `CatalogNewScreen`    | Alta de un servicio homologado.                                                                                                          |
| `/catalogo/[id]`  | `CatalogDetailScreen` | KPIs (motor, duración, precio vigente, margen), historial de precio y costo, configuración del centro y datos homologados, según el rol. |

## Datos seed

La organización demo tiene 7 servicios que cubren los 5 motores. Monterrey tiene precio propio en el lavado exprés (220 en lugar de 250) y no ofrece el recubrimiento cerámico.

## Variables de entorno

Ninguna nueva.

## Pruebas

- **SQL** (`supabase/tests/service_catalog.test.sql`), 42 aserciones:
  - alta normalizada;
  - clave única;
  - motor, duración y precio obligatorios;
  - permisos por rol (corporativo, admin de centro, encargado, operador, contador, otra organización);
  - disponibilidad y precio por centro;
  - filtro por motor;
  - escrituras directas bloqueadas;
  - historial sin escritura directa;
  - línea de OS con precio congelado;
  - `service_price_at` en el pasado y hoy;
  - vuelta al precio base;
  - auditoría;
  - desactivación sin borrado;
  - clave inmutable;
  - índices.
- **Unitarias:**
  - margen, formatos, presentadores, `freezeServiceLine` y permisos (`domain/src/catalog/catalog.test.ts`);
  - esquemas y paridad del formulario web (texto) y móvil (números) (`validation/src/catalog.test.ts`);
  - adaptador (`supabase/src/repositories/catalog.test.ts`);
  - paridad del enum `revenue_engine`;
  - navegación por rol.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 12 comprobaciones:
  - consulta y filtro por motor;
  - detalle sin edición para el operador;
  - precio del centro con motivo y en el historial;
  - no disponibilidad;
  - alta sólo para el corporativo;
  - validaciones;
  - clave repetida;
  - cambio de precio base con historial;
  - desactivación;
  - contador;
  - vista de móvil.

## Pendientes

- **Precios por tamaño de vehículo:** agregar `vehicles.size` (chico, mediano, grande o XL) y una tabla `service_size_prices (service_id, size, price, direct_cost)` con el mismo historial. Conviene decidirlo con el módulo de OS.
- **Moneda:** todo está en MXN. Otra moneda requeriría una columna `currency` por organización.
