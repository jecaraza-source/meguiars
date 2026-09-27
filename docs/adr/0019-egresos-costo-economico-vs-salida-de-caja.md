# ADR 0019 — Egresos: costo económico vs salida de caja, grupo del P&L congelado y aprobación por umbral

- Estado: aceptado
- Fecha: 2026-10-08

## Contexto

AF2 registra las salidas de dinero por centro y debe alimentar un P&L que separe el costo directo del gasto operativo. La OS ya lleva el costo directo del servicio: el costo estándar congelado por línea (O4) más la variación real de insumos (O5). Si las compras de insumos también se contaran como gasto, el P&L las contaría dos veces.

## Decisión

1. **El costo directo sale de la OS; la compra de insumos no es gasto.**
   - Cada categoría se mapea a un grupo del P&L.
   - El grupo `insumos` es una salida de caja que el P&L excluye, porque su costo ya está en la OS.
   - `costo_directo` es sólo para costos directos que la OS no captura (subcontratos, fletes).
   - `pnl_facts` devuelve ambas cosas: las líneas del P&L y las salidas de caja.
2. **El grupo del P&L se congela en el egreso.** Reclasificar una categoría sólo afecta egresos nuevos o editados; el histórico no cambia sin rastro.
3. **Aprobación opcional por umbral por centro.**
   - Monto ≥ umbral → pendiente, hasta que lo apruebe el admin.
   - Lo que captura un admin queda autoaprobado, con el evento `autoaprobada` como constancia.
   - Editar reevalúa la aprobación.
   - El historial (`approval_events`) es inmutable.
4. **Nada se borra.**
   - Los egresos se anulan y los comprobantes se retiran, siempre con motivo.
   - `audit_row` conserva actor, fecha, valores anterior y nuevo, y motivo.
   - El archivo del comprobante se conserva.
5. **Comprobantes en un bucket privado** (`expense-receipts`, foto o PDF de hasta 10 MB).
   - La ruta codifica organización, centro y egreso, y las políticas de Storage validan permiso y centro.
   - La lectura se hace con URLs firmadas de corta duración.
6. **Permisos.**
   - Encargado y admin capturan; sólo el admin aprueba, fija el umbral y anula lo aprobado.
   - El admin corporativo administra las categorías.
   - El contador lee (y sigue de sólo lectura).
   - Recepción y el comercial no ven egresos.

## Consecuencias

- El costo estándar del catálogo debe incluir sólo materiales e insumos variables; la mano de obra se registra como egreso de personal. Si se incluyera en el costo estándar, la nómina se contaría dos veces.
- El P&L por centro es reproducible: depende de OS entregadas, eventos de membresía, consumos y egresos aprobados, no de totales guardados.
- No hay cuentas por pagar ni inventario valuado: la compra de insumos no se concilia contra existencias (pendiente).
- Móvil agrega `expo-document-picker` para elegir PDFs; es la única dependencia nueva.
