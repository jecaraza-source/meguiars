# ADR 0023 — Tableros ejecutivos: registro de métricas versionado en código y una lectura de hechos por tablero

- Estado: aceptado
- Fecha: 2026-09-28

## Contexto

D1 pide un generador de tableros donde cada widget use una métrica registrada (sin SQL libre), cada KPI tenga definición, unidad, fórmula, fuente y permisos, el valor sea el mismo en web y móvil, los filtros globales se propaguen a los widgets compatibles y la carga no tenga N+1. Además, agregar un KPI debe hacerse con código o configuración versionada, no editando pantallas.

Las fórmulas ya viven en `@meguiars/analytics` (`defineKpi`) y cada dominio expone funciones de hechos con sus permisos por centro (`pnl_movements`, `payment_facts`, `pipeline_metric_facts`, `membership_metric_facts`). PostgREST limita las respuestas a 1000 filas.

## Decisión

1. **El catálogo de métricas es código** (`METRIC_CATALOG` en `@meguiars/analytics`). Cada métrica reutiliza el KPI existente (nombre, unidad y fórmula únicos) y declara fuente, permiso, widgets, filtros, desgloses y drill-down.
2. **`public.metric_registry` es su espejo en la base**, escrito sólo por migraciones con `private.register_metric` (gana la versión mayor). Los widgets tienen FK al registro y `save_dashboard` valida tipo y desglose contra él. Una prueba de paridad compara el estado del registro tras todas las migraciones con el catálogo.
3. **Una sola RPC de hechos por tablero** (`dashboard_facts`) que devuelve jsonb con las fuentes pedidas, agregadas por centro y periodo, reutilizando las funciones de hechos (y sus permisos). El cliente pide la periodicidad más fina que necesite alguna serie y re-agrupa desde días; si los hechos vienen por semana, las series mensuales se muestran por semana.
4. **El cálculo se hace en el cliente con las funciones compartidas** (servidor web y app móvil), no en SQL: una fórmula, un lugar. Los filtros de canal y motor se aplican sobre los hechos sólo en las métricas que los declaran; las demás avisan.
5. **Tableros y widgets** se escriben por RPC con idempotencia, versión y motivo (auditados); la vista personal es del usuario (RLS por `auth.uid()`, sin auditoría de negocio).
6. **Audiencia por rol + centros permitidos** en el tablero; permiso por métrica en cada centro para los datos.

## Consecuencias

- Agregar una métrica = KPI + entrada del catálogo + una línea de migración; ninguna pantalla cambia (ejemplo: `pnl.personnel_ratio`).
- Una métrica nueva de una **fuente nueva** requiere ampliar `dashboard_facts` (migración) y definir su `SourceSpec`.
- Si la app es más vieja que la base, un widget con una métrica que la app no conoce muestra "Métrica no disponible en esta versión" en lugar de fallar.
- El volumen de hechos crece con centros × días × líneas; la serie diaria se acota a 93 días y el rango total a 3 años (igual que el P&L).
