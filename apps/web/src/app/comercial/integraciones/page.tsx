import { COMMERCIAL_COPY, INTEGRATION_STATUS_LABELS, INTEGRATIONS } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { Badge, Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

/** Estado real de cada canal. Ninguno se presenta como conectado sin comprobarlo con una cuenta real. */
export default async function IntegrationsPage() {
  const state = await requireScreen("integrations");
  return (
    <AppShell state={state} screen="integrations" title={COMMERCIAL_COPY.integrationsTitle}>
      <p className="text-sm text-muted">
        La plataforma todavía no se conecta con redes sociales ni con WhatsApp. Cada conexión se implementará
        con la API oficial del proveedor, después de verificar en su documentación vigente qué permite, qué
        tipo de cuenta pide y qué permisos o revisiones requiere. Nunca se piden contraseñas de redes
        sociales.
      </p>
      <div className="grid gap-md md:grid-cols-2" data-testid="integrations">
        {INTEGRATIONS.map((i) => (
          <Card
            key={i.channel}
            title={i.label}
            actions={
              <Badge
                label={INTEGRATION_STATUS_LABELS[i.status]}
                tone={i.status === "conectada" ? "success" : "neutral"}
              />
            }
          >
            <p className="text-sm">
              {i.phase
                ? `Conexión oficial planeada para la fase ${i.phase}${i.priority ? " (prioritaria)" : ""}.`
                : "Arquitectura preparada; sin fecha."}
            </p>
            <p className="mt-sm text-sm text-muted">Mientras tanto: {i.manualFlow}</p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
