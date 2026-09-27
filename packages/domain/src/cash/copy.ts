import type { StatusTone } from "../agenda/copy";
import type { CashDifferenceKind, CashSessionStatus, CashShift } from "./cash";

export const CASH_SHIFT_LABELS: Record<CashShift, string> = {
  unico: "Día completo",
  matutino: "Matutino",
  vespertino: "Vespertino",
  nocturno: "Nocturno",
};

export const CASH_SESSION_STATUS_LABELS: Record<CashSessionStatus, string> = {
  abierta: "Abierta",
  cerrada: "Cerrada",
  reabierta: "Reabierta (recuento)",
};

export const CASH_SESSION_STATUS_TONES: Record<CashSessionStatus, StatusTone> = {
  abierta: "info",
  cerrada: "success",
  reabierta: "warning",
};

export const CASH_DIFFERENCE_LABELS: Record<CashDifferenceKind, string> = {
  cuadrado: "Cuadrado",
  faltante: "Faltante",
  sobrante: "Sobrante",
};

export const CASH_DIFFERENCE_TONES: Record<CashDifferenceKind, StatusTone> = {
  cuadrado: "success",
  faltante: "danger",
  sobrante: "warning",
};

/** Textos del corte de caja, idénticos en web y móvil. */
export const cashCopy = {
  title: "Corte de caja",
  description:
    "Apertura y cierre de caja por centro y turno; el sistema calcula el esperado desde los cobros.",
  empty: "Sin cortes en el periodo.",
  forbidden: "Sin permiso para esta acción.",
  notFound: "El corte no existe o no tienes acceso.",
  onlineOnly: "El corte de caja requiere conexión: no se guarda sin internet.",
  scopeCenter: "Centro activo",
  scopeAll: "Todos mis centros",
  rangeToday: "Hoy",
  range7: "Últimos 7 días",
  range30: "Últimos 30 días",
  // Apertura
  open: "Abrir caja",
  openTitle: "Abrir caja del turno",
  shift: "Turno",
  openingFloat: "Fondo inicial (MXN)",
  openNotes: "Notas (opcional)",
  opened: "Caja abierta.",
  openHint: "Una sola caja abierta por centro y un corte por día y turno.",
  noOpen: "No hay caja abierta en el centro.",
  openNow: "Caja abierta",
  // Cierre
  close: "Cerrar caja",
  closeTitle: "Arqueo y cierre",
  countedCash: "Efectivo contado (MXN)",
  closeNotes: "Nota del cierre",
  closeNoteRequired: "Explica la diferencia (faltante o sobrante).",
  closeHint:
    "Cuenta el efectivo del cajón (incluido el fondo). El sistema calcula el esperado y la diferencia; al cerrar, el corte queda bloqueado.",
  closed: "Caja cerrada.",
  // Reapertura
  reopen: "Reabrir corte",
  reopenReason: "Motivo de la reapertura",
  reopenHint:
    "Sólo el admin reabre, con motivo. Se conserva el cierre anterior y el esperado no cambia: se corrige el conteo.",
  reopened: "Corte reabierto para recuento.",
  // Ficha
  folio: "Folio",
  day: "Día",
  status: "Estado",
  openedBy: "Abrió",
  closedBy: "Cerró",
  window: "Ventana",
  expected: "Efectivo esperado",
  counted: "Efectivo contado",
  difference: "Diferencia",
  cashCollected: "Efectivo cobrado",
  cashRefunded: "Reembolsos en efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  nonCash: "Sin efectivo (membresía, crédito B2B)",
  reconciliation: "Conciliación informativa",
  byMethod: "Por forma de pago",
  method: "Forma de pago",
  collected: "Cobrado",
  refunded: "Reembolsado",
  net: "Neto",
  payments: "Recibos",
  reversals: "Reversos",
  movements: "Movimientos de la ventana",
  movementsEmpty: "Sin cobros ni reversos en la ventana.",
  history: "Versiones del cierre",
  reopenings: "Reaperturas",
  verified: "Verificado: el esperado coincide con los cobros.",
  notVerified: "El esperado recalculado no coincide con el cierre: revisa la auditoría.",
  live: "Al momento",
  uncovered: "Efectivo cobrado sin caja abierta",
  uncoveredHint: "Cobros en efectivo fuera de cualquier corte: abre caja antes de cobrar.",
  // Exportación
  export: "Exportar",
  exportCsv: "Descargar CSV",
  print: "Imprimir resumen",
  share: "Compartir resumen",
  summaryTitle: "Resumen del corte de caja",
} as const;
