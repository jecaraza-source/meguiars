import type {
  DashboardChannelKey,
  DashboardEngineKey,
  DashboardRange,
  DashboardWidgetType,
  WidgetBreakdown,
  WidgetGrain,
} from "./dashboards";

export const WIDGET_TYPE_LABELS: Record<DashboardWidgetType, string> = {
  kpi: "Tarjeta KPI",
  timeseries: "Serie de tiempo",
  bars: "Barras por centro",
  ranking: "Ranking de centros",
  funnel: "Embudo",
  distribution: "Distribución",
};

export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
  anio: "Este año",
};

export const DASHBOARD_CHANNEL_LABELS: Record<DashboardChannelKey, string> = {
  b2c: "B2C",
  membresia: "Membresía",
  b2b: "B2B",
};

export const DASHBOARD_ENGINE_LABELS: Record<DashboardEngineKey, string> = {
  recurrente: "Recurrente",
  valor_medio: "Valor medio",
  premium: "Premium",
  producto_complemento: "Producto / complemento",
  membresia: "Membresía",
  cuota_b2b: "Cuota B2B",
};

export const WIDGET_GRAIN_LABELS: Record<WidgetGrain, string> = {
  auto: "Automática",
  dia: "Por día",
  semana: "Por semana",
  mes: "Por mes",
};

export const WIDGET_BREAKDOWN_LABELS: Record<WidgetBreakdown, string> = {
  motor: "Por motor de ingreso",
  canal: "Por canal",
  forma_pago: "Por forma de pago",
};

export const METRIC_SOURCE_LABELS: Record<string, string> = {
  pnl: "Estado de resultados",
  payments: "Cobranza",
  pipeline: "Pipeline comercial",
  memberships: "Membresías",
};

/** Textos de los tableros ejecutivos, idénticos en web y móvil. */
export const dashboardsCopy = {
  title: "Tableros",
  description: "Tableros ejecutivos con métricas registradas, filtros globales y vista personal.",
  empty: "No hay tableros para tu rol en este centro.",
  newDashboard: "Nuevo tablero",
  edit: "Editar tablero",
  archive: "Archivar tablero",
  archiveReason: "Motivo del archivo",
  archived: "Tablero archivado",
  saved: "Tablero guardado",
  corporate: "Corporativo por defecto",
  favorite: "Favorito",
  audienceAll: "Todos los roles",
  centersAll: "Todos los centros",
  filters: "Filtros",
  centers: "Centros",
  period: "Periodo",
  channel: "Canal",
  engine: "Motor de ingreso",
  all: "Todos",
  apply: "Aplicar",
  from: "Desde",
  to: "Hasta",
  exportCsv: "Exportar CSV",
  exportPdf: "Imprimir / PDF",
  shareCsv: "Compartir CSV",
  myView: "Mi vista",
  saveView: "Guardar mi vista",
  viewSaved: "Vista guardada",
  resetView: "Restablecer vista",
  setFavorite: "Marcar como mi tablero",
  hiddenWidgets: "Widgets ocultos",
  hide: "Ocultar",
  show: "Mostrar",
  moveUp: "Subir",
  moveDown: "Bajar",
  customize: "Personalizar",
  done: "Listo",
  drill: "Ver detalle",
  formula: "Fórmula",
  definition: "Definición",
  source: "Fuente",
  forbidden: "Sin permiso para esta métrica en los centros elegidos.",
  unknownMetric: "Métrica no disponible en esta versión de la app.",
  unsupported: "La métrica no admite este tipo de widget.",
  noData: "Sin datos en el periodo.",
  ignoredFilter: (names: string) => `No aplica el filtro de ${names}`,
  withoutAccess: (names: string) => `Sin permiso en: ${names}`,
  onlineOnly: "Los tableros necesitan conexión.",
  forbiddenDashboard: "No tienes acceso a este tablero.",
  notFound: "El tablero no existe o ya no está disponible.",
  // Constructor
  builderTitle: "Constructor de tableros",
  name: "Nombre",
  descriptionLabel: "Descripción",
  audience: "Audiencia",
  allowedCenters: "Centros permitidos",
  defaultRange: "Periodo por defecto",
  isDefault: "Tablero corporativo por defecto",
  widgets: "Widgets",
  addWidget: "Agregar widget",
  metric: "Métrica",
  widgetType: "Tipo de widget",
  widgetTitle: "Título (opcional)",
  width: "Ancho",
  height: "Alto",
  grain: "Periodicidad",
  limit: "Centros en el ranking",
  breakdown: "Desglose",
  remove: "Quitar",
  dragHint: "Arrastra para reordenar; ajusta ancho (1–4 columnas) y alto (1–2 filas).",
  reason: "Motivo del cambio",
  save: "Guardar tablero",
  cancel: "Cancelar",
  noSqlNote: "Sólo métricas registradas: no se escribe SQL.",
  columns: (n: number) => (n === 1 ? "1 columna" : `${n} columnas`),
  rows: (n: number) => (n === 1 ? "1 fila" : `${n} filas`),
} as const;
