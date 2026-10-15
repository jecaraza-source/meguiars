import {
  ASSISTANT_COPY,
  ASSISTANT_MODEL_INFO,
  activeCenterAccess,
  addDays,
  estimateAssistantCost,
  formatCenterHours,
  todayIn,
  usableCenters,
  type AssistantCenterMetrics,
  type AssistantSettings,
  type CenterPublicInfo,
} from "@meguiars/domain";
import { createAssistantRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  settings: AssistantSettings | null;
  centers: CenterPublicInfo[];
  metrics: AssistantCenterMetrics[];
}

/** Asistente de WhatsApp (equivale a /comercial/asistente): estado e indicadores; se configura en la web. */
export function AssistantScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<Loaded | null>(null);
  const today = todayIn(center.timezone);
  const from = addDays(today, -29);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createAssistantRepository(client);
    const ids = usableCenters(state.access)
      .filter((a) => a.center.organizationId === center.organizationId)
      .map((a) => a.center.id);
    void Promise.all([
      repo.settings(center.organizationId),
      repo.centers(center.organizationId),
      repo.metrics(ids, from, today),
    ]).then(
      ([s, c, m]) =>
        active &&
        setData({
          settings: s.ok ? s.data : null,
          centers: c.ok ? c.data.filter((x) => x.active) : [],
          metrics: m.ok ? m.data : [],
        }),
    );
    return () => {
      active = false;
    };
  }, [client, center.organizationId, state.access, from, today]);

  const s = data?.settings;
  const sum = (f: (x: AssistantCenterMetrics) => number) =>
    (data?.metrics ?? []).reduce((a, x) => a + f(x), 0);
  const turns = sum((x) => x.answered + x.handedOff + x.errors);
  const pct = (n: number) => (turns ? `${Math.round((n / turns) * 100)} %` : "Sin datos");
  return (
    <Screen title={ASSISTANT_COPY.title} description={ASSISTANT_COPY.description} header={header}>
      {subnav}
      {data === null ? <Skeleton lines={5} /> : null}
      {data !== null && !s ? <EmptyState title="Sin acceso a la configuración del asistente" /> : null}
      {s ? (
        <>
          <Card title="Estado" subtitle={ASSISTANT_COPY.modes[s.mode]}>
            <Text style={textStyle("bodySmall")}>Modelo: {ASSISTANT_MODEL_INFO[s.model].label}</Text>
            <Text style={textStyle("bodySmall", "muted")}>{ASSISTANT_COPY.phaseNote}</Text>
            <Text style={textStyle("caption", "muted")}>La configuración se cambia en la web.</Text>
          </Card>
          <Card title="Últimos 30 días">
            <KpiCard label="Mensajes atendidos" value={turns ? String(turns) : "Sin datos"} />
            <KpiCard label="Resueltos por el asistente" value={pct(sum((x) => x.answered))} />
            <KpiCard label="Pasados a una persona" value={pct(sum((x) => x.handedOff))} />
            <KpiCard
              label="Costo estimado de IA"
              value={
                turns
                  ? `US$${estimateAssistantCost(s.model, {
                      input: sum((x) => x.inputTokens),
                      output: sum((x) => x.outputTokens),
                      cacheRead: sum((x) => x.cacheReadTokens),
                      cacheWrite: sum((x) => x.cacheWriteTokens),
                    }).toFixed(2)}`
                  : "Sin datos"
              }
              caption={ASSISTANT_COPY.costNote}
            />
          </Card>
          {data!.centers.map((c) => (
            <Card key={c.detailCenterId} title={c.name} subtitle={formatCenterHours(c.hours)}>
              <Text style={textStyle("bodySmall")}>{c.address ?? "Sin dirección"}</Text>
              <Text style={textStyle("caption", "muted")}>
                Responsable: {c.handoffUserName ?? "sin asignar"}
                {c.nearbyZones.length ? ` · Zonas: ${c.nearbyZones.join(", ")}` : ""}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
