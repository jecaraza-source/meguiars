import { centersCopy, formatInCenterTimeZone, type DetailCenter, type ViewState } from "@meguiars/domain";
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
  state: ViewState<DetailCenter[]>;
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
    case "ready":
      return (
        <FlatList
          data={state.data}
          keyExtractor={(center) => center.id}
          contentContainerStyle={{ gap: space.md }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.muted}>{item.code}</Text>
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
  cardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.foreground },
  muted: { fontSize: fontSize.sm, color: colors.muted },
});
