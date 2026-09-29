# ADR 0026 — Pago al operador como % del precio, congelado en la línea de OS

- Estado: aceptado
- Fecha: 2026-09-29

## Contexto

CR1 incorpora el "Lavado manual detallado", cuyo costo de mano de obra es variable: al operador se le paga un porcentaje del precio de venta. El catálogo sólo tenía un costo directo estándar por servicio; la OS congela precio y costo por línea; el P&L y los tableros leen esos importes congelados; las líneas ya registran qué técnico las realizó.

## Decisión

1. **El % vive en el catálogo** (servicio y, opcionalmente, centro), editable y sin valor por defecto, con historial y motivo. El costo directo estándar pasa a ser "otros costos directos" (sin mano de obra) para no duplicarla.
2. **Se congela por línea**: un trigger `before insert` en `service_order_items` fija el % vigente del centro en toda línea nueva (walk-in, cita, B2B, recomendaciones), sin tocar cada RPC. El pago es una columna generada: `redondeo((cantidad × precio unitario − descuento de línea) × % ÷ 100, 2)`.
3. **Base del %**: precio aplicado de la línea, con IVA incluido, después de sus descuentos (incluida la membresía). El descuento general de la OS no la reduce.
4. **Costo**: `cost_total` de la OS = costo estándar + pago al operador. Así B2B, LTV y márgenes que ya usan `cost_total` lo incluyen sin cambios.
5. **P&L**: renglón propio `costo_directo / pago_operador` por motor. Las métricas `pnl.direct_cost` y `pnl.contribution_margin` suben a versión 2 con la fórmula nueva.
6. **Operador** = técnico de la línea (o de la OS). No se creó un reporte por operador porque no existía; los datos quedan listos.

## Consecuencias

- Servicios y OS existentes no cambian (sin % → pago 0, mismo costo), probado con una prueba de actualización.
- Una línea cubierta al 100 % por membresía o descuento paga 0 al operador. Si el negocio quiere pagar sobre el precio de lista, hay que cambiar la base (pendiente de definir).
- Si la nómina ya registra estas comisiones como egreso de personal, el costo se contaría dos veces en el P&L: el pago de comisiones debe registrarse sin duplicar (pendiente de definir la categoría).
