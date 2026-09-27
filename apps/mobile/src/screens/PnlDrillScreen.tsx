import {
  canInCenter,
  formatMoney,
  PNL_SOURCE_TARGETS,
  pnlCopy,
  pnlDrillTitle,
  pnlErrorMessage,
  pnlMovementsCsv,
  pnlMovementsTotal,
  presentPnlMovement,
  usableCenters,
  type PnlDrillQuery,
  type PnlMovement,
  type ViewState,
} from "@meguiars/domain";
import { createPnlRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, LinkButton } from "@/ui/controls";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

type Target = (typeof PNL_SOURCE_TARGETS)[PnlMovement["source"]]["screen"];

/** Movimientos de una cifra del P&L (equivale a /finanzas/resultados/detalle en web). */
export function PnlDrillScreen({
  state,
  header,
  query,
  onBack,
  onOpen,
}: PrivateScreenProps & {
  query: PnlDrillQuery;
  onBack: () => void;
  onOpen: (screen: Target, id: string) => void;
}) {
  const { client } = useAuth();
  const [data, setData] = useState<ViewState<PnlMovement[]>>({ status: "loading" });
  const names = new Map(usableCenters(state.access).map((a) => [a.center.id, a.center.name]));
  const title = pnlDrillTitle(query);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createPnlRepository(client)
      .drilldown(query)
      .then((r) => {
        if (active)
          setData(
            r.ok ? { status: "ready", data: r.data } : { status: "error", message: pnlErrorMessage(r.error) },
          );
      });
    return () => {
      active = false;
    };
  }, [client, query]);

  const rows = data.status === "ready" ? data.data : [];
  return (
    <Screen
      title={`${pnlCopy.drillTitle}: ${title}`}
      description={`${query.from} a ${query.to}`}
      header={header}
    >
      <LinkButton label={`← ${pnlCopy.back}`} onPress={onBack} />
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando movimientos" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <Notice tone="danger" text={data.message} />
      ) : null}
      {data.status === "ready" && rows.length === 0 ? <EmptyState title={pnlCopy.drillEmpty} /> : null}
      {rows.length > 0 ? (
        <Card title={title} subtitle={pnlCopy.drillHint}>
          <Text style={textStyle("title")}>
            {pnlCopy.drillTotal}: {formatMoney(pnlMovementsTotal(rows))}
          </Text>
          <Text style={textStyle("caption", "muted")}>{rows.length} movimientos</Text>
          {rows.length >= 5000 ? <Notice tone="warning" text={pnlCopy.drillTruncated} /> : null}
          <Button
            label={pnlCopy.shareCsv}
            variant="secondary"
            onPress={() =>
              void Share.share({
                message: pnlMovementsCsv(
                  rows,
                  (id) => names.get(id) ?? "",
                  `${title} · ${query.from} a ${query.to}`,
                ),
              })
            }
          />
          {rows.map((m, i) => {
            const target = PNL_SOURCE_TARGETS[m.source];
            const allowed = canInCenter(state, m.detailCenterId, target.capability);
            const r = presentPnlMovement(
              m,
              names.get(m.detailCenterId) ?? "",
              allowed ? target.href(m.sourceId) : null,
            );
            return (
              <View key={`${r.key}-${i}`} style={styles.item}>
                {allowed ? (
                  <LinkButton
                    label={`${r.source} ${r.reference} · ${r.amount}`}
                    onPress={() => onOpen(target.screen, m.sourceId)}
                  />
                ) : (
                  <Text style={textStyle("label")}>
                    {r.source} {r.reference} · {r.amount}
                  </Text>
                )}
                <Text style={textStyle("bodySmall")}>{r.description}</Text>
                <Text style={textStyle("caption", "muted")}>
                  {r.date} · {r.center} · {r.item}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ item: { gap: space.xxs, marginBottom: space.sm } });
