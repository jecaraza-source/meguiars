import type {
  AutomationOutcome,
  AutomationPurpose,
  AutomationRunMode,
  AutomationSkipReason,
  AutomationTrigger,
} from "./automations";

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  prospecto_nuevo: "Prospecto nuevo",
  cotizacion_pendiente: "Cotización sin respuesta",
  reserva_proxima: "Reserva próxima",
  servicio_entregado: "Servicio entregado",
  mantenimiento: "Mantenimiento / recompra",
  cliente_inactivo: "Cliente inactivo",
};

/** Qué significa «días» en cada disparador. */
export const AUTOMATION_DELAY_LABELS: Record<AutomationTrigger, string> = {
  prospecto_nuevo: "No aplica (actúa el día que se registra)",
  cotizacion_pendiente: "Días desde que se envió la cotización",
  reserva_proxima: "Días antes de la cita",
  servicio_entregado: "Días después de entregar",
  mantenimiento: "Días desde el último servicio",
  cliente_inactivo: "Días sin visitas",
};

export const AUTOMATION_TRIGGER_HELP: Record<AutomationTrigger, string> = {
  prospecto_nuevo:
    "Prospectos registrados después de activarla. Puede asignar al responsable si no tiene. Operativa: se contesta a quien escribió.",
  cotizacion_pendiente:
    "Cotizaciones enviadas sin decisión ni reserva. Se detiene si se aceptan, rechazan, reservan, vencen o el cliente responde.",
  reserva_proxima:
    "Citas programadas en los próximos días. Operativa: usa el teléfono del cliente aunque no haya autorizado promociones.",
  servicio_entregado: "Pide la valoración después de entregar la OS (no B2B).",
  mantenimiento:
    "Clientes cuyo último servicio (recurrente o los elegidos) ya cumple los días y no han vuelto ni tienen cita. Promocional: sólo con consentimiento.",
  cliente_inactivo:
    "Clientes sin visitas en los días indicados y sin cita. Promocional: sólo con consentimiento.",
};

export const AUTOMATION_PURPOSE_LABELS: Record<AutomationPurpose, string> = {
  operativa: "Operativa",
  promocional: "Promocional",
};

export const AUTOMATION_RUN_MODE_LABELS: Record<AutomationRunMode, string> = {
  programada: "Programada (diaria)",
  manual: "Manual",
  vista_previa: "Vista previa",
};

export const AUTOMATION_OUTCOME_LABELS: Record<AutomationOutcome, string> = {
  tarea_creada: "Tarea creada",
  detenida: "Detenida",
};

export const AUTOMATION_SKIP_LABELS: Record<AutomationSkipReason, string> = {
  sin_consentimiento: "sin consentimiento",
  sin_canal: "sin teléfono ni correo",
  limite_frecuencia: "límite de frecuencia",
  tope_corrida: "tope por corrida",
};

export const AUTOMATIONS_COPY = {
  title: "Automatizaciones",
  newAutomation: "Nueva automatización",
  empty: "Aún no hay automatizaciones.",
  actionNote:
    "Cada automatización crea una tarea en Seguimientos con el mensaje sugerido; la persona responsable lo envía. La plataforma no manda mensajes sola: fuera de la ventana de 24 h, WhatsApp exige plantillas aprobadas por Meta, que no están configuradas.",
  scheduleNote: "Las activas corren todos los días a las 08:00 (hora del centro).",
  stopNote:
    "Una tarea pendiente se cancela sola si el cliente responde en la bandeja, reserva, retira el consentimiento o la automatización se desactiva.",
  promotionalNote:
    "Promocional: sólo a clientes que autorizaron el canal, con límite de frecuencia compartido entre promocionales.",
  noRuns: "Sin corridas todavía.",
  noExecutions: "Sin acciones todavía.",
} as const;

export const PANEL_ORIGIN_LABELS: Record<"interno" | "manual" | "proveedor", string> = {
  interno: "Dato interno",
  manual: "Registro manual",
  proveedor: "Proveedor",
};

export const PANEL_COPY = {
  title: "Panel comercial",
  attribution:
    "Atribución de un toque: el prospecto tiene a lo más una campaña (a mano o por su promoción) y cada OS gana a un solo prospecto, así que ninguna venta se cuenta dos veces. Prospectos: registrados en el periodo. Ventas: OS entregadas en el periodo (sin B2B).",
  roasNote:
    "El ROAS es ingresos ÷ inversión: no es rentabilidad neta (no descuenta costos, pago al operador ni la inversión).",
  providerNote:
    "Sin datos del proveedor: no hay una integración de anuncios (Meta Ads, Google Ads) conectada; la inversión es la registrada en Campañas.",
  spendNotSeparable:
    "Con filtro de servicio o responsable la inversión no se puede separar: los indicadores que la usan dicen «Sin datos».",
} as const;
