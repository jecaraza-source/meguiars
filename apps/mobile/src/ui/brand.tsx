import { BRAND_LOGO } from "@meguiars/domain";
import { Image } from "react-native";
import LOGO from "../../assets/brand/meguiars-logo.png";

/** Logo de Meguiar's (PNG con fondo transparente) a la altura indicada. */
export function BrandLogo({ height }: { height: number }) {
  return (
    <Image
      source={LOGO}
      accessibilityRole="image"
      accessibilityLabel={BRAND_LOGO.alt}
      resizeMode="contain"
      style={{ height, width: Math.round(height * BRAND_LOGO.aspectRatio) }}
    />
  );
}
