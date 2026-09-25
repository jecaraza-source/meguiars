# ADR 0009 — Catálogo homologado con valores por centro y precios congelados en la OS

- Estado: aceptado
- Fecha: 2026-09-28

## Contexto

El catálogo tiene que ser **homologado**: los mismos servicios, claves y motores de ingreso en toda la organización. Pero cada centro es un centro de costos independiente y puede cobrar o costear distinto. Además, cambiar un precio nunca debe alterar las ventas pasadas.

## Decisión

1. **`services` pertenece a la organización.** Es la excepción de tenancy que ya prevé el ADR 0008 para los catálogos. `service_center_config` (con `detail_center_id`) guarda la disponibilidad y el precio y costo propios del centro. Sin fila, rige el valor base.
2. **Historial append-only por trigger** (`service_price_history`), con el motivo de cada cambio. `service_price_at()` reconstruye el precio vigente en cualquier fecha.
3. **La OS congela** precio, costo, duración y motor en su propia línea al venderse (`FrozenServiceLine`). Los reportes históricos leen la OS, no el catálogo.
4. **Permisos en dos niveles:**
   - los datos homologados, incluidos el precio y costo base, son del admin_socio corporativo;
   - la configuración de cada centro, del admin_socio de ese centro.
5. **Sin borrado:** un servicio se desactiva y conserva su historial. No hay `DELETE` para clientes de la API.

## Alternativas descartadas

- **Precio vigente por fechas (`valid_from`/`valid_to`) editable:** permite reescribir el pasado. Con el historial append-only y el precio congelado en la OS, no hace falta.
- **Catálogo por centro:** rompe la homologación y la comparabilidad entre centros en la vista corporativa.
- **Variantes por tamaño de vehículo ya:** `vehicles` no tiene tamaño. Queda como pendiente simple (tabla `service_size_prices`) para cuando lo pida la OS.

## Consecuencias

- El módulo de OS debe copiar los valores de `center_catalog` al crear cada línea y no volver a leerlos.
- Un centro puede quedar con un precio propio antiguo cuando cambia el base. El historial y la marca "(centro)" en la UI lo hacen visible.
