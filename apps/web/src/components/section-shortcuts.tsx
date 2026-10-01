import type { NavSection } from "@meguiars/domain";
import Link from "next/link";
import { Icon } from "./ui/icon";

/** Accesos rápidos de Inicio: una tarjeta por sección visible, con sus primeras pantallas. */
export function SectionShortcuts({ sections }: { sections: NavSection[] }) {
  const shown = sections.filter((s) => s.id !== "inicio");
  if (shown.length === 0) return null;
  return (
    <nav aria-label="Accesos rápidos" className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((section) => (
        <div key={section.id} className="mg-card" data-testid={`shortcut-${section.id}`}>
          <Link
            href={section.items[0]!.href}
            className="group flex items-center gap-sm text-md font-bold text-foreground hover:text-accent"
          >
            <span className="flex size-xxl items-center justify-center rounded-md bg-accent text-brand-foreground">
              <Icon name={section.icon} />
            </span>
            {section.label}
            <Icon name="chevronRight" className="ml-auto size-lg text-muted group-hover:text-accent" />
          </Link>
          <ul className="flex flex-wrap gap-xs">
            {section.items.slice(0, 4).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-(--mg-touch-target) items-center gap-xs rounded-md px-xs text-sm text-muted hover:bg-surface hover:text-foreground"
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
