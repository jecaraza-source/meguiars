export const APP_NAME = "Meguiar's Detail Center";

/** Logo de la marca (web: /brand/meguiars-logo.png; móvil: assets/brand/meguiars-logo.png). */
export const BRAND_LOGO = {
  alt: "Meguiar's, since 1901",
  /** Proporción ancho/alto del archivo recortado (346 × 237). */
  aspectRatio: 346 / 237,
} as const;

/**
 * Textos de error inesperado y de página inexistente, idénticos en web y móvil.
 * Nunca muestran el detalle técnico: sólo una referencia para cruzar con los logs.
 */
export const errorCopy = {
  title: "Algo salió mal",
  message:
    "No pudimos mostrar esta pantalla. Lo que ya guardaste no se perdió. Intenta de nuevo; si se repite, avisa al administrador con la referencia.",
  retry: "Reintentar",
  home: "Ir al inicio",
  reference: (id: string) => `Referencia: ${id}`,
  notFoundTitle: "No encontramos esta página",
  notFoundMessage: "La dirección no existe o el registro ya no está disponible.",
} as const;
