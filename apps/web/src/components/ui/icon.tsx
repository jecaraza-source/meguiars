import { iconGeometry, icons, type IconName } from "@meguiars/ui-tokens";
import { createElement } from "react";

/**
 * Icono del set compartido (@meguiars/ui-tokens → icons), en currentColor.
 * Decorativo: el texto vecino da el nombre (aria-hidden). Tamaño con tokens
 * de espacio (size-lg = 16 px, size-xl = 24 px).
 */
export function Icon({ name, className = "size-lg" }: { name: IconName; className?: string }) {
  const { viewBox, strokeWidth } = iconGeometry;
  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {icons[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
