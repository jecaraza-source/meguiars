# ADR 0044 — El nivel de autorización de descuentos se revisa al cambiar las líneas

- Estado: aceptado
- Fecha: 2026-10-28

## Contexto

El nivel de autorización de un descuento sale del **% acumulado** de descuento manual de la OS o de la cotización (operador ≤ 10 %, encargado ≤ 30 %, admin > 30 %; ADR 0011). Se revisaba sólo al aplicar el descuento. Un descuento por importe conserva su valor, así que bajar la cantidad o quitar otras líneas después subía el % sin volver a pedir autorización. Ejemplo encontrado en una auditoría de seguridad: recepción aplica $500 a 10 lavados de $500 (10 %), baja a 1 lavado y la línea queda en $0 (100 %, que exige admin). Las cotizaciones tenían el mismo hueco, y sus descuentos se copian a la OS al reservar.

## Decisión

1. `set_service_order_item` y `set_quote_item` calculan el % acumulado antes y después del cambio (`private.order_manual_discount_percent`, `private.quote_manual_discount_percent`, con el mismo cálculo que al aplicar el descuento).
2. Si el % sube, quien hace el cambio debe tener el nivel que exige el % nuevo (`private.assert_discount_level_kept`); si no, el cambio se rechaza (42501) con un mensaje que dice qué nivel hace falta. Subir cantidades o agregar líneas baja el % y nunca se bloquea.
3. Membresías y promociones siguen fuera del cálculo, como al aplicar el descuento.
4. Se prefirió a anular o recortar el descuento automáticamente: no cambia en silencio lo que alguien autorizó, y quien tiene el nivel puede hacer el cambio.

## Consecuencias

- Las apps muestran el mensaje de la base tal cual; no hay cambios en web ni móvil.
- Si recepción necesita bajar una cantidad con un descuento grande, primero ajusta o anula el descuento, o pide el cambio al encargado o al admin.
- Pruebas: `supabase/tests/discount_levels.test.sql`.
