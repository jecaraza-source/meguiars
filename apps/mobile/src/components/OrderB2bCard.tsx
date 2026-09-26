import {
  b2bCopy,
  BILLING_MODEL_LABELS,
  formatMoney,
  type B2bAccountForOrder,
  type OrderB2bInfo,
  type ServiceOrder,
} from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/ui/display";
import { textStyle } from "@/ui/theme";
import { ApplyB2bEditor } from "./B2bForms";

/** Cuenta B2B de la OS, o "Aplicar convenio" si la OS abierta es de una empresa con convenio (web: tarjeta en /ordenes/[id]). */
export function OrderB2bCard({
  order,
  centerId,
  canWrite,
  onChanged,
}: {
  order: ServiceOrder;
  centerId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { client } = useAuth();
  const [info, setInfo] = useState<OrderB2bInfo | null>(null);
  const [accounts, setAccounts] = useState<B2bAccountForOrder[]>([]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createB2bRepository(client);
    void repo.orderInfo(order.id).then(async (r) => {
      if (!active || !r.ok) return;
      setInfo(r.data);
      if (!r.data && canWrite && order.status === "abierta") {
        const list = await repo.accountsForCenter(centerId);
        if (active && list.ok) setAccounts(list.data.filter((a) => a.clientId === order.clientId));
      }
    });
    return () => {
      active = false;
    };
  }, [client, order.id, order.status, order.clientId, centerId, canWrite]);

  if (!info && accounts.length === 0) return null;
  return (
    <Card title={b2bCopy.orderCardTitle}>
      {info ? (
        <>
          <Text style={textStyle("body")}>
            {b2bCopy.orderAccount}: {info.accountName}
          </Text>
          <Text style={textStyle("body")}>
            {b2bCopy.orderAgreement}: {info.agreementName ?? "—"}
            {info.billingModel ? ` · ${BILLING_MODEL_LABELS[info.billingModel]}` : ""}
          </Text>
          {order.items
            .filter((i) => i.priceSource === "convenio")
            .map((i) => (
              <Text key={i.id} style={textStyle("bodySmall", "muted")}>
                {i.serviceName}: {formatMoney(i.unitPrice)} {b2bCopy.convenio.toLowerCase()}
                {i.listUnitPrice != null
                  ? ` (${b2bCopy.listPrice.toLowerCase()} ${formatMoney(i.listUnitPrice)})`
                  : ""}
              </Text>
            ))}
        </>
      ) : (
        <ApplyB2bEditor
          orderId={order.id}
          version={order.version}
          accounts={accounts}
          purchaseOrder={order.channelReference}
          onDone={onChanged}
        />
      )}
    </Card>
  );
}
