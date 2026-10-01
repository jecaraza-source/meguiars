"use client";

import { sectionOfPath, type NavSection } from "@meguiars/domain";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/icon";

/**
 * Ítem de menú que corresponde a la ruta: el de href más largo que la contiene
 * (así /finanzas/resultados marca "Estado de resultados" y no también "Resumen financiero").
 */
function currentItemHref(sections: NavSection[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of sections.flatMap((s) => s.items)) {
    const match =
      item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (match && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/**
 * Indicador de navegación en curso dentro del enlace pulsado: las pantallas son
 * dinámicas (datos del centro) y sin él el clic parece no responder. Tamaño fijo
 * y sólo cambia la opacidad (sin saltos de layout).
 */
function PendingHint({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending}
      className={`${className} size-xs shrink-0 rounded-full bg-current opacity-0 transition-opacity data-[pending=true]:opacity-100 motion-safe:data-[pending=true]:animate-pulse`}
    />
  );
}

/**
 * Navegación lateral (tablet y escritorio): sólo los títulos de cada sección,
 * con su icono; cada uno se despliega para mostrar sus pantallas. La sección
 * de la página actual aparece abierta y resaltada. Una sección con una sola
 * pantalla (Inicio) es un enlace directo.
 */
export function SideNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const currentHref = currentItemHref(sections, pathname);
  const activeSection = sectionOfPath(pathname);
  const title =
    "group/title flex min-h-(--mg-touch-target) w-full items-center gap-sm rounded-md px-sm text-sm font-bold text-foreground transition-colors hover:bg-surface";
  const badge = (on: boolean) =>
    `flex size-xxl items-center justify-center rounded-md transition-colors ${
      on ? "bg-accent text-brand-foreground" : "bg-surface text-accent group-hover/title:bg-surface-raised"
    }`;
  return (
    <nav aria-label="Principal" className="flex flex-col gap-xxs">
      {sections.map((section) => {
        const on = section.id === activeSection;
        if (section.items.length === 1) {
          const item = section.items[0]!;
          return (
            <Link
              key={section.id}
              href={item.href}
              aria-current={item.href === currentHref ? "page" : undefined}
              data-section={section.id}
              className={`${title} aria-[current=page]:text-accent`}
            >
              <span className={badge(on)}>
                <Icon name={section.icon} />
              </span>
              {section.label}
              <PendingHint className="ml-auto" />
            </Link>
          );
        }
        return (
          <details key={section.id} open={on} data-section={section.id} className="group flex flex-col">
            <summary
              className={`${title} cursor-pointer list-none [&::-webkit-details-marker]:hidden ${on ? "text-accent" : ""}`}
            >
              <span className={badge(on)}>
                <Icon name={section.icon} />
              </span>
              {section.label}
              <Icon
                name="chevronDown"
                className="ml-auto size-lg text-muted transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-xxs mb-sm ml-lg flex flex-col gap-xxs border-l border-border pl-sm">
              {section.items.map((item) => {
                const current = item.href === currentHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className="flex min-h-(--mg-touch-target) items-center gap-sm rounded-md px-sm text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-bold aria-[current=page]:text-brand-foreground"
                  >
                    <Icon name={item.icon} />
                    {item.label}
                    <PendingHint className="ml-auto" />
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

/** Barra inferior (móvil web): una pestaña por sección, con icono, como la app nativa. */
export function BottomNav({ sections }: { sections: NavSection[] }) {
  const active = sectionOfPath(usePathname());
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-(--mg-z-nav) flex border-t border-border bg-surface-raised shadow-md md:hidden"
    >
      {sections.map((section) => (
        <Link
          key={section.id}
          href={section.items[0]!.href}
          aria-current={section.id === active ? "page" : undefined}
          className="relative flex min-h-(--mg-touch-target) min-w-0 flex-1 flex-col items-center justify-center gap-xxs px-xxs py-xs text-xs font-bold text-muted aria-[current=page]:text-accent"
        >
          <Icon name={section.icon} className="size-xl" />
          <span className="max-w-full truncate">{section.shortLabel}</span>
          <PendingHint className="absolute top-xs right-xs" />
        </Link>
      ))}
    </nav>
  );
}

/** Sub-navegación de una sección con varias pantallas (p. ej. Finanzas). */
export function SubNav({ section }: { section: NavSection }) {
  const pathname = usePathname();
  if (section.items.length < 2) return null;
  return (
    <nav aria-label={section.label} className="-mx-xs flex gap-xs overflow-x-auto px-xs pb-xs">
      {section.items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={currentItemHref([section], pathname) === item.href ? "page" : undefined}
          className="inline-flex min-h-(--mg-touch-target) shrink-0 items-center gap-xs whitespace-nowrap rounded-full border border-border bg-surface-raised px-md text-sm font-bold text-foreground shadow-sm transition-colors hover:border-accent hover:text-accent aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-brand-foreground"
        >
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
