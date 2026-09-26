import { APP_NAME } from "@meguiars/domain";
import type { Tone } from "@meguiars/ui-tokens";
import { Button } from "@/ui/controls";
import { EmptyState } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";

/** Pantallas informativas: cuenta deshabilitada, sin centros, sin permiso. */
export function MessageScreen({
  title,
  message,
  tone,
  action,
  header,
}: {
  title: string;
  message: string;
  tone?: Tone;
  action?: { label: string; onPress: () => void };
  header?: React.ReactNode;
}) {
  return (
    <Screen eyebrow={header ? undefined : APP_NAME.toUpperCase()} title={title} header={header}>
      {tone ? <Notice tone={tone} text={message} /> : <EmptyState title={title} message={message} />}
      {action ? <Button label={action.label} variant="secondary" onPress={action.onPress} /> : null}
    </Screen>
  );
}
