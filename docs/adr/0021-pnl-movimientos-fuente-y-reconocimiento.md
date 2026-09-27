# ADR 0021 — P&L: una sola fuente de movimientos, venta por OS entregada y EBITDA gerencial

- Estado: aceptado
- Fecha: 2026-09-27

## Contexto

AF4 pide un estado de resultados por centro y consolidado donde cada cifra se pueda rastrear a sus movimientos, con fórmulas consistentes con Dirección y sin sumar pagos como ventas. AF2 ya tenía `pnl_facts` y un `pnlStatement` con "utilidad de operación"; C3 mide la rentabilidad B2B con OS terminadas.

## Decisión

1. **Una sola función de movimientos (`private.pnl_movements`).**
   - Devuelve cada movimiento con su centro, sección, línea, dimensión y origen.
   - `pnl_lines` (cifras), `pnl_drilldown` (detalle) y `pnl_facts` (contrato de AF2) la agregan.
   - Así la suma del drill-down es la cifra por construcción, y no hay dos fórmulas en SQL.
2. **Sin vistas materializadas ni tablas de resumen.** El volumen por centro es bajo y el P&L debe reflejar el dato vigente (un egreso aprobado hace un minuto cuenta). Si crece, se materializa por mes cerrado sin cambiar el contrato.
3. **La venta se reconoce con la OS entregada**, por su total (descuentos autorizados incluidos), en la fecha de entrega del calendario del centro. Los cobros son cobranza (AF1), no venta. Membresías: altas y renovaciones cobradas. Cuotas B2B: devengadas, en el centro gestor.
4. **Ventas por motor:** neto de cada línea por su motor congelado; el descuento general de la OS se muestra aparte para que motor y canal sumen lo mismo.
5. **EBITDA gerencial = utilidad bruta − personal − operativos** (operativo, administrativo, marketing y otros). Los financieros quedan debajo. No hay depreciación modelada, así que la utilidad antes de impuestos = EBITDA − financieros. Reemplaza la "utilidad de operación" de AF2 (el KPI `pnl.operating_profit` se retira).
6. **Consolidado = suma de centros autorizados**, calculado en el cliente con las mismas filas (fórmulas lineales). La base filtra los centros sin permiso.
7. **Fórmulas sólo en `@meguiars/analytics`**, registradas como KPIs; web, móvil y Dirección las usan.

## Consecuencias

- `pnl_facts` cambia de implementación pero no de contrato: agrega las cuotas B2B (`ingreso:cuotas_b2b`) que antes faltaban.
- La rentabilidad B2B (C3) sigue midiendo OS terminadas: difiere del P&L en OS terminadas y no entregadas (pendiente unificar).
- Los importes incluyen IVA (como las OS y los egresos).
- Las consultas recorren los movimientos del periodo en cada vista; el límite de 3 años y el de 5,000 filas del drill-down acotan el costo.
