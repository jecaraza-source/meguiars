import {
  presentSuggestion,
  REJECTION_REASON_LABELS,
  REJECTION_REASONS,
  upsellCopy,
  upsellErrorMessage,
  upsellStage,
  type RejectionReason,
  type ServiceOrder,
  type UpsellSuggestion,
} from "@meguiars/domain";
import { createUpsellRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, LinkButton, Select } from "@/ui/controls";
import { Card } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

/**
 * Sugerencias de venta en la OS (web: UpsellCard). Discreta y opcional: si la
 * consulta falla o no hay sugerencias, no se muestra nada.
 */
export function UpsellCard({
  order,
  onChanged,
  onSellMembership,
}: {
  order: ServiceOrder;
  onChanged: () => void;
  onSellMembership: () => void;
}) {
  const { client } = useAuth();
  const [items, setItems] = useState<UpsellSuggestion[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!client || !upsellStage(order.status)) return;
    let active = true;
    void createUpsellRepository(client)
      .suggestions(order.id)
      .then((r) => active && setItems(r.ok ? r.data : []))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, order.id, order.status, order.version]);

  if (items.length === 0) return null;
  return (
    <Card title={`${upsellCopy.cardTitle} (${items.length})`}>
      <LinkButton label={open ? "Ocultar" : "Ver"} onPress={() => setOpen((v) => !v)} />
      {open ? (
        <>
          <Text style={textStyle("caption", "muted")}>{upsellCopy.cardHint}</Text>
          {items.map((s) => (
            <SuggestionRow
              key={s.ruleId}
              suggestion={s}
              order={order}
              onDone={(membership) => {
                setItems((list) => list.filter((x) => x.ruleId !== s.ruleId));
                if (membership) onSellMembership();
                else onChanged();
              }}
            />
          ))}
        </>
      ) : null}
    </Card>
  );
}

function SuggestionRow({
  suggestion,
  order,
  onDone,
}: {
  suggestion: UpsellSuggestion;
  order: ServiceOrder;
  onDone: (membership: boolean) => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const view = presentSuggestion(suggestion);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(op: "accept" | "reject") {
    if (!client) return;
    setBusy(true);
    setError(null);
    const repo = createUpsellRepository(client);
    const r =
      op === "accept"
        ? await repo.accept(order.id, order.version, suggestion.ruleId)
        : await repo.reject(
            order.id,
            suggestion.ruleId,
            (reason || undefined) as RejectionReason | undefined,
          );
    setBusy(false);
    if (!r.ok) return setError(upsellErrorMessage(r.error));
    toast({ message: op === "accept" ? upsellCopy.added : upsellCopy.dismissed, tone: "success" });
    onDone(op === "accept" && view.isMembership);
  }

  return (
    <View style={styles.row}>
      <Text style={textStyle("label")}>{view.title}</Text>
      <Text style={textStyle("bodySmall")}>{view.pitch}</Text>
      {view.why ? <Text style={textStyle("caption", "muted")}>{view.why}</Text> : null}
      {rejecting ? (
        <>
          <Select
            label={upsellCopy.rejectReason}
            options={[
              { value: "", label: "—" },
              ...REJECTION_REASONS.map((r) => ({ value: r, label: REJECTION_REASON_LABELS[r] })),
            ]}
            value={reason}
            onChange={setReason}
          />
          <Button
            label={upsellCopy.reject}
            variant="secondary"
            size="sm"
            loading={busy}
            onPress={() => void decide("reject")}
          />
        </>
      ) : (
        <View style={styles.actions}>
          <Button
            label={view.isMembership ? upsellCopy.acceptMembership : upsellCopy.accept}
            size="sm"
            loading={busy}
            onPress={() => void decide("accept")}
          />
          <Button
            label={upsellCopy.reject}
            variant="secondary"
            size="sm"
            onPress={() => setRejecting(true)}
          />
        </View>
      )}
      <Notice tone="danger" text={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs, paddingVertical: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
