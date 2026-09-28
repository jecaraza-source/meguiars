# ADR 0024 — KPIs como vistas de métricas registradas

- Estado: aceptado
- Fecha: 2026-09-28

## Contexto

D2 pide un registro de KPIs financieros, operativos, comerciales y de cliente con fórmulas únicas, definición empresarial, numerador/denominador, filtros válidos, periodo, unidad y notas, respetando los centros autorizados. D1 ya tiene un registro de métricas en código espejado en la base y una lectura única de hechos. Varios KPIs pedidos son la misma cifra vista distinto (ventas, ingreso por centro, ventas por motor, ventas B2C, venta B2B).

## Decisión

1. **Un KPI no tiene fórmula propia**: es una vista (valor, por centro, por motor o canal fijo) de una métrica de `METRIC_CATALOG`. Las fórmulas nuevas (margen de contribución, ticket, ocupación, duración, productividad, retrabajos, productos, upselling, renovaciones, cancelaciones, recurrencia, frecuencia, LTV) se agregan como métricas con su migración.
2. **Fuentes nuevas en la misma llamada** (`orders`, `centers`, `upsell`, `customers`), cada una con su permiso por centro; los clientes viajan con llave anónima.
3. **LTV gerencial explícito**: gasto anualizado por cliente × margen de las OS × años de vida (parámetro de la organización). Se documenta como regla de gestión, no como predicción.
4. **Capacidad configurable** (horas y días operativos) en `public.kpi_settings`, con versión, motivo y auditoría.
5. **Margen de contribución ≠ utilidad bruta**: resta sólo costos variables de la OS (costo estándar y variación de insumos), no los egresos de costo directo fuera de la OS.

## Consecuencias

- "No hay dos fórmulas para el mismo KPI" se prueba: fórmulas únicas en el catálogo e iguales al KPI registrado.
- Agregar un KPI sobre una métrica existente no requiere migración.
- El canal fijo sólo existe en vistas de KPI; los tableros guardados siguen sin esa opción (pendiente si se necesita).
