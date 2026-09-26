"use client";

import { sectionOfPath, type NavSection } from "@meguiars/domain";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Navegación lateral (tablet y escritorio): secciones con sus pantallas. */
export function SideNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-lg">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-xxs">
          <p className="px-sm text-xs font-medium uppercase tracking-wide text-muted">{section.label}</p>
          {section.items.map((item) => {
            const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className="flex min-h-(--mg-touch-target) items-center rounded-md px-sm text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-semibold"
              >
                {item.label}
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
          className="flex min-h-(--mg-touch-target) flex-1 items-center justify-center px-xs py-sm text-xs text-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
        >
          {section.shortLabel}
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
          aria-current={pathname === item.href ? "page" : undefined}
          className="mg-badge min-h-(--mg-touch-target) whitespace-nowrap px-md aria-[current=page]:font-semibold"
          data-tone="neutral"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
