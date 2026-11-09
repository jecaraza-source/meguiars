import { colors } from "@meguiars/ui-tokens";
import type { MetadataRoute } from "next";

/**
 * La web se instala como app (Windows, Mac, Chromebook o Android desde Edge o
 * Chrome → «Instalar»): ícono propio y ventana sin barra del navegador.
 * Misma plataforma y misma sesión que en el navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meguiar's Detail Center",
    short_name: "Meguiar's",
    description: "Agenda, órdenes de servicio, bandeja de WhatsApp y tableros de los centros Meguiar's.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "es-MX",
    background_color: colors.background,
    theme_color: colors.brand,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
