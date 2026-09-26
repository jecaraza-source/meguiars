import {
  formatDateOnly,
  membershipErrorMessage,
  membershipsCopy,
  membershipStatus,
  newRequestId,
  presentBalance,
  presentRedemption,
  presentStatus,
  redeemableLines,
  renewalCaption,
  type BenefitBalance,
  type Membership,
  type MembershipRedemption,
  type ServiceOrder,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import { fieldErrors, redeemBenefitSchema, voidRedemptionSchema } from "@meguiars/validation";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Select } from "@/ui/controls";
import { Badge, Card, List, Skeleton } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

type Loaded = {
  membership: { membership: Membership; balance: BenefitBalance[] } | null;
  redemptions: MembershipRedemption[];
};

/** Membresía del vehículo en la OS: saldo, próxima renovación, redimir y anular (equivale a la tarjeta de /ordenes/[id]). */
export function OrderMembershipCard({
  order,
  canWrite,
  today,
  timeZone,
  onChanged,
  onNewMembership,
}: {
  order: ServiceOrder;
  canWrite: boolean;
  today: string;
  timeZone: string;
  onChanged: () => void;
  onNewMembership?: (() => void) | undefined;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Loaded | string | null>(null);
  const [requestId] = useState(newRequestId);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createMembershipRepository(client);
    void Promise.all([repo.forVehicle(order.vehicleId), repo.redemptionsForOrder(order.id)]).then(
      ([m, r]) => {
        if (!active) return;
        if (!m.ok) return setData(m.error.message);
        setData({ membership: m.data, redemptions: r.ok ? r.data : [] });
      },
    );
    return () => {
      active = false;
    };
  }, [client, order.vehicleId, order.id]);

  if (data === null)
    return (
      <Card title={membershipsCopy.orderCardTitle}>
        <Skeleton lines={2} label="Cargando membresía" />
      </Card>
    );
  if (typeof data === "string")
    return (
      <Card title={membershipsCopy.orderCardTitle}>
        <Notice tone="danger" text={data} />
      </Card>
    );
  if (!data.membership)
    return (
      <Card title={membershipsCopy.orderCardTitle}>
        <Text style={textStyle("bodySmall", "muted")}>{membershipsCopy.orderNoMembership}</Text>
        {onNewMembership ? (
          <Button
            label={membershipsCopy.newMembership}
            variant="secondary"
            size="sm"
            onPress={onNewMembership}
          />
        ) : null}
      </Card>
    );

  const { membership: m, balance } = data.membership;
  const status = membershipStatus(m, today);
  const badge = presentStatus(status);
  const open = ["abierta", "autorizada", "en_proceso", "pausada", "terminada"].includes(order.status);
  const lines = canWrite && open ? redeemableLines(status, order.items, balance, data.redemptions) : [];
  const line = lines.find((l) => l.itemId === itemId);

  const redeem = async () => {
    if (!client) return;
    const parsed = redeemBenefitSchema.safeParse({
      orderId: order.id,
      version: order.version,
      itemId,
      membershipId: m.id,
      quantity,
      requestId,
    });
    if (!parsed.success) return setError(Object.values(fieldErrors(parsed.error))[0] ?? "Datos inválidos");
    setBusy(true);
    const r = await createMembershipRepository(client).redeem(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    toast({ message: membershipsCopy.redeemed, tone: "success" });
    onChanged();
  };

  const voidIt = async (redemptionId: string) => {
    if (!client) return;
    const parsed = voidRedemptionSchema.safeParse({ redemptionId, version: order.version, reason });
    if (!parsed.success) return setError(fieldErrors(parsed.error).reason ?? "Datos inválidos");
    setBusy(true);
    const r = await createMembershipRepository(client).voidRedemption(
      redemptionId,
      order.version,
      parsed.data.reason,
    );
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    toast({ message: membershipsCopy.saved, tone: "success" });
    onChanged();
  };

  return (
    <Card
      title={`${membershipsCopy.orderCardTitle} · ${m.number}`}
      subtitle={`${m.planName} · ${membershipsCopy.nextRenewal}: ${formatDateOnly(m.endsOn)} · ${renewalCaption(m.endsOn, today)}`}
    >
      <Badge label={badge.label} tone={badge.tone} />
      <List
        caption={membershipsCopy.balanceTitle}
        rows={balance.map(presentBalance)}
        rowKey={(b) => b.key}
        emptyMessage={membershipsCopy.balanceEmpty}
        columns={[
          { key: "service", header: "Servicio", value: (b) => b.service },
          { key: "usage", header: membershipsCopy.used, value: (b) => b.usage },
          { key: "remaining", header: membershipsCopy.remaining, value: (b) => String(b.remaining) },
        ]}
      />
      {lines.length > 0 ? (
        <>
          <Select
            label="Línea"
            options={lines.map((l) => ({ value: l.itemId, label: l.label }))}
            value={itemId}
            onChange={(x) => {
              setItemId(x);
              setQuantity(String(lines.find((l) => l.itemId === x)?.maxQuantity ?? 1));
            }}
            placeholder="Elige la línea"
          />
          <Field
            label={membershipsCopy.redeemQuantity}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
          />
          <Button
            label={membershipsCopy.redeem}
            loading={busy}
            disabled={!line}
            onPress={() => void redeem()}
          />
        </>
      ) : canWrite && open ? (
        <Text style={textStyle("bodySmall", "muted")}>{membershipsCopy.notRedeemable}</Text>
      ) : null}
      {data.redemptions.map((r) => {
        const view = presentRedemption(r, timeZone);
        return (
          <View key={r.id}>
            <Text style={textStyle("bodySmall", view.voided ? "muted" : undefined)}>
              {view.service} = {view.amount} · {view.status}
            </Text>
            {canWrite && open && !view.voided ? (
              voiding === r.id ? (
                <>
                  <Field label={membershipsCopy.voidReason} value={reason} onChangeText={setReason} />
                  <Button
                    label={membershipsCopy.voidRedemption}
                    variant="danger"
                    size="sm"
                    loading={busy}
                    onPress={() => void voidIt(r.id)}
                  />
                </>
              ) : (
                <Button
                  label={membershipsCopy.voidRedemption}
                  variant="secondary"
                  size="sm"
                  onPress={() => setVoiding(r.id)}
                />
              )
            ) : null}
          </View>
        );
      })}
      <Notice tone="danger" text={error} />
    </Card>
  );
}
