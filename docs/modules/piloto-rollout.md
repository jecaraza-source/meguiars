# Piloto Centro 1 y rollout a Centro 2+ (F5.2)

Prepara la plataforma para pilotear en un Detail Center y abrir los siguientes **sin fork ni cambios de lógica**: un centro nuevo es un registro más, con sus datos maestros, y todos los cálculos (P&L, tableros, KPIs, alertas, métricas del piloto) lo incluyen por datos.

Documentos operativos: [checklist de datos maestros](../piloto/datos-maestros.md), [plan UAT por rol](../piloto/uat.md), [runbook](../piloto/runbook.md) y [reporte del piloto vs línea base](../piloto/reporte-piloto.md).

## Qué se puede hacer

| Pantalla                     | Web                                                                                                                                | Móvil                                                           | Quién                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Administración → **Centros** | `/equipo/centros`: lista con checklist resumido y **alta de centro**                                                               | `CentersScreen`: lista y checklist (el alta es web)             | `centers.setup` (admin_socio); el alta exige admin corporativo |
| Activación del centro        | `/equipo/centros/[id]`: checklist con cómo corregir cada punto, cambiar a ese centro, **línea base** y errores recientes de la app | `CenterSetupScreen`: checklist, línea base y errores (consulta) | `centers.setup`                                                |
| Importador de datos maestros | `/equipo/centros/[id]/importar`                                                                                                    | — (trabajo de escritorio con archivos)                          | `centers.setup` y los permisos de cada RPC                     |
| Dirección → **Piloto**       | `/direccion/piloto`: adopción diaria y resultado vs línea base (7/30/90 días; centro activo o todos)                               | `PilotScreen`                                                   | `pnl.read` (admin, encargado, contador)                        |

Los cargadores (`centersScope`, `loadCenters`, `loadCenterSetup`, `loadPilot`) son idénticos en `apps/web/src/lib/pilot.ts` y `apps/mobile/src/lib/pilot.ts` (`scripts/dashboard-parity.test.mjs`).

## Base de datos (`20261022000000_pilot.sql`)

| Objeto                                                    | Qué hace                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_detail_center(org, código, nombre, zona, motivo)` | Alta de centro por el admin corporativo; código normalizado y único; auditada.                                                                                                                                                                                                                                                     |
| `center_readiness(centro)`                                | Checklist en JSON: centro, equipo (encargado + recepción), catálogo con precio y costo, bahías, técnicos, métodos de cobro, categorías de egreso (obligatorios); membresías, B2B y línea base (recomendados). `ready` = sin obligatorios faltantes.                                                                                |
| `center_baselines` + `set_center_baseline`                | Un valor por indicador y centro (`ordenes_dia`, `ticket_promedio`, `ingreso_mensual`, `margen_bruto_pct`, `membresias_mes`, `tiempo_ciclo_min`, `entregas_a_tiempo_pct`, `diferencia_caja_promedio`) con periodo y fuente; versión, motivo y auditoría; valor vacío = borrar. Lectura: `can_read_pnl`.                             |
| `client_error_reports` + `report_client_error`            | Errores de las pantallas de error (web `error.tsx`, móvil `ErrorBoundary`), ya sin datos personales; se recortan, el centro se ignora si no es del usuario y hay máximo 30 por usuario por hora. Lectura: admin del centro o corporativo.                                                                                          |
| `pilot_metrics(centros, desde, hasta)`                    | Una fila por centro y día: usuarios activos (con al menos una acción auditada), OS creadas / entregadas / canceladas, ingreso de OS entregadas, tiempo de ciclo (apertura → entrega), entregas prometidas y a tiempo, citas, cortes (última versión de cada sesión) y diferencia de caja, membresías vendidas y errores de la app. |

Permiso de configuración: `private.can_setup_center` = admin_socio del centro o corporativo.

## Indicadores contra la línea base

`summarizePilot` (dominio) convierte las filas diarias en los mismos ocho indicadores de la línea base; el margen bruto sale del P&L del periodo. `comparePilot` marca **Mejor / Peor** según si el indicador sube o baja para bien, e **Igual** dentro de ±2 %.

## Importador

CSV de Excel o Google Sheets (coma o punto y coma, BOM, comillas), una plantilla por tipo: **servicios** (precio y costo base; precio/costo propio del centro), **bahías**, **técnicos**, **categorías de egreso** y **planes de membresía** con beneficios (`LAV-EXP:2;ENC:1`).

1. **Vista previa (no escribe):** valida con los mismos esquemas que los formularios y compara con lo existente → crear / actualizar (con el detalle de cada cambio) / sin cambios / error por columna. Filas repetidas y columnas desconocidas se señalan.
2. **Aplicar:** sólo sin errores. El servidor vuelve a leer lo existente y a armar el plan (no confía en el navegador) y ejecuta las **mismas RPC** de las pantallas con la sesión del usuario (permiso, motivo "Importación de datos maestros" y auditoría). Nunca inserta directo en tablas.
3. Se detiene en el primer error; lo anterior queda aplicado y reimportar el archivo sólo aplica lo que falta (idempotente).

Las cuentas B2B no se importan (requieren el cliente titular y el convenio): se dan de alta en Comercial → B2B y aparecen en el checklist.

## Rollout a Centro 2+

1. Admin corporativo: Administración → Centros → **Nuevo centro** (código, nombre, zona horaria).
2. En el checklist: **Cambiar a este centro**, dar de alta usuarios con su rol (Usuarios), importar bahías y técnicos, y precios propios si difieren del catálogo.
3. Capturar la **línea base** del centro.
4. Correr el [UAT](../piloto/uat.md) con usuarios del centro y abrir operación.

No hay constantes por centro en el código (sólo los ejemplos del sistema de diseño). El P&L, tableros, KPIs, alertas y métricas toman los centros del usuario o los que se pasan como filtro; `supabase/tests/pilot.test.sql` lo comprueba con un centro creado por RPC.

## Pruebas

- **SQL** `supabase/tests/pilot.test.sql`: alta de centro (permisos, código, motivo, auditoría), checklist antes y después de cargar datos, línea base (permisos, validación, versión, borrado), errores de la app (recorte, centro ajeno, límite por hora, lectura), métricas y P&L con el centro nuevo. El barrido de aislamiento (ADR 0029) incluye las funciones nuevas (157).
- **Unitarias:** dominio (checklist, resumen, comparación, adopción, periodos, permisos), validación (alta, línea base, importador: CSV, plantillas, planes por tipo, idempotencia) y repositorio.
- **E2E web** (servidor simulado): alta de GDL-01, checklist, cambio de centro, importador con errores y aplicado, línea base, piloto vs línea base, permisos (contador/operador) y 390 px.
