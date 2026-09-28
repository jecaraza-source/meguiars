import { BRAND_LOGO } from "@meguiars/domain";
import Image from "next/image";

/** Logo de Meguiar's (PNG con fondo transparente) a la altura indicada. */
export function BrandLogo({ height, priority = false }: { height: number; priority?: boolean }) {
  return (
    <Image
      src="/brand/meguiars-logo.png"
      alt={BRAND_LOGO.alt}
      height={height}
      width={Math.round(height * BRAND_LOGO.aspectRatio)}
      priority={priority}
    />
  );
}
