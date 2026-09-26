import { APP_NAME } from "@meguiars/domain";
import { Button, Message, Screen } from "@/ui/kit";

/** Pantallas informativas: cuenta deshabilitada, sin centros, sin permiso. */
export function MessageScreen({
  title,
  message,
  tone = "muted",
  action,
}: {
  title: string;
  message: string;
  tone?: "muted" | "danger" | "warning";
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Screen eyebrow={APP_NAME.toUpperCase()} title={title}>
      <Message tone={tone} text={message} />
      {action ? <Button variant="link" label={action.label} onPress={action.onPress} /> : null}
    </Screen>
  );
}
