import { environmentBanner } from "@meguiars/domain";
import { appEnvironment } from "@/lib/supabase/env";

/** Aviso de ambiente (local o preview); no se muestra en producción. */
export function EnvironmentBanner() {
  const banner = environmentBanner(appEnvironment());
  if (!banner) return null;
  return (
    <div role="note" className="mg-tone border-b px-lg py-xs text-sm" data-tone={banner.tone}>
      <strong>{banner.label}</strong> · {banner.message}
    </div>
  );
}
