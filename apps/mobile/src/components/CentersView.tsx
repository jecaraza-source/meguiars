import {
  centersCopy,
  formatInCenterTimeZone,
  presentCenterAccess,
  type AccessBadge,
  type CenterAccess,
} from "@meguiars/domain";
import { space, type Tone } from "@meguiars/ui-tokens";
import { StyleSheet, View } from "react-native";
import { Badge, List } from "@/ui/display";

const BADGE_TONE: Record<AccessBadge, Tone> = { corporate: "brand", inactive: "danger", readOnly: "neutral" };

/** Centros con acceso: misma información y columnas que la tabla web. */
export function CentersList({ access, now }: { access: CenterAccess[]; now: Date }) {
  const items = access.map(presentCenterAccess);
  return (
    <View style={styles.wrap}>
      <View style={styles.badges}>
        {items.flatMap((item) =>
          item.badges.map((b) => (
            <Badge
              key={`${item.id}-${b.kind}`}
              label={`${item.title}: ${b.label}`}
              tone={BADGE_TONE[b.kind]}
            />
          )),
        )}
      </View>
      <List
        caption={centersCopy.title}
        rows={items}
        rowKey={(i) => i.id}
        emptyMessage={centersCopy.empty}
        columns={[
          { key: "name", header: "Centro", value: (i) => i.title },
          { key: "org", header: "Código · organización", value: (i) => i.subtitle },
          { key: "roles", header: centersCopy.rolesLabel, value: (i) => i.rolesText },
          {
            key: "time",
            header: centersCopy.localTimeLabel,
            value: (i) => formatInCenterTimeZone(now, i.timezone),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
