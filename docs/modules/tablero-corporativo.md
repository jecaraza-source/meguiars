# Dirección / Tablero corporativo (D3)

Tablero predeterminado de Dirección (`/direccion` en web; **Dirección → Tablero corporativo** en móvil) para comparar centros y entender las causas del desempeño. Decisiones en [ADR 0025](../adr/0025-tablero-corporativo-y-drill-down-conciliado.md).

## Qué muestra

| Tarjeta            | Métrica registrada               | Se explica por                                   |
| ------------------ | -------------------------------- | ------------------------------------------------ |
| Ventas             | `pnl.revenue`                    | canal / motor → servicio → OS                    |
| EBITDA             | `pnl.ebitda`                     | renglones del estado de resultados → movimientos |
| Margen bruto       | `pnl.gross_margin`               | renglones del estado de resultados → movimientos |
| Vehículos          | `orders.vehicles_served`         | canal                                            |
| Ticket promedio    | `orders.avg_ticket`              | canal (no aditivo)                               |
| Membresías activas | `membership.active_count`        | centro                                           |
| MRR                | `membership.mrr`                 | centro                                           |
| Recurrencia        | `customers.recurrence_rate`      | canal (no aditivo)                               |
| Venta B2B          | `pnl.revenue` con canal fijo B2B | motor → servicio → OS                            |
| Venta de productos | `orders.product_sales`           | canal → producto → OS                            |

- **Comparativo**: una fila por KPI, una columna por centro elegido (1..N, sin código por centro) y el consolidado.
- **Tendencia** contra el periodo anterior equivalente: Hoy → ayer; Semana → semana anterior al mismo día; Mes → mes anterior al mismo día; Año → año anterior a la misma fecha; Rango → los mismos días inmediatamente antes. Moneda y conteos en %; porcentajes y razones en puntos. Se muestra "Sin comparativo" si algún centro no operaba desde el inicio del periodo anterior o si el anterior fue 0.
- **Ranking** de motores y de servicios/productos por ingreso o por margen (venta − costo estándar − pago al operador, CR1), con la conciliación contra el P&L (ventas y margen de contribución; diferencia 0).
- **Alertas visuales** cuando un KPI queda por debajo del mínimo o por encima del máximo configurado (sin notificaciones externas).
- **Móvil**: primero el resumen ejecutivo (Ventas, EBITDA, Margen, Vehículos) y la lista de alertas; luego el resto, el comparativo por KPI y el ranking. Cada cifra abre el drill-down navegable (migas para volver a cualquier nivel).

## Filtros

Centros (los de la organización con acceso a Dirección) y periodo (Hoy/Semana/Mes/Año/Rango). Aplican igual a todas las tarjetas; canal y motor se eligen dentro del drill-down. La URL es compartible (`/direccion?periodo=mes&centros=…`, `/direccion/detalle?tarjeta=ventas&centro=…&dim=canal&valor=b2c&servicio=…`).

## Drill-down

KPI → centro (o consolidado) → canal/motor → servicio → OS; EBITDA y margen → renglón del P&L → movimientos (pantalla de detalle del P&L). Cada nivel muestra la cifra que explica, la suma de sus filas y la diferencia (0). Ventas de membresías y cuotas B2B aparecen como renglones propios (no vienen de OS) y abren sus movimientos.

## Permisos

- Pantallas: `executive.read` (admin corporativo).
- Cada tarjeta respeta el permiso de su métrica por centro (`pnl.read`, `memberships.metrics.read`, `customers.metrics.read`); los centros sin permiso no suman y se avisan.
- Servicios y OS: `pnl.read` en el centro (la base filtra en `dashboard_facts` y `corporate_order_lines`).
- Umbrales: los lee cualquier miembro de la organización; los cambia sólo el admin corporativo (`set_kpi_threshold`, `delete_kpi_threshold`) con motivo, versión y auditoría.

## Base de datos (20261016000000_corporate_board.sql)

- `private.order_line_facts`: líneas de OS entregadas + descuento general (mismo criterio que el P&L).
- `public.dashboard_facts`: fuente `services` y `first_activity_on` en los recursos por centro.
- `public.corporate_order_lines(centros, desde, hasta, canal, motor, servicio)`: último nivel del drill-down (máx. 5 000 filas).
- `public.kpi_thresholds` + RLS (lectura por organización; sin escritura directa).

## Datos de ejemplo

El seed agrega umbrales: ventas mínimas de $3,000 y EBITDA no negativo para cada centro, y venta B2B mínima de $1,000 en CDMX.

## Variables de entorno

No agrega variables. Usa `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (web) y `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (móvil), como el resto de la app.

## Pruebas

- `supabase/tests/corporate_board.test.sql` (26): cuadre servicios ↔ P&L, drill a OS, inicio de operación, permisos y umbrales.
- `packages/analytics/src/corporate/corporate.test.ts` (23): valores por centro y consolidado, consolidado = P&L, 1/2/3/15 centros, tendencia y validez, alertas, ranking y conciliación, drill-down por nivel.
- `packages/domain/src/corporate/corporate.test.ts` (7): filtros, navegación del drill (URL = móvil), presentación.
- `scripts/dashboard-parity.test.mjs`: cargadores idénticos web/móvil.
