import type {
  AlertCondition,
  AlertEventKind,
  AlertInboxStatus,
  AlertPeriod,
  AlertScopeKind,
  AlertSeverity,
  AlertStatus,
} from "./alerts";

export const ALERT_CONDITION_LABELS: Record<AlertCondition, string> = {
  below: "Por debajo de un umbral",
  above: "Por encima de un umbral",
  drop_pct: "Caída contra el periodo anterior",
  rise_pct: "Alza contra el periodo anterior",
  no_data: "Sin datos en el periodo",
};

export const ALERT_PERIOD_LABELS: Record<AlertPeriod, string> = {
  dia: "Día anterior",
  semana: "Semana anterior (lun–dom)",
  mes_en_curso: "Mes en curso (hasta ayer)",
  mes: "Mes anterior",
};

export const ALERT_SCOPE_LABELS: Record<AlertScopeKind, string> = {
  centro: "Cada centro",
  conjunto: "Conjunto de centros",
  corporativo: "Corporativo",
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  informativa: "Informativa",
  atencion: "Atención",
  critica: "Crítica",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  nueva: "Nueva",
  revisada: "Revisada",
  resuelta: "Resuelta",
};

export const ALERT_INBOX_STATUS_LABELS: Record<AlertInboxStatus, string> = {
  abiertas: "Abiertas",
  nueva: "Nuevas",
  revisada: "Revisadas",
  resuelta: "Resueltas",
  todas: "Todas",
};

export const ALERT_EVENT_LABELS: Record<AlertEventKind, string> = {
  creada: "Detectada",
  repetida: "Se repitió",
  condicion_superada: "La condición dejó de cumplirse",
  revisada: "Marcada como revisada",
  resuelta: "Resuelta",
};

export const ALERTS_COPY = {
  title: "Alertas",
  rulesTitle: "Reglas de alerta",
  empty: "Sin alertas con estos filtros.",
  emptyRules: "Aún no hay reglas. Crea una para vigilar un KPI.",
  evaluateNow: "Evaluar ahora",
  evaluating: "Evaluando…",
  review: "Marcar revisada",
  resolve: "Resolver",
  resolveNote: "Qué se hizo (obligatorio)",
  reviewNote: "Nota (opcional)",
  history: "Historial",
  viewKpi: "Ver KPI en el periodo",
  viewDrill: "Explicar la cifra",
  newRule: "Nueva regla",
  saveRule: "Guardar regla",
  cooldownHelp:
    "Tras resolver una alerta, no se vuelve a abrir otra de la misma regla y ámbito durante este tiempo.",
  scheduleHelp: "Las reglas se evalúan una vez al día (periodos cerrados).",
  conditionCleared: "La condición ya no se cumple; revísala y resuélvela.",
  authorMissing: "Sin autor: guárdala de nuevo para que la evaluación diaria la incluya.",
  resolvedKeepsHistory: "Resolver no borra la alerta: queda en el historial.",
} as const;
