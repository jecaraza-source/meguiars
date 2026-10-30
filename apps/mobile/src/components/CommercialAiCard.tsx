import {
  COMMERCIAL_AI_COPY,
  newRequestId,
  presentCommercialAiReport,
  type ViewState,
} from "@meguiars/domain";
import { createCommercialAiReportRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { requestCommercialAiReport } from "@/lib/commercial-ai";
import { Button } from "@/ui/controls";
import { Card, Skeleton } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";

type Report = ReturnType<typeof presentCommercialAiReport>;

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.stack}>
      <Text style={textStyle("label")}>{title}</Text>
      {items.map((x, i) => (
        <Text key={i} style={textStyle("body")}>
          • {x}
        </Text>
      ))}
    </View>
  );
}

/** Reporte comercial con IA del centro activo (ADR 0051): mismo texto que en la web. */
export function CommercialAiCard({
  client,
  centerId,
  timeZone,
  periodId,
}: {
  client: MeguiarsSupabaseClient;
  centerId: string;
  timeZone: string;
  periodId: string;
}) {
  const [data, setData] = useState<ViewState<Report | null>>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchLatest = useCallback(async (): Promise<ViewState<Report | null>> => {
    const r = await createCommercialAiReportRepository(client).list(centerId, 1);
    if (!r.ok) return { status: "error", message: r.error.message };
    const latest = r.data[0];
    return { status: "ready", data: latest ? presentCommercialAiReport(latest, timeZone) : null };
  }, [client, centerId, timeZone]);
  useEffect(() => {
    let active = true;
    void fetchLatest().then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [fetchLatest]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const r = await requestCommercialAiReport(client, {
      detailCenterId: centerId,
      periodId,
      scope: "centro",
      requestId: newRequestId(),
    });
    if (!r.ok) setError(r.error);
    setData(await fetchLatest());
    setBusy(false);
  };

  const report = data.status === "ready" ? data.data : null;
  return (
    <Card title={COMMERCIAL_AI_COPY.title}>
      <Text style={textStyle("caption", "muted")}>{COMMERCIAL_AI_COPY.description}</Text>
      <Button label={COMMERCIAL_AI_COPY.generate} loading={busy} onPress={() => void generate()} />
      {busy ? <Text style={textStyle("caption", "muted")}>{COMMERCIAL_AI_COPY.generating}</Text> : null}
      <Notice tone="danger" text={error} />
      {data.status === "loading" ? <Skeleton lines={3} /> : null}
      {data.status === "error" ? <Notice tone="danger" text={data.message} /> : null}
      {data.status === "ready" && !report ? (
        <Text style={textStyle("body", "muted")}>{COMMERCIAL_AI_COPY.empty}</Text>
      ) : null}
      {report ? (
        <View style={styles.stack}>
          <Text style={textStyle("caption", "muted")}>
            {report.heading} · {report.createdLabel}
          </Text>
          {report.statusLabel ? (
            <Notice tone="warning" text={report.statusLabel} />
          ) : (
            <>
              <Text style={textStyle("body")}>{report.summary}</Text>
              <Section title={COMMERCIAL_AI_COPY.highlights} items={report.highlights} />
              <Section title={COMMERCIAL_AI_COPY.risks} items={report.risks} />
              <Section title={COMMERCIAL_AI_COPY.actions} items={report.actions} />
              <Text style={textStyle("caption", "muted")}>{COMMERCIAL_AI_COPY.disclaimer}</Text>
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({ stack: { gap: space.sm } });
