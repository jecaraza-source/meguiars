# Módulo D1 — Dirección / Generador de tableros ejecutivos

## Alcance

- Tableros configurables con widgets: **tarjeta KPI, serie de tiempo, barras por centro, ranking de centros, embudo y distribución**.
- Tablero: nombre, descripción, audiencia (rol), centros permitidos, periodo por defecto (hoy, semana, mes, año), rejilla y widgets. Un **tablero corporativo por defecto** por organización.
- Cada widget referencia una **métrica registrada**; no se escribe SQL.
- Filtros globales: **centros, periodo, canal (B2C / Membresía / B2B) y motor de ingreso**. Se propagan a los widgets compatibles; los demás avisan "No aplica el filtro de …".
- **Drill-down** del KPI al detalle cuando la métrica lo soporta (movimientos del P&L, cobranza, indicadores del pipeline).
- **Vista personal** por usuario (orden, ocultos, filtros guardados, favorito) y tableros por rol (audiencia).
- Web: constructor con arrastrar para reordenar y ancho (1–4 columnas) / alto (1–2 filas). Móvil: consulta con la rejilla adaptada a una columna y ajustes simples de orden y visibilidad.
- Exportación del snapshot: CSV (web descarga, móvil comparte) y PDF por impresión del navegador.

## Arquitectura

```
METRIC_CATALOG (@meguiars/analytics) ──paridad──▶ public.metric_registry (migraciones)
        │                                               ▲ FK
        ▼                                               │
 resolveDashboard(widgets, facts, ctx)          public.dashboard_widgets ─▶ dashboard_definitions
        ▲                                                                   user_dashboard_preferences
        │ una sola lectura por tablero y filtro
 public.dashboard_facts(fuentes, centros, desde, hasta, periodicidad) → jsonb
        └─ reutiliza private.pnl_movements, payment_facts, pipeline_metric_facts,
           membership_metric_facts (cada una con sus permisos por centro)
```

- **Registro de métricas** (`packages/analytics/src/dashboards/catalog.ts`): cada métrica declara id, versión, nombre, **definición**, **unidad**, **fórmula** (tomada del KPI existente: una sola fórmula en todo el sistema), **fuente** (tablas de origen), **permiso** (capacidad por centro), widgets admitidos, filtros que respeta, desgloses y drill-down, y cómo se calcula con los hechos de su fuente.
- **Servicio de métricas** (`packages/analytics/src/dashboards/resolve.ts`): `requiredSources` + `factsGrain` deciden QUÉ pedir (una llamada con todas las fuentes, a la periodicidad más fina que necesite una serie) y `resolveWidget` / `resolveDashboard` calculan cada widget por id con parámetros acotados. Un id desconocido o un tipo no admitido nunca ejecuta nada.
- **Mismo valor en web y móvil**: ambas apps usan el mismo cargador (`apps/*/src/lib/dashboards.ts`, idénticos; `scripts/dashboard-parity.test.mjs` lo exige), el mismo servicio de métricas y el mismo presentador (`@meguiars/domain`: `presentWidget`, `formatMetricValue`).
- **Sin N+1**: 12 widgets = 1 RPC de hechos (jsonb, sin el límite de 1000 filas de PostgREST) + 2 lecturas (tablero con widgets, vista personal). El e2e lo verifica.

## Modelo de datos (`20261013000000_dashboards.sql`)

| Tabla                        | Contenido                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metric_registry`            | Espejo del catálogo: id, versión, nombre, descripción, unidad, fórmula, fuente, tablas, capacidad, widgets, filtros, desgloses, drill. Sólo migraciones escriben (`private.register_metric`, gana la versión mayor).     |
| `dashboard_definitions`      | Organización, nombre, descripción, `audience_role` (null = todos), `center_ids` (null = todos), `default_range`, `is_default` (único por organización; exige audiencia y centros nulos), versión, `request_id`, archivo. |
| `dashboard_widgets`          | Métrica (FK al registro), tipo, título, posición, `col_span` 1–4, `row_span` 1–2, `options` validadas (`grain`, `limit`, `breakdown`).                                                                                   |
| `user_dashboard_preferences` | Por usuario y tablero: orden, ocultos, filtros guardados (mismas claves que la URL), favorito (uno por usuario).                                                                                                         |

Definiciones y widgets tienen motivo obligatorio y auditoría (`require_change_reason`, `audit_row`). Las preferencias son datos personales del usuario (sin auditoría de negocio).

## Permisos

| Capacidad               | Roles                                                                                               | Qué permite                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboards.read`       | admin, encargado, contador, comercial B2B                                                           | Ver tableros de su organización dirigidos a su rol (o a todos) y a alguno de sus centros; vista personal.                                          |
| `dashboards.manage`     | admin corporativo                                                                                   | Constructor: alta, edición, tablero por defecto, archivo.                                                                                          |
| Capacidad de la métrica | según la métrica (`pnl.read`, `payments.read`, `pipeline.metrics.read`, `memberships.metrics.read`) | Datos del widget en cada centro. Sin permiso en ningún centro elegido: "Sin permiso para esta métrica"; en parte: aviso con los centros excluidos. |

Recepción no tiene tableros. La base aplica todo (RLS de tableros, `can_view_dashboard`, y cada función de hechos filtra por su permiso).

## RPC

| RPC                                                                                                        | Uso                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_dashboard(org, id, request_id, version, …, widgets jsonb, reason)`                                   | Alta idempotente / edición con versión (40001) y motivo; valida métrica registrada, tipo admitido, desglose, tamaños y centros. Conserva widgets por id. |
| `archive_dashboard(id, version, reason)`                                                                   | Archiva (el corporativo por defecto no: MG002).                                                                                                          |
| `save_dashboard_preferences(dashboard, orden, ocultos, filtros, favorito)` / `reset_dashboard_preferences` | Vista personal (descarta ids ajenos).                                                                                                                    |
| `dashboard_facts(fuentes, centros, desde, hasta, periodicidad)`                                            | Hechos agregados por centro y periodo (`total`, `dia` ≤ 93 días, `semana`, `mes`).                                                                       |

## Pantallas

| Web                                         | Móvil                         | Qué hace                                                                              |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `/direccion/tableros`                       | `DashboardsScreen`            | Tableros visibles, favorito primero.                                                  |
| `/direccion/tableros/[id]`                  | `DashboardScreen`             | Filtros, widgets, fórmula/definición/fuente, drill-down, exportación, vista personal. |
| `/direccion/tableros/nuevo`, `/[id]/editar` | (mensaje: constructor en web) | Constructor.                                                                          |

## Agregar una métrica (ejemplo completo: `pnl.personnel_ratio`)

Commit "D1: ejemplo de métrica nueva — gasto de personal sobre ventas". Ninguna pantalla cambia.

1. **KPI** (fórmula única) en `packages/analytics/src/pnl.ts`:
   ```ts
   export const pnlPersonnelRatio = kpi(
     "pnl.personnel_ratio",
     "Gasto de personal sobre ventas",
     "Gastos de personal aprobados ÷ ventas × 100 (0 si no hay ventas)",
     "percent",
     (s) => (s.revenue > 0 ? round2((s.personnel * 100) / s.revenue) : 0),
   );
   ```
2. **Catálogo** en `packages/analytics/src/dashboards/catalog.ts`:
   ```ts
   pnl({
     id: "pnl.personnel_ratio",
     version: 1,
     kpi: pnlPersonnelRatio,
     description: "Cuánto de cada peso vendido se va en nómina y prestaciones.",
     widgets: ["kpi", "timeseries", "bars", "ranking"],
     drill: { kind: "pnl", section: "gasto", line: "personal" },
     value: pnlValue(pnlPersonnelRatio),
   }),
   ```
3. **Migración nueva** (`supabase/migrations/20261014000000_metric_personnel_ratio.sql`) con una línea `select private.register_metric('pnl.personnel_ratio', 1, …)` con los mismos datos.
4. **Pruebas**: `metric-registry.test.ts` falla si el código y la migración no coinciden; agrega un caso del cálculo en `dashboards.test.ts`.

Para cambiar una fórmula o lo que admite una métrica: sube `version` en el catálogo y registra la misma versión en una migración nueva. Para una fuente nueva de hechos: agrégala a `dashboard_facts` (y a `METRIC_SOURCES`) en una migración y define su `SourceSpec`.

## Datos seed

El corporativo por defecto (12 widgets; la migración también lo crea para organizaciones existentes), "Comercial" (audiencia comercial B2B: pipeline y MRR) y "Finanzas" (audiencia contador: ventas, cobranza, salidas de caja, formas de pago y margen bruto por centro).

## Pruebas

- SQL `supabase/tests/dashboards.test.sql` (46 aserciones): registro y versiones, opciones y filtros acotados, sin SQL libre, tipos y desgloses por métrica, idempotencia, versión y motivo, tablero por defecto, visibilidad por rol/centro/organización, archivo, vista personal, hechos iguales al P&L y permisos por centro. Actualización: `upgrade/20261013000000_dashboards.after.sql`. Seed en `scripts/test-db.sh`.
- Unitarias: catálogo y resolvedor (`dashboards.test.ts`), paridad catálogo ↔ registro (`metric-registry.test.ts`), dominio (filtros, vista personal, drill-down, presentación, CSV), repositorio (una RPC), paridad del cargador web/móvil, navegación por rol.
- E2E web (servidor simulado): lista, una sola lectura de hechos para 12 widgets, fórmula y drill-down, filtros que se propagan, CSV, vista personal, constructor, edición con motivo, archivo y permisos por rol. Móvil: `expo export` iOS/Android.

## Variables de entorno

Ninguna nueva.

## Pendientes

- PDF en móvil (hoy se comparte el CSV; el PDF sale de la web).
- Comparativo contra el periodo anterior en la tarjeta KPI.
- Métricas de otras fuentes (agenda, ejecución, CxC) cuando se necesiten: requieren agregarlas a `dashboard_facts`.
