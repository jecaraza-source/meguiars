/**
 * Canales de la bandeja y las publicaciones (CR2). En la fase 1 ninguno está
 * conectado: la pantalla de integraciones lo dice tal cual y ofrece el flujo
 * manual. Las capacidades exactas de cada API, los tipos de cuenta y los
 * permisos se confirman con la documentación oficial vigente al implementar
 * cada conexión (fase 2); aquí no se afirma nada que no se haya comprobado.
 */
export const INTEGRATION_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp_business",
  "google_business_profile",
  "tiktok",
] as const;
export type IntegrationChannel = (typeof INTEGRATION_CHANNELS)[number];

/** conectada: probada con una cuenta real; pendiente: implementada, falta configurar; no_disponible: aún no existe. */
export type IntegrationStatus = "conectada" | "pendiente_configurar" | "no_disponible";

export interface IntegrationInfo {
  channel: IntegrationChannel;
  label: string;
  status: IntegrationStatus;
  /** Fase en la que se implementa la conexión oficial. */
  phase: 2 | 3 | null;
  priority: boolean;
  /** Qué se puede hacer hoy sin la conexión. */
  manualFlow: string;
}

export const INTEGRATIONS: readonly IntegrationInfo[] = [
  {
    channel: "instagram",
    label: "Instagram",
    status: "no_disponible",
    phase: 2,
    priority: true,
    manualFlow: "Registra cada consulta como prospecto con canal Instagram y su usuario (@).",
  },
  {
    channel: "facebook",
    label: "Facebook",
    status: "no_disponible",
    phase: 2,
    priority: true,
    manualFlow: "Registra cada mensaje o comentario como prospecto con canal Facebook.",
  },
  {
    channel: "whatsapp_business",
    label: "WhatsApp Business",
    status: "no_disponible",
    phase: 2,
    priority: true,
    manualFlow:
      "Registra la consulta con canal WhatsApp; comparte la cotización desde tu teléfono y márcala como enviada.",
  },
  {
    channel: "google_business_profile",
    label: "Google Business Profile",
    status: "no_disponible",
    phase: null,
    priority: false,
    manualFlow: "Registra las consultas que lleguen por Google con canal Google.",
  },
  {
    channel: "tiktok",
    label: "TikTok",
    status: "no_disponible",
    phase: null,
    priority: false,
    manualFlow: "Registra las consultas con canal «Otro» y el detalle «TikTok».",
  },
];

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  conectada: "Conectada",
  pendiente_configurar: "Pendiente de configurar",
  no_disponible: "Aún no disponible",
};
