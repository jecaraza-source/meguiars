# ADR 0025 — Tablero corporativo sobre el registro de métricas y drill-down conciliado

- Estado: aceptado
- Fecha: 2026-09-29

## Contexto

D3 pide el tablero predeterminado de Dirección: tarjetas (ventas, vehículos, ticket, margen, EBITDA, membresías activas, MRR, recurrencia, venta B2B, venta de productos), comparación centro vs centro vs consolidado para 2, 3 o N centros, tendencia contra el periodo anterior "cuando sea válida", ranking de servicios y motores por ingreso y margen, drill-down KPI → centro → canal/motor → servicio/OS/movimiento según permiso y alertas visuales por umbral. Criterios: el consolidado coincide con el P&L, el drill-down explica la cifra sin diferencias, los filtros son consistentes y no hay queries ad hoc en la UI.

## Decisión

1. **Tarjeta = vista de una métrica registrada** (`CORPORATE_CARDS` en `@meguiars/analytics`). El valor, el comparativo por centro y la tendencia salen de `resolveWidget` (D1) con los mismos hechos; no hay fórmulas nuevas. El consolidado de las métricas del P&L es la misma cifra que el estado de resultados (prueba con fixture).
2. **Filtros globales sólo centros y periodo.** Canal y motor dejan de ser filtros globales en este tablero y se eligen en el drill-down; así ninguna tarjeta ignora un filtro (membresías o recurrencia no tienen motor). Venta B2B es un canal fijo de la tarjeta.
3. **Dos lecturas por tablero**: `dashboard_facts` del periodo y del periodo anterior equivalente (mismo tramo del periodo calendario anterior; un rango se compara contra los mismos días inmediatamente antes). Sin N+1.
4. **Tendencia válida** sólo si todos los centros evaluados operaban desde el inicio del periodo anterior (`first_activity_on`: primera OS entregada, membresía o egreso aprobado) y, para cambios porcentuales, el anterior no es 0. Porcentajes y razones se comparan en puntos.
5. **Fuente `services`** en la lectura única y RPC `corporate_order_lines`, ambas sobre `private.order_line_facts`, con el mismo criterio que las líneas "ingreso" y "costo estándar" de `private.pnl_movements` (incluye el descuento general de la OS). Por eso Σ servicios + venta de membresías + cuotas B2B = ventas del P&L, y cada nivel del drill-down muestra su conciliación (diferencia 0).
6. **Margen por servicio = venta − costo estándar.** La variación real de insumos no tiene servicio: se muestra como renglón aparte en la conciliación con el margen de contribución.
7. **Umbrales** en `public.kpi_thresholds` (métrica registrada + canal fijo + centro opcional; mínimo y/o máximo). El del centro pisa al general; el consolidado usa el general. Sólo el admin corporativo, con versión, motivo y auditoría. Sin notificaciones externas.
8. **Aditividad explícita por tarjeta** (ticket, margen y recurrencia no suman): en esos niveles se muestra la misma fórmula por subconjunto, sin conciliación de suma.

## Consecuencias

- Agregar una tarjeta es declarar una métrica registrada; web y móvil no cambian (loaders idénticos, guardados por `scripts/dashboard-parity.test.mjs`).
- El tablero de D1 sembrado también se llama "Tablero corporativo"; conviene renombrarlo desde el constructor para evitar confusión.
- Los umbrales se configuran en la web; el móvil los consulta.
