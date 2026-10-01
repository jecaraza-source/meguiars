import { iconGeometry, icons, type IconName, type IconTag } from "@meguiars/ui-tokens";
import type { ComponentType } from "react";
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

// Los atributos de lucide son cadenas (d, cx, points…), válidas en cada elemento.
const ELEMENTS = {
  path: Path,
  circle: Circle,
  rect: Rect,
  line: Line,
  polyline: Polyline,
  polygon: Polygon,
  ellipse: Ellipse,
} as unknown as Record<IconTag, ComponentType<Record<string, string | number>>>;

/** Icono del set compartido (@meguiars/ui-tokens → icons), igual que en web. Decorativo. */
export function Icon({ name, color, size }: { name: IconName; color: string; size: number }) {
  const { viewBox, strokeWidth } = iconGeometry;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {icons[name].map(([tag, attrs], i) => {
        const El = ELEMENTS[tag];
        return <El key={i} {...attrs} />;
      })}
    </Svg>
  );
}
