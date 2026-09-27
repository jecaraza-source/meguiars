import type { PnlPeriodKey, PnlSectionKey } from "./pnl";

export const PNL_PERIOD_LABELS: Record<PnlPeriodKey, string> = {
  hoy: "Hoy",
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
  personalizado: "Personalizado",
};

export const PNL_SECTION_LABELS: Record<PnlSectionKey, string> = {
  ingreso: "Ventas",
  costo_directo: "Costo directo",
  gasto: "Gastos",
  fuera_pnl: "Fuera del P&L",
};

/** Etiquetas de línea y dimensión (motor de ingreso o grupo) para el drill-down. */
export const PNL_ITEM_LABELS: Record<string, string> = {
  b2c: "Ventas B2C (OS)",
  membresia: "Membresía",
  b2b: "Ventas B2B (OS)",
  membresias: "Venta de membresías",
  cuotas_b2b: "Cuotas B2B",
  estandar: "Costo estándar de las OS",
  variacion_insumos: "Variación real de insumos",
  egresos_costo_directo: "Costos directos no capturados en la OS",
  personal: "Personal",
  operativo: "Operativo",
  administrativo: "Administrativo",
  marketing: "Marketing",
  otros: "Otros",
  financiero: "Financiero",
  insumos: "Compra de insumos (salida de caja)",
  pendiente: "Egresos pendientes de aprobación",
  recurrente: "Recurrente",
  valor_medio: "Valor medio",
  premium: "Premium",
  producto_complemento: "Producto / complemento",
  cuota_b2b: "Cuota B2B",
  descuento_os: "Descuento general de la OS",
  costo_directo: "Costo directo",
};

export const PNL_SOURCE_LABELS = {
  service_orders: "OS",
  memberships: "Membresía",
  b2b_agreements: "Convenio B2B",
  expenses: "Egreso",
} as const;

/** Textos del P&L, idénticos en web y móvil. */
export const pnlCopy = {
  title: "Estado de resultados",
  description:
    "P&L gerencial por Detail Center y consolidado: ventas por canal y motor, costo directo, utilidad bruta y EBITDA.",
  empty: "Sin movimientos en el periodo.",
  scopeCenter: "Centro activo",
  scopeAll: "Consolidado (mis centros)",
  from: "Desde",
  to: "Hasta",
  apply: "Aplicar",
  period: "Periodo",
  consolidated: "Consolidado",
  byEngine: "Ventas por motor de ingreso",
  engine: "Motor",
  amount: "Importe",
  share: "% ventas",
  outside: "Fuera del P&L",
  suppliesPurchases: "Compra de insumos (salida de caja; su costo está en la OS)",
  pending: "Egresos pendientes de aprobación (no cuentan)",
  cashOut: "Salidas de caja aprobadas del periodo",
  formulas: "Fórmulas",
  formulasNote:
    "Venta = OS entregada (no cobros). Utilidad bruta = ventas − costo directo. EBITDA gerencial = utilidad bruta − personal − operativos. Mismas fórmulas en Dirección.",
  drillTitle: "Movimientos",
  drillHint: "La suma de los movimientos es la cifra del estado de resultados.",
  drillTotal: "Total de los movimientos",
  drillEmpty: "Sin movimientos para esta cifra.",
  drillTruncated: "Se muestran los primeros 5,000 movimientos; acota el periodo para ver todos.",
  date: "Fecha",
  center: "Centro",
  source: "Origen",
  reference: "Referencia",
  detail: "Detalle",
  exportCsv: "Descargar CSV",
  print: "Imprimir / PDF",
  shareCsv: "Compartir CSV",
  back: "Estado de resultados",
} as const;
