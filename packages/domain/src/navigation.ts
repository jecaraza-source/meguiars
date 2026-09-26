import { guardScreen, type Screen } from "./auth/guards";
import type { AuthState } from "./auth/session";

/**
 * Navegación principal compartida por web y móvil: cuatro dominios de negocio
 * más Inicio. Una sección se muestra si el rol del centro activo puede ver al
 * menos una de sus pantallas (mismos guards que protegen las rutas).
 */
export type NavSectionId = "inicio" | "operacion" | "comercial" | "finanzas" | "direccion";

export interface NavItem {
  screen: Screen;
  label: string;
  /** Ruta web (móvil usa `screen`). */
  href: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  /** Etiqueta corta para barras de pestañas. */
  shortLabel: string;
  items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "inicio",
    label: "Inicio",
    shortLabel: "Inicio",
    items: [{ screen: "home", label: "Mi centro", href: "/" }],
  },
  {
    id: "operacion",
    label: "Operación",
    shortLabel: "Operación",
    items: [{ screen: "operacion", label: "Operación del día", href: "/operacion" }],
  },
  {
    id: "comercial",
    label: "Comercial",
    shortLabel: "Comercial",
    items: [{ screen: "comercial", label: "Clientes, membresías y B2B", href: "/comercial" }],
  },
  {
    id: "finanzas",
    label: "Administración y Finanzas",
    shortLabel: "Admin.",
    items: [
      { screen: "finanzas", label: "Resumen financiero", href: "/finanzas" },
      { screen: "team", label: "Equipo del centro", href: "/equipo" },
    ],
  },
  {
    id: "direccion",
    label: "Dirección",
    shortLabel: "Dirección",
    items: [{ screen: "direccion", label: "Vista consolidada", href: "/direccion" }],
  },
];

/** Secciones e ítems visibles para el estado de sesión (filtrados por guard). */
export function visibleNavigation(state: AuthState): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => guardScreen(state, item.screen).allow),
  })).filter((section) => section.items.length > 0);
}

/** Sección a la que pertenece una pantalla (para marcar la pestaña activa). */
export function sectionOfScreen(screen: Screen): NavSectionId | null {
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.screen === screen))?.id ?? null;
}

/** Sección activa a partir de la ruta web. */
export function sectionOfPath(pathname: string): NavSectionId | null {
  let best: { id: NavSectionId; length: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const match =
        item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (!best || item.href.length > best.length))
        best = { id: section.id, length: item.href.length };
    }
  }
  return best?.id ?? null;
}
