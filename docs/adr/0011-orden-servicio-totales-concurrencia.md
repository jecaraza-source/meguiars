# ADR 0011 — Orden de Servicio: totales en la base, precios congelados y concurrencia optimista

- Estado: aceptado
- Fecha: 2026-09-30

## Contexto

La OS concentra dinero (precios, descuentos, cobros) y la editan varias personas desde web y móvil a la vez: recepción agrega un adicional mientras el técnico avanza el estatus. Los totales no pueden depender del cliente, los precios vendidos no pueden cambiar con el catálogo, y dos ediciones simultáneas no deben pisarse en silencio.

## Decisión

1. **Totales server-side:** `private.recalc_service_order` recalcula subtotal, descuentos, total, costo y minutos en cada RPC. El dominio tiene un espejo exacto (`computeOrderTotals`) sólo para vistas previas; las pruebas SQL y unitarias usan el mismo ejemplo.
2. **Precios congelados en la línea** (ADR 0009) y protegidos por trigger: ni con motivo se cambia el precio de una línea vendida.
3. **Concurrencia optimista con `version`:** toda RPC de edición recibe la versión leída, bloquea la fila (`select … for update`) y responde `40001` si cambió. La UI recarga y avisa. Se prefirió a "última escritura gana" (pierde cambios) y a bloqueos pesimistas de sesión (se quedan colgados en móvil).
4. **Folio por centro con contador bloqueado** (`insert … on conflict do update … returning`), en lugar de una secuencia global: es legible, por centro y sin huecos.
5. **Descuentos por % acumulado de la OS**, no por descuento individual: evita partir un descuento grande en varios chicos para evadir la autorización.
6. **Reglas por canal en SQL**, con espejo en el dominio para mostrar el bloqueo antes de intentar (`MG002` si la base lo rechaza).
7. **Interfaces mínimas** para pagos, membresías y B2B (`paid_amount`, `channel_reference`, `b2b_account_id`) sin construir esos módulos.

## Consecuencias

- Cada edición cambia la versión: un formulario abierto mucho tiempo puede tener que recargarse. Es el costo aceptado de no perder cambios.
- `record_service_order_payment` es provisional: el módulo de pagos lo reemplazará por una tabla de pagos que actualice `paid_amount`.
- La sincronía OS → cita es de un solo sentido (la OS manda sobre la cita cuando existe).
