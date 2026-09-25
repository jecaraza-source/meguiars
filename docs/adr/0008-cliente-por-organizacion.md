# ADR 0008 — El cliente pertenece a la organización; la visibilidad, a sus centros

- Estado: aceptado
- Fecha: 2026-09-27

## Contexto

La regla general del proyecto es que toda tabla de negocio lleve `detail_center_id`. Pero un mismo cliente puede atenderse en varios centros de la organización, y el módulo O1 exige:

- no duplicar datos;
- que el historial respete los permisos de cada centro.

Un cliente por centro duplicaría el expediente cada vez que alguien visita otro centro. Un cliente global sin filtro expondría datos personales a centros que nunca lo atendieron.

## Decisión

1. **`clients` y `vehicles` llevan `organization_id`**, no `detail_center_id`. Tienen un centro habitual (`home_detail_center_id`) y el centro de alta, con FKs compuestas `(organization_id, detail_center_id)`.
2. **`client_centers` (con `detail_center_id`)** registra los centros donde se ha atendido al cliente. Un usuario ve al cliente si tiene `clients.read` en su centro habitual o en alguno de esos centros. El historial filtra cada entrada por su centro.
3. **La detección de duplicados abarca toda la organización** (`security definer`), pero sólo muestra datos enmascarados de clientes no visibles. "Usar este cliente" vincula el expediente existente al centro con motivo y auditoría, en lugar de copiarlo.
4. **Las operaciones del futuro (órdenes de servicio, cobros) sí llevan `detail_center_id`**: el centro de costos y resultados sigue siendo el de la operación, no el del cliente.

## Alternativas descartadas

- **Cliente por centro, con un "cliente maestro" opcional:** duplica datos y obliga a sincronizar ediciones.
- **Visibilidad de toda la organización para cualquier operador:** expone teléfonos y emails a centros que nunca atendieron al cliente.
- **Bloquear altas con teléfono repetido (índice único):** familias y flotillas comparten teléfonos. El requisito pide avisar, no bloquear a ciegas. La placa activa sí es única, porque identifica físicamente al vehículo.

## Consecuencias

- **Enumeración:** conocer el teléfono o la placa de un cliente de otro centro permite vincularlo al propio. Es aceptable dentro de una organización y queda auditado (`client.linked_to_center`). Si se requiere, se puede pedir aprobación del encargado.
- **Regla de tenancy:** `clients`, `vehicles` y las tablas maestras futuras de alcance organización (p. ej. catálogos) son la excepción documentada. La prueba de RLS sigue exigiendo RLS en todas.
