# ADR 0012 — Evidencias en Storage privado con rutas por centro y URL firmadas; consumo sin WMS

- Estado: aceptado
- Fecha: 2026-10-01

## Contexto

Las fotos de la OS muestran vehículos, placas y a veces personas. Deben poder tomarse rápido desde el teléfono con mala señal, verse desde web y móvil, y nunca filtrarse a otro centro. El control de consumo de insumos es necesario para margen, pero un inventario completo (existencias, almacenes) es otro módulo.

## Decisión

1. **Bucket privado** `service-order-evidence` con límite de 5 MiB y tipos de imagen. Nada público.
2. **La ruta lleva la autorización:** `<org>/<centro>/<OS>/<uuid>.<ext>`. Las políticas de `storage.objects` leen centro y OS de la ruta y llaman a las mismas funciones que la RLS (`private.can_use_orders`). Así una sola regla gobierna tablas y archivos.
3. **Dos pasos: subir y registrar.** El cliente sube con su propia sesión; la RPC `register_service_order_evidence` verifica que el objeto exista en la ruta de esa OS y crea la fila. El uuid del archivo lo genera el cliente: los reintentos son idempotentes.
4. **Lectura con URL firmadas de 10 minutos**, generadas con la sesión del usuario (la política `select` decide).
5. **Sin borrado:** retirar una evidencia es soft delete con motivo; el archivo se conserva para auditoría.
6. **Redimensionar en el cliente** (1600 px, JPEG 70 %): ahorra datos móviles y almacenamiento. En web, el navegador lo hace antes de la Server Action.
7. **Consumo sin WMS:** `inventory_items` mínimo y estándares por servicio; el consumo congela estándar y costo. Las existencias llegarán con un módulo de inventario que podrá leer `service_order_consumptions`.

## Consecuencias

- Mover una OS de centro no es posible (ya era inmutable); si algún día lo fuera, habría que mover objetos.
- Un archivo subido que nunca se registra queda huérfano (falla de red entre pasos); se limpiará con un job programado cuando exista.
- Las URL firmadas caducan: una pantalla abierta más de 10 minutos debe recargar para ver las fotos.
