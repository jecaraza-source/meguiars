import {
  activeCenterAccess,
  APP_NAME,
  authCopy,
  environmentBanner,
  ROLE_LABELS,
  usableCenters,
  type NavSection,
  type NavSectionId,
  type Screen as ScreenId,
  type SignedInState,
} from "@meguiars/domain";
import { colorOf, colors, radius, space, toneRecipes, touchTarget } from "@meguiars/ui-tokens";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { APP_ENV } from "@/lib/environment";
import { LinkButton } from "./controls";
import { Badge } from "./display";
import { textStyle } from "./theme";

/** Aviso de ambiente (local o preview), igual que en web; no aparece en producción. */
export function EnvironmentBanner() {
  const banner = environmentBanner(APP_ENV);
  if (!banner) return null;
  const r = toneRecipes[banner.tone];
  return (
    <View
      accessibilityRole="summary"
      style={[styles.envBanner, { backgroundColor: colorOf(r.bg), borderBottomColor: colorOf(r.border) }]}
    >
      <Text style={[textStyle("caption"), { color: colorOf(r.fg) }]}>
        {banner.label} · {banner.message}
      </Text>
    </View>
  );
}

/** Contenedor de pantalla con título; el contenido hace scroll. */
export function Screen({
  title,
  eyebrow,
  description,
  header,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <EnvironmentBanner />
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {eyebrow ? <Text style={textStyle("caption", "accent")}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={textStyle("title")}>
          {title}
        </Text>
        {description ? <Text style={textStyle("bodySmall", "muted")}>{description}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Perfil básico y centro activo, visibles en todas las pantallas privadas. */
export function AppHeader({
  state,
  onChangeCenter,
  onDesignSystem,
}: {
  state: SignedInState;
  onChangeCenter: () => void;
  onDesignSystem: () => void;
}) {
  const { signOut } = useAuth();
  const active = activeCenterAccess(state);
  return (
    <View style={styles.header}>
      <Text style={textStyle("caption", "accent")}>{APP_NAME.toUpperCase()}</Text>
      {active ? (
        <View style={styles.headerRow}>
          <Text style={textStyle("label")}>{active.center.name}</Text>
          {active.roles.map((r) => (
            <Badge key={r} label={ROLE_LABELS[r]} />
          ))}
        </View>
      ) : null}
      <Text style={textStyle("caption", "muted")}>{state.user.fullName ?? state.user.email}</Text>
      <View style={styles.headerRow}>
        {usableCenters(state.access).length > 1 ? (
          <LinkButton label={authCopy.changeCenter} onPress={onChangeCenter} />
        ) : null}
        <LinkButton label="Sistema de diseño" onPress={onDesignSystem} />
        <LinkButton label={authCopy.logout} onPress={() => void signOut()} />
      </View>
    </View>
  );
}

/** Barra de pestañas nativa: una por sección visible para el rol. */
export function TabBar({
  sections,
  active,
  onSelect,
}: {
  sections: NavSection[];
  active: NavSectionId | null;
  onSelect: (screen: ScreenId) => void;
}) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.tabBar}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {sections.map((section) => {
          const selected = section.id === active;
          return (
            <Pressable
              key={section.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={section.label}
              onPress={() => onSelect(section.items[0]!.screen)}
              style={styles.tab}
            >
              <Text
                numberOfLines={1}
                style={textStyle(selected ? "label" : "caption", selected ? "foreground" : "muted")}
              >
                {section.shortLabel}
              </Text>
              {selected ? <View style={styles.indicator} /> : null}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

/** Pantallas de una sección con más de un ítem (p. ej. Admin. y Finanzas). */
export function SubNav({
  section,
  current,
  onSelect,
}: {
  section: NavSection | undefined;
  current: ScreenId;
  onSelect: (screen: ScreenId) => void;
}) {
  if (!section || section.items.length < 2) return null;
  return (
    <View accessibilityRole="tablist" style={styles.subnav}>
      {section.items.map((item) => (
        <Pressable
          key={item.screen}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.screen === current }}
          onPress={() => onSelect(item.screen)}
          style={[styles.chip, item.screen === current ? styles.chipActive : null]}
        >
          <Text style={textStyle(item.screen === current ? "label" : "bodySmall")}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  envBanner: { paddingHorizontal: space.xl, paddingVertical: space.xs, borderBottomWidth: 1 },
  content: { padding: space.xl, gap: space.lg },
  header: {
    gap: space.xs,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  headerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  tabBar: { backgroundColor: colors.surfaceRaised, borderTopWidth: 1, borderTopColor: colors.border },
  tabs: { flexDirection: "row" },
  tab: { flex: 1, minHeight: touchTarget, alignItems: "center", justifyContent: "center", gap: space.xxs },
  indicator: { width: space.xl, height: space.xxs, backgroundColor: colors.brand },
  subnav: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.surface },
});
