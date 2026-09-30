import type {
  CampaignObjective,
  CampaignStatus,
  ContentFormat,
  ContentStatus,
  CampaignChannel,
  PromotionState,
} from "./marketing";

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  google: "Google",
  email: "Correo",
  otro: "Otro",
};

export const CAMPAIGN_OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  prospectos: "Conseguir prospectos",
  reservas: "Reservas",
  ventas: "Ventas",
  reactivacion: "Reactivar clientes",
  marca: "Marca",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planeada: "Planeada",
  activa: "Activa",
  pausada: "Pausada",
  terminada: "Terminada",
  cancelada: "Cancelada",
};

export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  publicacion: "Publicación",
  carrusel: "Carrusel",
  reel: "Reel",
  historia: "Historia",
  video: "Video",
  estado: "Estado de WhatsApp",
  correo: "Correo",
  otro: "Otro",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: "Idea",
  borrador: "Borrador",
  programada: "Programada",
  publicada: "Publicada",
  cancelada: "Cancelada",
};

export const PROMOTION_STATE_LABELS: Record<PromotionState, string> = {
  vigente: "Vigente",
  programada: "Programada",
  vencida: "Vencida",
  agotada: "Agotada",
  inactiva: "Inactiva",
};

export const MARKETING_COPY = {
  calendarTitle: "Calendario de contenido",
  campaignsTitle: "Campañas",
  promotionsTitle: "Promociones",
  newCampaign: "Nueva campaña",
  newPost: "Planear publicación",
  newPromotion: "Nueva promoción",
  noCampaigns: "Sin campañas en este periodo.",
  noPosts: "Nada planeado en este periodo.",
  noPromotions: "Sin promociones.",
  publishNote:
    "La plataforma no publica en redes: publica desde cada red con el enlace UTM y marca aquí la publicación con su enlace.",
  attributionNote:
    "Atribución: prospectos ligados a la campaña (a mano o al aplicar una de sus promociones). Ventas = OS entregadas que ganaron a esos prospectos, una sola vez.",
  salesPerPesoNote:
    "Ventas por peso invertido no es utilidad: el margen después de la inversión descuenta costos directos, pago al operador y la inversión.",
  spendNote:
    "Liga el gasto a su egreso (grupo marketing) para que el P&L y la campaña lean el mismo dinero sin capturarlo dos veces.",
  promotionNote:
    "Las promociones son descuentos preautorizados por el admin: quien las aplica no necesita nivel de autorización. Una por cotización u OS.",
} as const;
