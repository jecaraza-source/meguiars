import {
  activeCenterAccess,
  activeTone,
  dashboardsErrorMessage,
  formatInCenterTimeZone,
  REPORT_DELIVERY_SOURCE_LABELS,
  REPORT_DELIVERY_STATUS_TONES,
  REPORT_FREQUENCY_HINTS,
  REPORT_FREQUENCY_LABELS,
  reportCentersText,
  reportEmailsCopy,
  reportPeriod,
  reportPeriodLabel,
  todayIn,
  usableCenters,
  type ReportDelivery,
  type ReportSubscription,
} from "@meguiars/domain";
import { createReportEmailsRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles as styles } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

interface Data {
  subs: ReportSubscription[];
  deliveries: ReportDelivery[];
  error: string | null;
}

/**
 * Dirección → Reportes por correo (equivale a /direccion/reportes en web):
 * qué se envía, a quién y la bitácora de envíos. Crear, editar y «Enviar
 * ahora» se hacen en la web (el envío sale del servidor).
 */
export function ReportEmailsScreen({ state, header }: PrivateScreenProps) {
  const { client } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const active = activeCenterAccess(state)!.center;
  const admin = usableCenters(state.access).some((a) => a.corporateRoles.includes("admin_socio"));
  const names = Object.fromEntries(
    usableCenters(state.access)
      .filter((a) => a.center.organizationId === active.organizationId)
      .map((a) => [a.center.id, a.center.name]),
  );
  const today = todayIn(active.timezone);

  useEffect(() => {
    if (!client || !admin) return;
    let alive = true;
    const repo = createReportEmailsRepository(client);
    void Promise.all([
      repo.subscriptions(active.organizationId),
      repo.deliveries(active.organizationId),
    ]).then(([subs, deliveries]) => {
      if (!alive) return;
      setData({
        subs: subs.ok ? subs.data : [],
        deliveries: deliveries.ok ? deliveries.data : [],
        error: subs.ok ? null : dashboardsErrorMessage(subs.error),
      });
    });
    return () => {
      alive = false;
    };
  }, [client, admin, active.organizationId]);

  return (
    <Screen title={reportEmailsCopy.title} description={reportEmailsCopy.description} header={header}>
      {!admin ? <EmptyState title="Sólo el admin corporativo programa los reportes por correo." /> : null}
      {admin && !data ? <Skeleton /> : null}
      <Notice text={data?.error} tone="danger" />
      {data && !data.error && data.subs.length === 0 ? (
        <EmptyState title={reportEmailsCopy.empty} message={reportEmailsCopy.emptyHint} />
      ) : null}
      {data?.subs.map((s) => (
        <Card key={s.id} title={s.name} subtitle={REPORT_FREQUENCY_HINTS[s.frequency]}>
          <View style={styles.row}>
            <Badge
              label={s.active ? reportEmailsCopy.active : reportEmailsCopy.paused}
              tone={activeTone(s.active)}
            />
            <Badge label={REPORT_FREQUENCY_LABELS[s.frequency]} tone="info" />
          </View>
          <Text style={textStyle("caption", "muted")}>
            {reportCentersText(s.centerIds, names)} · {s.recipients.join(", ")}
          </Text>
          <Text style={textStyle("caption", "muted")}>
            Último periodo cerrado: {reportPeriodLabel(reportPeriod(s.frequency, today))}
          </Text>
        </Card>
      ))}
      {data ? (
        <Card title={reportEmailsCopy.history}>
          {data.deliveries.length === 0 ? (
            <Text style={textStyle("caption", "muted")}>{reportEmailsCopy.noDeliveries}</Text>
          ) : (
            data.deliveries.map((d) => (
              <View key={d.id} style={styles.row}>
                <Badge
                  label={d.status === "enviado" ? "Enviado" : "Falló"}
                  tone={REPORT_DELIVERY_STATUS_TONES[d.status]}
                />
                <Text style={textStyle("caption")}>
                  {d.subscriptionName} · {reportPeriodLabel({ from: d.periodFrom, to: d.periodTo })} ·{" "}
                  {REPORT_DELIVERY_SOURCE_LABELS[d.source]} ·{" "}
                  {formatInCenterTimeZone(d.createdAt, active.timezone)}
                </Text>
                {d.error ? <Text style={textStyle("caption", "danger")}>{d.error}</Text> : null}
              </View>
            ))
          )}
        </Card>
      ) : null}
      {admin ? <Text style={textStyle("caption", "muted")}>{reportEmailsCopy.onlyWeb}</Text> : null}
    </Screen>
  );
}
