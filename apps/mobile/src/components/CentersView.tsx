import {
  centersCopy,
  corporateSummaryText,
  formatInCenterTimeZone,
  presentCenterAccess,
  type AccessBadge,
  type CenterAccess,
  type ViewState,
} from "@meguiars/domain";
import { colors, fontSize, fontWeight, radius, space } from "@meguiars/ui-tokens";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

type Tone = "muted" | "warning" | "danger";

function Notice({ tone, message, onRetry }: { tone: Tone; message: string; onRetry?: () => void }) {
  return (
    <View style={styles.notice} accessibilityRole={tone === "danger" ? "alert" : "text"}>
      <Text style={[styles.noticeText, { color: colors[tone === "muted" ? "muted" : tone] }]}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>{centersCopy.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CentersView({
  state,
  now,
  onRetry,
}: {
  state: ViewState<CenterAccess[]>;
  now: Date;
  onRetry: () => void;
}) {
  switch (state.status) {
    case "loading":
      return (
        <View style={styles.notice}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[styles.noticeText, { color: colors.muted }]}>{centersCopy.loading}</Text>
        </View>
      );
    case "empty":
      return <Notice tone="muted" message={centersCopy.empty} onRetry={onRetry} />;
    case "permission_denied":
      return <Notice tone="warning" message={centersCopy.permissionDenied} onRetry={onRetry} />;
    case "error":
      return <Notice tone="danger" message={state.message} onRetry={onRetry} />;
    case "ready": {
      const summary = corporateSummaryText(state.data);
      return (
        <FlatList
          data={state.data.map(presentCenterAccess)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: space.md }}
          ListHeaderComponent={
            summary ? (
              <View style={styles.notice} accessibilityRole="summary">
                <Text style={styles.summary}>{summary}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.badges.map((badge) => (
                  <Text key={badge.kind} style={[styles.badge, BADGE_STYLE[badge.kind]]}>
                    {badge.label}
                  </Text>
                ))}
              </View>
              <Text style={styles.muted}>{item.subtitle}</Text>
              <Text style={styles.body}>
                {centersCopy.rolesLabel}: {item.rolesText}
              </Text>
              <Text style={styles.muted}>
                {centersCopy.timeZoneLabel}: {item.timezone} · {centersCopy.localTimeLabel}:{" "}
                {formatInCenterTimeZone(now, item.timezone)}
              </Text>
            </View>
          )}
        />
      );
    }
  }
}

const BADGE_STYLE: Record<AccessBadge, { backgroundColor: string; color: string }> = {
  corporate: { backgroundColor: colors.brand, color: colors.brandForeground },
  inactive: { backgroundColor: colors.surface, color: colors.danger },
  readOnly: { backgroundColor: colors.surface, color: colors.muted },
};

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  noticeText: { fontSize: fontSize.md },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  buttonText: { color: colors.brandForeground, fontWeight: fontWeight.semibold },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
  },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.foreground },
  badge: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  summary: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.foreground },
  body: { fontSize: fontSize.sm, color: colors.foreground },
  muted: { fontSize: fontSize.sm, color: colors.muted },
});
