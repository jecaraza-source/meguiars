"use client";

import { sectionOfPath, type NavSection } from "@meguiars/domain";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

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

/** Navegación lateral (tablet y escritorio): secciones con sus pantallas. */
export function SideNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const currentHref = currentItemHref(sections, pathname);
  return (
    <nav aria-label="Principal" className="flex flex-col gap-lg">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-xxs">
          <p className="px-sm text-xs font-bold uppercase tracking-wide text-accent">{section.label}</p>
          {section.items.map((item) => {
            const current = item.href === currentHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className="flex min-h-(--mg-touch-target) items-center rounded-md px-sm text-sm font-bold text-foreground hover:bg-surface aria-[current=page]:bg-accent aria-[current=page]:text-brand-foreground"
              >
                {item.label}
                <PendingHint className="ml-auto" />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Barra inferior (móvil web): una pestaña por sección, como la app nativa. */
export function BottomNav({ sections }: { sections: NavSection[] }) {
  const active = sectionOfPath(usePathname());
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-(--mg-z-nav) flex border-t border-border bg-surface-raised md:hidden"
    >
      {sections.map((section) => (
        <Link
          key={section.id}
          href={section.items[0]!.href}
          aria-current={section.id === active ? "page" : undefined}
          className="flex min-h-(--mg-touch-target) flex-1 items-center justify-center px-xs py-sm text-xs font-bold text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-brand-foreground"
        >
          {section.shortLabel}
          <PendingHint className="ml-xxs" />
        </Link>
      ))}
    </nav>
  );
}

/** Sub-navegación de una sección con varias pantallas (p. ej. Admin. y Finanzas). */
export function SubNav({ section }: { section: NavSection }) {
  const pathname = usePathname();
  if (section.items.length < 2) return null;
  return (
    <nav aria-label={section.label} className="flex gap-xs overflow-x-auto">
      {section.items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={currentItemHref([section], pathname) === item.href ? "page" : undefined}
          className="inline-flex min-h-(--mg-touch-target) items-center whitespace-nowrap rounded-full border border-accent px-md text-sm font-bold text-accent hover:bg-surface aria-[current=page]:bg-accent aria-[current=page]:text-brand-foreground"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
