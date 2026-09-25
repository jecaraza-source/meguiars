import { sectionCopy } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { DesignSystemShowcase } from "@/components/design-system-showcase";
import { requireScreen } from "@/lib/auth/dal";

export default async function DesignSystemPage() {
  const state = await requireScreen("designSystem");
  return (
    <AppShell
      state={state}
      screen="designSystem"
      title={sectionCopy.designSystem.title}
      description={sectionCopy.designSystem.description}
    >
      <DesignSystemShowcase />
    </AppShell>
  );
}
