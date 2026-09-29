# Módulo AF2 — Administración y Finanzas / Egresos y costos

## Alcance

Controlar las salidas de dinero de cada centro y separar el costo directo del gasto operativo, con paridad web y móvil.

- **Categorías editables**, cada una mapeada a un grupo del P&L: costo directo, compra de insumos, personal, operativo, administrativo, marketing, financiero u otros.
- **Egreso:** monto, proveedor (opcional), forma de pago, fecha del pago, centro, concepto, referencia y notas.
- **Comprobantes** (foto o PDF) en Storage privado.
- **Aprobación opcional** por umbral configurable por centro.
- **Edición y anulación** con motivo, historial y auditoría.
- **Filtros** por centro (o todos), fecha, categoría, proveedor, estado y grupo del P&L.
- **Estado de resultados** (P&L) por centro o consolidado.

Decisiones en [ADR 0019](../adr/0019-egresos-costo-economico-vs-salida-de-caja.md).

## Costo económico vs salida de caja (sin doble conteo)

| Concepto                           | Dónde vive                                                                                                         | ¿P&L?  | ¿Salida de caja? |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ | ---------------- |
| Costo directo del servicio         | La OS: costo estándar congelado por línea + pago al operador (`cost_total`, CR1) + variación real de insumos (O5). | Sí     | No (ya se pagó)  |
| Compra de insumos                  | Egreso del grupo `insumos`.                                                                                        | **No** | Sí               |
| Costo directo que la OS no captura | Egreso del grupo `costo_directo` (p. ej. subcontratos, fletes).                                                    | Sí     | Sí               |
| Nómina, renta, servicios, etc.     | Egresos de personal, operativo, administrativo, marketing, financiero u otros.                                     | Sí     | Sí               |

Comprar un galón de cera es una salida de caja. Su costo, en cambio, se reconoce cuando la OS consume la cera (costo estándar de la línea más la variación real registrada en la ejecución). Si la compra también se contara como gasto, el P&L la contaría dos veces. Por eso el grupo `insumos` sale del P&L y se reporta en "Salidas de caja".

Supuesto del modelo: el costo estándar del catálogo (`standard_direct_cost`) incluye sólo materiales e insumos variables; la mano de obra se registra como egreso de personal.

## Modelo de datos (`20261008000000_expenses.sql`)

```
expense_categories (organización) ─< expenses (centro) ─< expense_attachments (bucket expense-receipts)
vendors (organización) ─< expenses
expense_settings (centro: umbral)
expenses ─< approval_events (inmutable)
```

| Tabla                 | Notas                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expense_categories`  | Clave, nombre, grupo del P&L, orden y activa. Cada organización nace con 10 categorías mínimas (también las existentes, en la migración).                                                                   |
| `vendors`             | Nombre único por organización (sin distinguir mayúsculas), RFC, teléfono y email opcionales.                                                                                                                |
| `expense_settings`    | `approval_threshold` por centro (null = no se exige aprobación).                                                                                                                                            |
| `expenses`            | Folio por centro (`CDMX-01-E-000001`), categoría y **grupo del P&L congelado**, proveedor, concepto, monto, forma de pago, fecha del pago (calendario del centro), estado, aprobación, anulación y versión. |
| `expense_attachments` | Ruta `<org>/<centro>/<egreso>/<uuid>.<ext>`, tipo (JPEG, PNG, WebP o PDF) y tamaño (≤ 10 MB). Se retiran con motivo; el archivo se conserva.                                                                |
| `approval_events`     | `solicitada`, `autoaprobada`, `aprobada`, `rechazada`, `editada` o `anulada`, con importe, nota, actor y fecha. Inmutable.                                                                                  |

Todas con RLS de sólo lectura; las escrituras van por RPC. Categorías, proveedores, umbral, egresos y comprobantes llevan `audit_row` (actor, fecha, valores anterior y nuevo) y motivo. Egresos y comprobantes no se borran.

## Reglas

| Regla              | Detalle                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captura            | Categoría activa de la organización, proveedor activo (opcional), monto > 0 con 2 decimales, forma de pago válida y fecha no futura (22023). Idempotente por `request_id`.                        |
| Umbral             | Monto ≥ umbral del centro → **pendiente** de aprobación. Si lo captura un admin, queda aprobado con el evento `autoaprobada` (registrado).                                                        |
| Aprobar / rechazar | Sólo el admin (42501), sólo pendientes. Rechazar exige motivo.                                                                                                                                    |
| Editar             | Con motivo y versión (40001). Se reevalúa la aprobación: un aprobado que ahora supera el umbral vuelve a pendiente si no lo edita un admin; un rechazado corregido bajo el umbral queda aprobado. |
| Anular             | Con motivo. El admin anula cualquiera; el encargado, sólo pendientes o rechazados. Un anulado ya no cambia ni recibe comprobantes.                                                                |
| Reclasificar       | Cambiar el grupo de una categoría sólo afecta egresos nuevos o editados: el P&L histórico no se reescribe.                                                                                        |
| P&L                | Sólo cuentan los aprobados (por fecha del pago). Los pendientes se muestran aparte y los anulados y rechazados no cuentan.                                                                        |
| Sin conexión       | Las mutaciones requieren conexión (sin cola offline); el `request_id` y el uuid del archivo hacen seguro el reintento.                                                                            |

## Estado de resultados

Desde AF4 el estado de resultados vive en [P&L multicentro](pnl.md): ahí están las fórmulas vigentes (utilidad bruta, EBITDA gerencial), el drill-down y la exportación. Los egresos aprobados alimentan sus líneas de costo directo, personal, operativos y financieros; la compra de insumos y los pendientes quedan fuera del P&L. `pnl_facts` conserva su contrato y sale de los mismos movimientos.

## Permisos

| Capacidad          | Roles                          | Espejo en SQL                        |
| ------------------ | ------------------------------ | ------------------------------------ |
| `expenses.read`    | admin, encargado, contador     | `private.can_read_expenses`          |
| `expenses.write`   | admin, encargado               | `private.can_write_expenses`         |
| `expenses.approve` | admin                          | `private.can_approve_expenses`       |
| `expenses.manage`  | admin corporativo (categorías) | `private.can_manage_expense_catalog` |

El contador consulta egresos, comprobantes y P&L, y sigue de sólo lectura. Recepción y el comercial B2B no ven egresos ni comprobantes. Los comprobantes respetan el centro: la política de Storage valida organización, centro y egreso en la ruta, y la lectura se hace con URLs firmadas de 10 minutos.

## RPC

| RPC                                  | Uso                                           |
| ------------------------------------ | --------------------------------------------- |
| `create_expense`                     | Alta (idempotente) con evaluación del umbral. |
| `update_expense`                     | Edición con motivo y versión.                 |
| `approve_expense` / `reject_expense` | Decisión del admin.                           |
| `void_expense`                       | Anulación con motivo.                         |
| `register_expense_attachment`        | Registra un comprobante ya subido al bucket.  |
| `remove_expense_attachment`          | Retira un comprobante con motivo.             |
| `upsert_vendor`                      | Proveedor (quien captura egresos).            |
| `upsert_expense_category`            | Categoría (admin corporativo).                |
| `set_expense_approval_threshold`     | Umbral del centro (admin).                    |
| `list_expenses`                      | Listado con filtros.                          |
| `expense_detail`                     | Ficha con comprobantes e historial (jsonb).   |
| `pnl_facts`                          | Hechos del P&L por centro.                    |

## Pantallas

| Web                               | Móvil                   | Contenido                                                                                   |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `/finanzas/egresos`               | `ExpensesScreen`        | Filtros, total aprobado y listado.                                                          |
| `/finanzas/egresos/nuevo`         | `ExpenseNewScreen`      | Alta con aviso de aprobación y comprobante (web: archivo; móvil: cámara, galería o PDF).    |
| `/finanzas/egresos/[id]`          | `ExpenseScreen`         | Datos, aprobar/rechazar, comprobantes (ver, adjuntar, retirar), historial, editar y anular. |
| `/finanzas/egresos/configuracion` | `ExpenseSettingsScreen` | Umbral, proveedores y categorías.                                                           |
| `/finanzas/resultados`            | `PnlScreen`             | Estado de resultados (ver [P&L multicentro](pnl.md)).                                       |

Estados de carga, vacío, error y sin permiso en todas. Móvil agrega `expo-document-picker` para elegir PDFs.

## Datos seed

CDMX con umbral de $5,000, el proveedor "Químicos del Valle", una renta aprobada, una compra de insumos (fuera del P&L) y una nómina pendiente de aprobación.

## Pruebas

- **SQL** (`supabase/tests/expenses.test.sql`), 49 aserciones:
  - categorías mínimas y catálogo corporativo; proveedores sin duplicados;
  - umbral sólo para el admin; captura, idempotencia y validaciones;
  - pendiente, aprobación, rechazo y autoaprobación con historial;
  - edición con motivo y versión, reevaluación y auditoría (actor, valores y motivo);
  - anulación; nada se borra; historial inmutable; reclasificación sin reescribir la historia;
  - comprobantes (rutas, egreso anulado, sin archivo, contador lee pero no sube, otro centro, recepción y comercial sin acceso, retiro con motivo);
  - filtros; P&L con OS entregada, membresía, variación de insumos y egresos por grupo; sin doble conteo.
- **Actualización:** categorías mínimas para organizaciones existentes.
- **Unitarias:** reglas de dominio, validación, `pnlStatement`, repositorio (subida al bucket y URL firmada) y paridad SQL.
- **E2E web** (Playwright contra un servidor falso, fuera del repo), 9 comprobaciones:
  - umbral y proveedor;
  - alta con PDF y URL firmada;
  - pendiente, aprobación y rechazo;
  - edición con motivo;
  - anulación;
  - filtros;
  - P&L sin doble conteo;
  - contador de sólo lectura; recepción y comercial sin acceso.

## Variables de entorno

Ninguna nueva. El bucket `expense-receipts` lo crea la migración.

## Pendientes

- Cuentas por pagar (egresos a crédito con vencimiento) y pagos parciales a proveedores.
- Inventario valuado (compras de insumos contra existencias).
- Impuestos (IVA acreditable) y CFDI de proveedores.
- Presupuestos por categoría.
- Prorrateo de gastos corporativos entre centros.
