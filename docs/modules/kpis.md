# Módulo D2 — Dirección / KPIs de rentabilidad y gestión

## Alcance

Registro inicial de 25 KPIs financieros, operativos, comerciales y de cliente, por centro y consolidados, en web (`/direccion/kpis`) y móvil (`KpisScreen`), con los filtros globales de los tableros (centros, periodo, canal, motor) y la ficha de negocio de cada KPI.

## Arquitectura: una fórmula por KPI

- **Métrica** (D1, `METRIC_CATALOG`): la fórmula y su cálculo, una sola vez, espejada en `public.metric_registry` (prueba de paridad).
- **KPI** (`KPI_CATALOG` en `packages/analytics/src/kpis/catalog.ts`): una **vista** de una métrica — su valor, su reparto por centro, su desglose por motor o la métrica con un canal fijo — más la ficha de negocio (definición, numerador, denominador, periodo, notas). Unidad, fórmula, fuente, permiso y filtros válidos se derivan de la métrica. Por eso "Ventas", "Ingreso por centro", "Ventas por motor", "Ventas B2C" y "Venta B2B" comparten la fórmula de `pnl.revenue`.
- **Datos:** la misma llamada única `public.dashboard_facts`, ampliada con las fuentes `orders` (OS entregadas por centro, periodo y canal), `centers` (bahías, técnicos y parámetros), `upsell` y `customers` (por cliente con llave anónima). Cada fuente aplica su permiso por centro.
- **Mismo valor en web y móvil:** ambas apps arman el tablero virtual de KPIs con `kpiDefinition` y lo resuelven con el mismo cargador (guarda `scripts/dashboard-parity.test.mjs`).

## Parámetros gerenciales (`public.kpi_settings`)

| Parámetro                        | Por defecto | Uso                         |
| -------------------------------- | ----------- | --------------------------- |
| Vida esperada del cliente (años) | 3 (0.5–10)  | LTV gerencial               |
| Horas operativas por día         | 10 (1–24)   | Capacidad para la ocupación |
| Días operativos por semana       | 6 (1–7)     | Capacidad para la ocupación |

Los cambia el admin corporativo en la web (`set_kpi_settings`: versión, motivo y auditoría); el resto los consulta.

## Definiciones (generadas del registro)

### Financieros

#### Ventas (`kpi.ventas`)

Lo que el negocio vendió en el periodo: servicios entregados, membresías y cuotas B2B, aunque no se hayan cobrado.

|                 |                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `pnl.revenue`                                                                                                                                        |
| Numerador       | Total de OS entregadas + altas y renovaciones de membresía + cuotas B2B devengadas                                                                   |
| Denominador     | —                                                                                                                                                    |
| Fórmula         | Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas |
| Filtros válidos | centros, periodo, canal, motor                                                                                                                       |
| Periodo         | suma del periodo                                                                                                                                     |
| Unidad          | MXN                                                                                                                                                  |
| Permiso         | `pnl.read`                                                                                                                                           |

**Interpretación:** Es venta devengada, no cobranza: para el dinero recibido usa Cobrado. Una OS cuenta el día que se entrega.

#### Utilidad bruta (`kpi.utilidad_bruta`)

Lo que queda de las ventas después de todo el costo directo del servicio.

|                 |                                                                                    |
| --------------- | ---------------------------------------------------------------------------------- |
| Métrica         | `pnl.gross_profit`                                                                 |
| Numerador       | Ventas − costo directo (estándar, variación de insumos y egresos de costo directo) |
| Denominador     | —                                                                                  |
| Fórmula         | Ventas − costo directo                                                             |
| Filtros válidos | centros, periodo                                                                   |
| Periodo         | suma del periodo                                                                   |
| Unidad          | MXN                                                                                |
| Permiso         | `pnl.read`                                                                         |

**Interpretación:** Si baja con ventas estables, revisa costos estándar, consumo de insumos o egresos de costo directo.

#### Margen de contribución (`kpi.margen_contribucion`)

Lo que aporta cada venta de OS después de sus costos variables, antes de gastos fijos.

|                 |                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Métrica         | `pnl.contribution_margin`                                                                                                                  |
| Numerador       | Ventas − costo estándar de las OS − pago a operadores − variación real de insumos                                                          |
| Denominador     | —                                                                                                                                          |
| Fórmula         | Ventas − costo estándar de las OS entregadas − pago a operadores − variación real de insumos (sin egresos de costo directo fuera de la OS) |
| Filtros válidos | centros, periodo, motor                                                                                                                    |
| Periodo         | suma del periodo                                                                                                                           |
| Unidad          | MXN                                                                                                                                        |
| Permiso         | `pnl.read`                                                                                                                                 |

**Interpretación:** No resta egresos de costo directo que no pasan por una OS (esos sí están en la utilidad bruta). Admite filtro por motor para comparar su aporte.

#### EBITDA gerencial (`kpi.ebitda`)

Resultado de la operación antes de depreciación, intereses e impuestos.

|                 |                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Métrica         | `pnl.ebitda`                                                                                                     |
| Numerador       | Utilidad bruta − gastos de personal − gastos operativos aprobados                                                |
| Denominador     | —                                                                                                                |
| Fórmula         | Utilidad bruta − gastos de personal − gastos operativos (operativo, administrativo, marketing y otros) aprobados |
| Filtros válidos | centros, periodo                                                                                                 |
| Periodo         | suma del periodo                                                                                                 |
| Unidad          | MXN                                                                                                              |
| Permiso         | `pnl.read`                                                                                                       |

**Interpretación:** Gerencial: sin depreciación (no hay activos fijos modelados). Egresos pendientes de aprobar no cuentan.

#### Ticket promedio (`kpi.ticket_promedio`)

Cuánto se vende en promedio por cada visita (OS entregada).

|                 |                                                         |
| --------------- | ------------------------------------------------------- |
| Métrica         | `orders.avg_ticket`                                     |
| Numerador       | Σ total de las OS entregadas                            |
| Denominador     | OS entregadas                                           |
| Fórmula         | Σ total de las OS entregadas ÷ OS entregadas (0 sin OS) |
| Filtros válidos | centros, periodo, canal                                 |
| Periodo         | suma del periodo                                        |
| Unidad          | MXN                                                     |
| Permiso         | `pnl.read`                                              |

**Interpretación:** Sólo OS (no membresías ni cuotas B2B). Sube con upselling y servicios de mayor valor.

#### Ingreso por centro (`kpi.ingreso_por_centro`)

Ventas de cada centro de costos en el periodo, para compararlos.

|                 |                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `pnl.revenue` (vista: por centro)                                                                                                                    |
| Numerador       | Ventas del centro                                                                                                                                    |
| Denominador     | —                                                                                                                                                    |
| Fórmula         | Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas |
| Filtros válidos | centros, periodo, canal, motor                                                                                                                       |
| Periodo         | suma del periodo                                                                                                                                     |
| Unidad          | MXN                                                                                                                                                  |
| Permiso         | `pnl.read`                                                                                                                                           |

**Interpretación:** El consolidado es la suma de los centros autorizados.

### Operativos

#### Vehículos atendidos (`kpi.vehiculos`)

Visitas terminadas: vehículos entregados al cliente en el periodo.

|                 |                                                                           |
| --------------- | ------------------------------------------------------------------------- |
| Métrica         | `orders.vehicles_served`                                                  |
| Numerador       | OS entregadas                                                             |
| Denominador     | —                                                                         |
| Fórmula         | OS entregadas en el periodo (una OS = un vehículo atendido en una visita) |
| Filtros válidos | centros, periodo, canal                                                   |
| Periodo         | suma del periodo                                                          |
| Unidad          | conteo                                                                    |
| Permiso         | `pnl.read`                                                                |

**Interpretación:** Un mismo vehículo que viene dos veces cuenta dos visitas.

#### Ocupación (`kpi.ocupacion`)

Qué parte de la capacidad instalada de bahías se usó en servicios entregados.

|                 |                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `ops.occupancy`                                                                                                                                    |
| Numerador       | Minutos estándar de las OS entregadas                                                                                                              |
| Denominador     | Bahías activas × horas operativas × 60 × días operativos del periodo                                                                               |
| Fórmula         | Minutos estándar de las OS entregadas ÷ (bahías activas × horas operativas por día × 60 × días del periodo × días operativos por semana ÷ 7) × 100 |
| Filtros válidos | centros, periodo                                                                                                                                   |
| Periodo         | suma del periodo                                                                                                                                   |
| Unidad          | %                                                                                                                                                  |
| Permiso         | `pnl.read`                                                                                                                                         |

**Interpretación:** Usa tiempos estándar del catálogo y los parámetros de horas y días operativos de la organización. Capacidad con las bahías activas hoy.

#### Duración promedio (`kpi.duracion`)

Tiempo real de trabajo por vehículo, del inicio al fin de la ejecución.

|                 |                                                                                         |
| --------------- | --------------------------------------------------------------------------------------- |
| Métrica         | `ops.avg_duration`                                                                      |
| Numerador       | Σ minutos entre inicio y fin de trabajo                                                 |
| Denominador     | OS entregadas con inicio y fin registrados                                              |
| Fórmula         | Σ minutos entre inicio y fin de trabajo ÷ OS entregadas con ambas marcas (0 sin marcas) |
| Filtros válidos | centros, periodo, canal                                                                 |
| Periodo         | suma del periodo                                                                        |
| Unidad          | minutos                                                                                 |
| Permiso         | `pnl.read`                                                                              |

**Interpretación:** OS sin marcas de trabajo no cuentan. Compárala con la duración estándar del catálogo.

#### Productividad por técnico (`kpi.productividad`)

Vehículos entregados por cada técnico activo.

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| Métrica         | `ops.productivity`                                               |
| Numerador       | OS entregadas                                                    |
| Denominador     | Técnicos activos de los centros                                  |
| Fórmula         | OS entregadas ÷ técnicos activos de los centros (0 sin técnicos) |
| Filtros válidos | centros, periodo                                                 |
| Periodo         | suma del periodo                                                 |
| Unidad          | razón                                                            |
| Permiso         | `pnl.read`                                                       |

**Interpretación:** Básica: no pondera la complejidad del servicio ni turnos. Usa los técnicos activos hoy.

#### Retrabajos e incidencias (`kpi.retrabajos`)

Porcentaje de vehículos entregados que tuvieron una incidencia o un retrabajo.

|                 |                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Métrica         | `ops.rework_rate`                                                                                 |
| Numerador       | OS entregadas con al menos una incidencia o retrabajo                                             |
| Denominador     | OS entregadas                                                                                     |
| Fórmula         | OS entregadas con al menos una incidencia o retrabajo registrado ÷ OS entregadas × 100 (0 sin OS) |
| Filtros válidos | centros, periodo, canal                                                                           |
| Periodo         | suma del periodo                                                                                  |
| Unidad          | %                                                                                                 |
| Permiso         | `pnl.read`                                                                                        |

**Interpretación:** Menor es mejor. Depende de que la operación registre las incidencias.

### Comerciales

#### Ventas por motor (`kpi.ventas_por_motor`)

Cómo se reparte la venta entre los motores de ingreso (recurrente, valor medio, premium, productos, membresía, cuota B2B).

|                 |                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `pnl.revenue` (vista: por motor)                                                                                                                     |
| Numerador       | Ventas de cada motor                                                                                                                                 |
| Denominador     | Ventas totales (para la participación)                                                                                                               |
| Fórmula         | Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas |
| Filtros válidos | centros, periodo, canal, motor                                                                                                                       |
| Periodo         | suma del periodo                                                                                                                                     |
| Unidad          | MXN                                                                                                                                                  |
| Permiso         | `pnl.read`                                                                                                                                           |

**Interpretación:** El descuento general de las OS aparece aparte porque no pertenece a una línea.

#### Ventas B2C (`kpi.ventas_b2c`)

Ventas de OS a clientes particulares.

|                 |                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `pnl.revenue` con canal fijo B2C                                                                                                                     |
| Numerador       | Total de OS entregadas del canal B2C                                                                                                                 |
| Denominador     | —                                                                                                                                                    |
| Fórmula         | Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas |
| Filtros válidos | centros, periodo, motor                                                                                                                              |
| Periodo         | suma del periodo                                                                                                                                     |
| Unidad          | MXN                                                                                                                                                  |
| Permiso         | `pnl.read`                                                                                                                                           |

**Interpretación:** Canal fijo: no cambia con el filtro de canal.

#### Venta B2B (`kpi.venta_b2b`)

Ventas a cuentas empresariales: OS del canal B2B y cuotas devengadas.

|                 |                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `pnl.revenue` con canal fijo B2B                                                                                                                     |
| Numerador       | OS entregadas del canal B2B + cuotas B2B devengadas                                                                                                  |
| Denominador     | —                                                                                                                                                    |
| Fórmula         | Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas |
| Filtros válidos | centros, periodo, motor                                                                                                                              |
| Periodo         | suma del periodo                                                                                                                                     |
| Unidad          | MXN                                                                                                                                                  |
| Permiso         | `pnl.read`                                                                                                                                           |

**Interpretación:** Canal fijo. La cobranza B2B se ve en Cuentas por cobrar.

#### Venta de productos (`kpi.venta_productos`)

Productos vendidos dentro de las OS (no servicios).

|                 |                                                                                       |
| --------------- | ------------------------------------------------------------------------------------- |
| Métrica         | `orders.product_sales`                                                                |
| Numerador       | Σ neto de las líneas de producto de las OS entregadas                                 |
| Denominador     | —                                                                                     |
| Fórmula         | Σ (subtotal − descuento de línea) de las líneas de tipo producto de las OS entregadas |
| Filtros válidos | centros, periodo, canal                                                               |
| Periodo         | suma del periodo                                                                      |
| Unidad          | MXN                                                                                   |
| Permiso         | `pnl.read`                                                                            |

**Interpretación:** Neto de descuentos de línea; el descuento general de la OS no se reparte.

#### Tasa de upselling (`kpi.upselling`)

Qué porcentaje de las sugerencias de venta adicional acepta el cliente.

|                 |                                                                     |
| --------------- | ------------------------------------------------------------------- |
| Métrica         | `upsell.acceptance_rate`                                            |
| Numerador       | Sugerencias aceptadas                                               |
| Denominador     | Sugerencias ofrecidas                                               |
| Fórmula         | Sugerencias aceptadas ÷ sugerencias ofrecidas × 100 (0 sin ofertas) |
| Filtros válidos | centros, periodo                                                    |
| Periodo         | suma del periodo                                                    |
| Unidad          | %                                                                   |
| Permiso         | `upsell.read`                                                       |

**Interpretación:** Una sugerencia se cuenta una vez por regla y OS, por la fecha en que se mostró.

#### Conversión de oportunidades (`kpi.conversion`)

De las oportunidades que se cerraron en el periodo, cuántas se ganaron.

|                 |                                                                           |
| --------------- | ------------------------------------------------------------------------- |
| Métrica         | `pipeline.conversion_rate`                                                |
| Numerador       | Oportunidades ganadas en el periodo                                       |
| Denominador     | Oportunidades ganadas + perdidas en el periodo                            |
| Fórmula         | Ganadas ÷ (ganadas + perdidas) cerradas en el rango × 100 (0 sin cierres) |
| Filtros válidos | centros, periodo, canal                                                   |
| Periodo         | suma del periodo                                                          |
| Unidad          | %                                                                         |
| Permiso         | `pipeline.metrics.read`                                                   |

**Interpretación:** Las abiertas no cuentan. Filtro de canal: B2B o B2C premium.

### Membresías y clientes

#### Membresías activas (`kpi.membresias_activas`)

Membresías vigentes (activas o por vencer) al último día del periodo.

|                 |                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------- |
| Métrica         | `membership.active_count`                                                                 |
| Numerador       | Membresías activas o próximas a vencer al corte                                           |
| Denominador     | —                                                                                         |
| Fórmula         | Membresías activas o próximas a vencer al corte (sin suspendidas, vencidas ni canceladas) |
| Filtros válidos | centros, periodo                                                                          |
| Periodo         | foto al corte                                                                             |
| Unidad          | conteo                                                                                    |
| Permiso         | `memberships.metrics.read`                                                                |

**Interpretación:** Foto al cierre del periodo: suspendidas, vencidas y canceladas no cuentan.

#### MRR (`kpi.mrr`)

Ingreso mensual recurrente de las membresías vigentes.

|                 |                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `membership.mrr`                                                                                                                                                                                                            |
| Numerador       | Σ precio del periodo ÷ meses del periodo de cada membresía vigente al corte                                                                                                                                                 |
| Denominador     | —                                                                                                                                                                                                                           |
| Fórmula         | Σ (precio congelado del periodo ÷ meses del periodo) de las membresías activas o próximas a vencer al corte. Ej.: mensual $849 aporta $849; trimestral $3,900 aporta $1,300. Suspendidas, vencidas y canceladas aportan $0. |
| Filtros válidos | centros, periodo                                                                                                                                                                                                            |
| Periodo         | foto al corte                                                                                                                                                                                                               |
| Unidad          | MXN                                                                                                                                                                                                                         |
| Permiso         | `memberships.metrics.read`                                                                                                                                                                                                  |

**Interpretación:** Sólo ingresos recurrentes elegibles: membresías activas o por vencer. No incluye cuotas B2B (contratos, se reportan en Venta B2B), ventas únicas ni membresías suspendidas.

#### Altas de membresía (`kpi.altas`)

Membresías nuevas vendidas en el periodo.

|                 |                                                |
| --------------- | ---------------------------------------------- |
| Métrica         | `membership.new_count`                         |
| Numerador       | Membresías con alta en el periodo              |
| Denominador     | —                                              |
| Fórmula         | Membresías con evento de alta dentro del rango |
| Filtros válidos | centros, periodo                               |
| Periodo         | suma del periodo                               |
| Unidad          | conteo                                         |
| Permiso         | `memberships.metrics.read`                     |

**Interpretación:** Las renovaciones se cuentan aparte.

#### Renovaciones (`kpi.renovaciones`)

Renovaciones de membresía registradas en el periodo.

|                 |                                        |
| --------------- | -------------------------------------- |
| Métrica         | `membership.renewal_count`             |
| Numerador       | Eventos de renovación en el periodo    |
| Denominador     | —                                      |
| Fórmula         | Eventos de renovación dentro del rango |
| Filtros válidos | centros, periodo                       |
| Periodo         | suma del periodo                       |
| Unidad          | conteo                                 |
| Permiso         | `memberships.metrics.read`             |

**Interpretación:** Una membresía puede renovarse más de una vez en periodos largos.

#### Cancelaciones (`kpi.cancelaciones`)

Membresías que el cliente canceló en el periodo.

|                 |                                        |
| --------------- | -------------------------------------- |
| Métrica         | `membership.cancellation_count`        |
| Numerador       | Membresías canceladas en el periodo    |
| Denominador     | —                                      |
| Fórmula         | Membresías canceladas dentro del rango |
| Filtros válidos | centros, periodo                       |
| Periodo         | suma del periodo                       |
| Unidad          | conteo                                 |
| Permiso         | `memberships.metrics.read`             |

**Interpretación:** Las vencidas sin renovar no son cancelaciones (se ven en Bajas del módulo de membresías).

#### Recurrencia (`kpi.recurrencia`)

Porcentaje de los clientes atendidos en el periodo que ya habían venido antes al centro.

|                 |                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `customers.recurrence_rate`                                                                                                                     |
| Numerador       | Clientes atendidos en el periodo con una visita previa al centro                                                                                |
| Denominador     | Clientes únicos atendidos en el periodo                                                                                                         |
| Fórmula         | Clientes con OS entregada en el periodo que ya tenían una OS entregada antes en el mismo centro ÷ clientes con OS entregada en el periodo × 100 |
| Filtros válidos | centros, periodo, canal                                                                                                                         |
| Periodo         | suma del periodo                                                                                                                                |
| Unidad          | %                                                                                                                                               |
| Permiso         | `customers.metrics.read`                                                                                                                        |

**Interpretación:** Un cliente atendido en dos centros cuenta una vez en el consolidado.

#### Frecuencia de visita (`kpi.frecuencia`)

Cuántas veces vino en promedio cada cliente atendido en el periodo.

|                 |                                                                                        |
| --------------- | -------------------------------------------------------------------------------------- |
| Métrica         | `customers.visit_frequency`                                                            |
| Numerador       | Visitas (OS entregadas)                                                                |
| Denominador     | Clientes únicos atendidos                                                              |
| Fórmula         | OS entregadas en el periodo ÷ clientes únicos atendidos en el periodo (0 sin clientes) |
| Filtros válidos | centros, periodo, canal                                                                |
| Periodo         | suma del periodo                                                                       |
| Unidad          | razón                                                                                  |
| Permiso         | `customers.metrics.read`                                                               |

**Interpretación:** Periodos cortos tienden a 1; compárala en periodos iguales.

#### LTV gerencial inicial (`kpi.ltv`)

Valor de vida estimado de un cliente con una regla de gestión explícita: gasto anual por cliente × margen de las OS × años de vida esperados.

|                 |                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métrica         | `customers.ltv`                                                                                                                                                                  |
| Numerador       | Ventas de OS del periodo × margen de las OS × años de vida × (365 ÷ días del periodo)                                                                                            |
| Denominador     | Clientes únicos atendidos en el periodo                                                                                                                                          |
| Fórmula         | (Σ ventas de OS del periodo ÷ clientes únicos) × (365 ÷ días del periodo) × (1 − costo estándar ÷ ventas) × años de vida esperados (parámetro de la organización; 3 por defecto) |
| Filtros válidos | centros, periodo, canal                                                                                                                                                          |
| Periodo         | suma del periodo                                                                                                                                                                 |
| Unidad          | MXN                                                                                                                                                                              |
| Permiso         | `customers.metrics.read`                                                                                                                                                         |

**Interpretación:** No es una predicción científica. Los años de vida son un parámetro de la organización (3 por defecto) que el admin corporativo ajusta; el margen usa el costo estándar de las OS.

## Permisos

| Fuente                     | Permiso por centro               | Roles                                     |
| -------------------------- | -------------------------------- | ----------------------------------------- |
| P&L y OS (`pnl`, `orders`) | `pnl.read`                       | admin, encargado, contador                |
| Cobranza                   | `payments.read`                  | admin, encargado, recepción, contador     |
| Pipeline                   | `pipeline.metrics.read`          | admin, encargado, contador, comercial B2B |
| Upselling                  | `upsell.read`                    | admin, encargado, contador, comercial B2B |
| Membresías                 | `memberships.metrics.read`       | admin, encargado, contador, comercial B2B |
| Clientes                   | `customers.metrics.read` (nuevo) | admin, encargado, contador, comercial B2B |

La pantalla exige `dashboards.read` (recepción no la ve). Un KPI sin permiso en los centros elegidos muestra "Sin permiso para esta métrica".

## Agregar un KPI

- Si la fórmula ya existe: agrega una entrada a `KPI_CATALOG` (vista, canal o desglose y ficha). Sin migración.
- Si es una fórmula nueva: agrégala como métrica (ver `docs/modules/tableros.md` → "Agregar una métrica") y luego el KPI.

## Pruebas

- SQL `supabase/tests/kpis.test.sql` (21): dataset fixture con valores esperados de las fuentes nuevas, parámetros (permiso, versión, motivo, rangos, auditoría) y permisos por centro. Actualización `upgrade/20261015000000_kpis.after.sql`; seed en `scripts/test-db.sh`.
- `packages/analytics/src/kpis/kpis.test.ts`: los 25 valores esperados del mismo dataset, filtros de canal y motor, parámetro del LTV, permisos y "una fórmula por KPI" (fórmulas únicas en el catálogo e iguales a su KPI registrado).
- Paridad catálogo ↔ `metric_registry`, paridad del cargador web/móvil y que este documento contenga cada KPI.
- E2E web (7 escenarios) y `expo export` iOS/Android.

## Variables de entorno

Ninguna nueva.

## Supuestos y pendientes

- Vehículos atendidos = OS entregadas (visitas), no vehículos únicos.
- Ocupación con tiempos estándar del catálogo y bahías activas hoy; productividad con técnicos activos hoy (sin histórico de altas y bajas).
- Duración promedio sólo con OS que registran inicio y fin.
- Recurrencia y frecuencia por centro; en el consolidado un cliente cuenta una vez.
- MRR sólo membresías vigentes; las cuotas B2B se reportan en Venta B2B.
- Pendiente: capacidad por centro (hoy es por organización), histórico de recursos y metas por KPI.
