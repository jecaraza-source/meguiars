# Módulo AF4 — Administración y Finanzas / Centros de costos y P&L multicentro

## Alcance

Estado de resultados gerencial simple por Detail Center y consolidado, con paridad web y móvil.

- **Filtros:** hoy, semana (lunes a hoy), mes, año (a la fecha) y rango personalizado (máximo 3 años). Siempre en el calendario del centro; el rango resuelto se muestra y viaja en la URL.
- **Ventas por canal y por motor de ingreso.**
- **Costo directo → utilidad bruta. Personal y operativos → EBITDA gerencial.**
- **Vista por centro y consolidada:** una columna por centro autorizado más el consolidado.
- **Drill-down:** cada cifra enlaza a los movimientos fuente que la explican (OS, membresía, convenio B2B o egreso).
- **Exportación:** CSV del estado y de los movimientos (Excel-friendly) e impresión/PDF.
- **Dirección** usa las mismas fórmulas (resultados del mes consolidados y por centro).

Decisiones en [ADR 0021](../adr/0021-pnl-movimientos-fuente-y-reconocimiento.md).

## Diccionario de métricas

Las fórmulas viven sólo en `@meguiars/analytics` (`pnlStatement`) y están registradas como KPIs con su fuente. El % es sobre ventas.

| Métrica (KPI)                                      | Fórmula                                                                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ventas (`pnl.revenue`)                             | Σ total de OS **entregadas** en el periodo (fecha de entrega en el calendario del centro) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas. **No se suman cobros.** |
| · por canal                                        | B2C, membresía y B2B (OS) por el total de la OS; venta de membresías; cuotas B2B.                                                                                                       |
| · por motor                                        | Neto de cada línea de la OS (subtotal − descuentos de la línea) por su motor congelado; el **descuento general de la OS** aparece aparte para cuadrar con el canal.                     |
| Costo directo (`pnl.direct_cost`)                  | Costo estándar congelado de las líneas de esas OS + variación real de insumos + egresos aprobados de `costo_directo`.                                                                   |
| Utilidad bruta (`pnl.gross_profit`)                | Ventas − costo directo. Margen bruto (`pnl.gross_margin`) = utilidad bruta ÷ ventas × 100.                                                                                              |
| Gastos de personal                                 | Egresos aprobados del grupo `personal`.                                                                                                                                                 |
| Gastos operativos                                  | Egresos aprobados de `operativo`, `administrativo`, `marketing` y `otros`.                                                                                                              |
| EBITDA gerencial (`pnl.ebitda`)                    | Utilidad bruta − personal − operativos. Margen EBITDA (`pnl.ebitda_margin`) = EBITDA ÷ ventas × 100.                                                                                    |
| Gastos financieros                                 | Egresos aprobados de `financiero` (comisiones bancarias e intereses).                                                                                                                   |
| Utilidad antes de impuestos (`pnl.net_before_tax`) | EBITDA − financieros (no hay depreciación: no se modelan activos fijos).                                                                                                                |
| Fuera del P&L                                      | Compra de insumos aprobada (salida de caja; su costo se reconoce en la OS) y egresos pendientes de aprobación. Salidas de caja (`expenses.cash_out`) = Σ egresos aprobados.             |

Consolidado = suma de los centros **autorizados** del usuario (las fórmulas son lineales). Un centro sin permiso no aparece ni suma.

## Modelo de datos (`20261010000000_pnl.sql`)

Sin tablas nuevas ni vistas materializadas: el volumen de un centro no lo justifica y así el P&L siempre refleja el dato vigente.

```
private.pnl_movements(centros, desde, hasta)   una fila por movimiento que explica una cifra
  ├─ public.pnl_lines      Σ por centro, sección, línea y dimensión (el estado de resultados)
  ├─ public.pnl_drilldown  los movimientos de una sección/línea/dimensión (suman la cifra)
  └─ public.pnl_facts      contrato de AF2, redefinido sobre los mismos movimientos
```

| Sección         | Líneas                                                                        | Fuente                                                                                            |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ingreso`       | `b2c`, `membresia`, `b2b` (OS por canal), `membresias`, `cuotas_b2b`          | Líneas y descuento general de `service_orders` entregadas; `membership_events`; `b2b_agreements`. |
| `costo_directo` | `estandar`, `variacion_insumos`, `egresos_costo_directo`                      | `service_order_items`, `service_order_consumptions`, `expenses`.                                  |
| `gasto`         | `personal`, `operativo`, `administrativo`, `marketing`, `otros`, `financiero` | `expenses` aprobados (grupo congelado).                                                           |
| `fuera_pnl`     | `insumos`, `pendiente`                                                        | `expenses` (compra de insumos aprobada; pendientes por grupo).                                    |

La **dimensión** es el motor de ingreso (`recurrente`, `valor_medio`, `premium`, `producto_complemento`, `membresia`, `cuota_b2b`, `descuento_os`) o el grupo de un egreso pendiente.

Seguridad: las RPC son `security definer` con filtro por `private.can_read_pnl` (admin, encargado, contador) en cada centro; `private.pnl_movements` no se expone. Periodo validado (22023): fin ≥ inicio y máximo 3 años. Sin datos personales (el drill-down muestra folios, conceptos y montos, no clientes).

## Permisos

| Capacidad  | Roles                      | Espejo en SQL          |
| ---------- | -------------------------- | ---------------------- |
| `pnl.read` | admin, encargado, contador | `private.can_read_pnl` |

El drill-down enlaza al origen sólo si el usuario puede verlo en ese centro (`orders.read`, `expenses.read`, `memberships.read`, `b2b.read`); el contador ve el folio de la OS sin enlace. Recepción y el comercial B2B no ven el P&L.

## Pantallas

| Web                            | Móvil             | Contenido                                                                                                                                                                                     |
| ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/finanzas/resultados`         | `PnlScreen`       | Periodos, centro activo o consolidado (columna por centro; en móvil, selector de columna), KPIs, estado, motores, fuera del P&L, fórmulas, CSV (web: descarga e impresión; móvil: compartir). |
| `/finanzas/resultados/detalle` | `PnlDrillScreen`  | Movimientos de la cifra con total, enlace al origen y CSV.                                                                                                                                    |
| `/direccion`                   | `DireccionScreen` | Resultados del mes consolidados y por centro (mismas fórmulas).                                                                                                                               |

Estados de carga, vacío, error (incluido periodo inválido) y sin permiso. Periodos (`pnlPeriod`), textos (`pnlCopy`), drill-down y CSV viven en `@meguiars/domain`.

## Datos seed

Una OS entregada hoy en cada centro (CDMX $2,980, Monterrey $440), pagadas con tarjeta; junto con los egresos de AF2 el P&L del mes tiene ventas, costo directo, gastos y compra de insumos.

## Pruebas

- **SQL** (`supabase/tests/pnl.test.sql`), 24 aserciones con un dataset conocido:
  - ventas por canal y motor (con descuento general), OS terminada y cobrada **no** es venta, entrega de ayer 23:30 cuenta ayer;
  - costo directo, gastos, fuera del P&L; utilidad bruta $6,949 (71.65 %), EBITDA $5,249 (54.12 %), UAI $5,199;
  - cada cifra = Σ de su drill-down; consolidado = suma de centros; filtros reproducibles y periodos inválidos;
  - permisos: el encargado de B sólo suma su centro; recepción no ve el P&L; los movimientos internos no se exponen;
  - `pnl_facts` (AF2) desde los mismos movimientos (las pruebas de AF2 siguen pasando).
- **Unitarias:** `pnlStatement`/`pnlByCenter` con el mismo dataset (utilidades, márgenes, consolidado), periodos, drill-down, CSV, validación y repositorio.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 8 comprobaciones: OS entregada → P&L con márgenes; drill-down con enlaces y CSV; CSV del estado, periodos y rango inválido; consolidado por centro; Dirección con las mismas cifras; contador de sólo lectura; recepción y comercial sin acceso.

## Variables de entorno

Ninguna nueva.

## Pendientes

- Prorrateo de gastos corporativos entre centros (hoy cada egreso pertenece a un centro).
- Depreciación y activos fijos (EBITDA vs utilidad de operación contable).
- IVA: los importes son con IVA incluido (como las OS); un P&L fiscal sin IVA queda fuera de alcance.
- Comparativos (periodo anterior, presupuesto) y gráficas.
- Unificar el criterio de ingreso B2B con la rentabilidad B2B de C3 (hoy usa OS terminadas; el P&L, entregadas).
- PDF generado en servidor (hoy: imprimir a PDF desde el navegador).
