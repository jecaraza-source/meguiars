import type { CenterAccess } from "./access/access";
import { summarizeAccess } from "./access/access";

/** Textos de las pantallas de cada dominio, idénticos en web y móvil. */
export const sectionCopy = {
  operacion: {
    title: "Operación del día",
    description: "Órdenes de servicio, agenda y avance en taller del centro activo.",
    emptyTitle: "Aún no hay operación registrada",
    emptyMessage: "Abre órdenes de servicio desde la agenda o como walk-in. Aquí verás el avance del día.",
  },
  comercial: {
    title: "Comercial",
    description: "Membresías, clientes (CRM), seguimientos y cuentas B2B del centro activo.",
    emptyTitle: "Aún no hay membresías en este periodo",
    emptyMessage:
      "Contrata membresías en Comercial → Membresías. Las cuentas B2B llegan en su propio módulo.",
  },
  finanzas: {
    title: "Resumen financiero",
    description: "Ingresos, costos y resultado del centro como centro de costos independiente.",
    emptyTitle: "Aún no hay movimientos",
    emptyMessage: "Los indicadores financieros aparecerán cuando existan órdenes y cobros registrados.",
  },
  direccion: {
    title: "Vista consolidada",
    description: "Resumen de todos los centros a los que tienes acceso.",
  },
  designSystem: {
    title: "Sistema de diseño",
    description:
      "Tokens y componentes base compartidos por web y móvil. Los datos de esta página son de ejemplo.",
  },
} as const;

export interface KpiValue {
  label: string;
  value: string;
  caption?: string;
}

/** KPIs de Dirección calculados con los accesos reales del usuario. */
export function executiveKpis(access: readonly CenterAccess[]): KpiValue[] {
  const s = summarizeAccess(access);
  return [
    { label: "Centros activos", value: String(s.activeCenters), caption: `de ${s.centers} en total` },
    { label: "Centros deshabilitados", value: String(s.centers - s.activeCenters) },
    { label: "Organizaciones", value: String(s.organizations) },
    {
      label: "Alcance corporativo",
      value: String(s.corporateCenters),
      caption: s.corporateCenters > 0 ? "centros con rol corporativo" : "acceso sólo por centro",
    },
  ];
}
