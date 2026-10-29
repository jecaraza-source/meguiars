import {
  activeCenterAccess,
  APP_NAME,
  authCopy,
  environmentBanner,
  navGroups,
  ROLE_LABELS,
  usableCenters,
  type NavSection,
  type NavSectionId,
  type Screen as ScreenId,
  type SignedInState,
  UNREAD_NAV_SCREEN,
  unreadLabel,
} from "@meguiars/domain";
import { colorOf, colors, radius, space, toneRecipes, touchTarget } from "@meguiars/ui-tokens";
import { createContext, useContext, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { APP_ENV } from "@/lib/environment";
import { BrandLogo } from "./brand";
import { Button } from "./controls";
import { Badge } from "./display";
import { Icon } from "./icon";
import { Sheet, useToast } from "./overlay";
import { textStyle } from "./theme";

/** Pie de las pantallas privadas (enlace al sistema de diseño), al final del contenido. */
export const ScreenFooterContext = createContext<React.ReactNode>(null);

/** Mensajes sin leer de la bandeja: punto rojo en la pestaña y número en «Bandeja». */
export const InboxUnreadContext = createContext(0);

const hasInbox = (section: NavSection) => section.items.some((i) => i.screen === UNREAD_NAV_SCREEN);

function UnreadDot() {
  return <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />;
}

function UnreadCount({ count, selected }: { count: number; selected: boolean }) {
  return (
    <View style={[styles.count, selected ? styles.countSelected : null]}>
      <Text style={textStyle("caption", selected ? "danger" : "brandForeground")}>
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}

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
  brand,
  description,
  header,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** Logo y nombre de la app arriba del título (pantallas sin encabezado: acceso y avisos). */
  brand?: boolean;
  description?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const footer = useContext(ScreenFooterContext);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <EnvironmentBanner />
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {brand ? (
          <View style={styles.brand}>
            <BrandLogo height={88} />
            <Text style={textStyle("menu", "accent")}>{APP_NAME.toUpperCase()}</Text>
          </View>
        ) : null}
        {eyebrow ? <Text style={textStyle("caption", "accent")}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={textStyle("title", "accent")}>
          {title}
        </Text>
        {description ? <Text style={textStyle("bodySmall", "muted")}>{description}</Text> : null}
        {children}
        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Encabezado compacto de las pantallas privadas: logo, centro activo y rol en una
 * línea. Al tocarlo se abre la hoja de cuenta (usuario, cambiar centro, cerrar sesión).
 */
export function AppHeader({ state, onChangeCenter }: { state: SignedInState; onChangeCenter: () => void }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const active = activeCenterAccess(state);
  const roles = (active?.roles ?? []).map((r) => ROLE_LABELS[r]);
  const user = state.user.fullName ?? state.user.email;
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${APP_NAME}. ${active?.center.name ?? ""}. ${authCopy.accountTitle}`}
        onPress={() => setOpen(true)}
        style={styles.headerBar}
      >
        <BrandLogo height={32} />
        <View style={styles.grow}>
          <Text numberOfLines={1} style={textStyle("label")}>
            {active?.center.name ?? APP_NAME}
          </Text>
          <Text numberOfLines={1} style={textStyle("caption", "muted")}>
            {[...roles, user].join(" · ")}
          </Text>
        </View>
        <Icon name="circleUser" size={space.xl} color={colors.accent} />
      </Pressable>
      <Sheet open={open} title={authCopy.accountTitle} onClose={() => setOpen(false)}>
        <Text style={textStyle("label")}>{user}</Text>
        {state.user.fullName ? <Text style={textStyle("caption", "muted")}>{state.user.email}</Text> : null}
        {active ? (
          <View style={styles.headerRow}>
            <Text style={textStyle("bodySmall")}>{active.center.name}</Text>
            {roles.map((r) => (
              <Badge key={r} label={r} />
            ))}
          </View>
        ) : null}
        {usableCenters(state.access).length > 1 ? (
          <Button
            label={authCopy.changeCenter}
            variant="secondary"
            onPress={() => {
              setOpen(false);
              onChangeCenter();
            }}
          />
        ) : null}
        <Button
          label={authCopy.logout}
          variant="secondary"
          onPress={() => {
            setOpen(false);
            void signOut();
          }}
        />
      </Sheet>
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
  const unread = useContext(InboxUnreadContext);
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
              accessibilityLabel={
                hasInbox(section) && unread > 0 ? `${section.label}, ${unreadLabel(unread)}` : section.label
              }
              onPress={() => onSelect(section.items[0]!.screen)}
              style={[styles.tab, selected ? styles.tabActive : null]}
            >
              <View>
                <Icon
                  name={section.icon}
                  size={space.xl}
                  color={selected ? colors.brandForeground : colors.muted}
                />
                {hasInbox(section) && unread > 0 ? <UnreadDot /> : null}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={textStyle("menu", selected ? "brandForeground" : "foreground")}
              >
                {section.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

/** Con hasta este número de opciones la sección muestra pestañas; con más, un selector. */
const INLINE_SUBNAV_MAX = 3;

/**
 * Pantallas de una sección con más de un ítem. Pocas opciones: pestañas en una fila.
 * Muchas (p. ej. Comercial): un selector con la pantalla actual que abre una hoja
 * con las opciones agrupadas (NAV_GROUPS, iguales para todos los roles).
 */
export function SubNav({
  section,
  current,
  onSelect,
}: {
  section: NavSection | undefined;
  current: ScreenId;
  onSelect: (screen: ScreenId) => void;
}) {
  const toast = useToast();
  const unread = useContext(InboxUnreadContext);
  const [open, setOpen] = useState(false);
  if (!section || section.items.length < 2) return null;

  if (section.items.length <= INLINE_SUBNAV_MAX) {
    return (
      <View accessibilityRole="tablist" style={styles.subnav}>
        {section.items.map((item) => (
          <Pressable
            key={item.screen}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.screen === current }}
            accessibilityHint={item.description}
            onPress={() => onSelect(item.screen)}
            onLongPress={() => item.description && toast({ message: item.description, tone: "info" })}
            style={[styles.chip, item.screen === current ? styles.chipActive : null]}
          >
            <Icon
              name={item.icon}
              size={space.lg}
              color={item.screen === current ? colors.brandForeground : colors.accent}
            />
            <Text style={textStyle("menu", item.screen === current ? "brandForeground" : "accent")}>
              {item.label}
            </Text>
            {item.screen === UNREAD_NAV_SCREEN && unread > 0 ? (
              <UnreadCount count={unread} selected={item.screen === current} />
            ) : null}
          </Pressable>
        ))}
      </View>
    );
  }

  const active = section.items.find((i) => i.screen === current) ?? section.items[0]!;
  const pendingInbox = hasInbox(section) && active.screen !== UNREAD_NAV_SCREEN ? unread : 0;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${section.label}: ${active.label}`}
        accessibilityHint="Abre las opciones de la sección"
        onPress={() => setOpen(true)}
        style={styles.picker}
      >
        <Icon name={active.icon} size={space.lg} color={colors.brandForeground} />
        <Text numberOfLines={1} style={[textStyle("menu", "brandForeground"), styles.grow]}>
          {active.label}
        </Text>
        {pendingInbox > 0 ? <UnreadCount count={pendingInbox} selected /> : null}
        <Icon name="chevronDown" size={space.lg} color={colors.brandForeground} />
      </Pressable>
      <Sheet open={open} title={section.label} onClose={() => setOpen(false)}>
        {navGroups(section).map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={textStyle("caption", "muted")}>{group.label.toUpperCase()}</Text>
            {group.items.map((item) => {
              const selected = item.screen === current;
              return (
                <Pressable
                  key={item.screen}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityHint={item.description}
                  onPress={() => {
                    setOpen(false);
                    onSelect(item.screen);
                  }}
                  style={[styles.option, selected ? styles.optionActive : null]}
                >
                  <Icon
                    name={item.icon}
                    size={space.lg}
                    color={selected ? colors.brandForeground : colors.accent}
                  />
                  <Text
                    style={[textStyle("label", selected ? "brandForeground" : "foreground"), styles.grow]}
                  >
                    {item.label}
                  </Text>
                  {item.screen === UNREAD_NAV_SCREEN && unread > 0 ? (
                    <UnreadCount count={unread} selected={selected} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  envBanner: { paddingHorizontal: space.xl, paddingVertical: space.xs, borderBottomWidth: 1 },
  content: { padding: space.xl, gap: space.lg },
  header: {
    gap: space.xs,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  brand: { alignItems: "flex-start", gap: space.xs, marginBottom: space.sm },
  headerBar: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1 },
  picker: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  group: { gap: space.xs, marginBottom: space.md },
  option: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.accent },
  headerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  tabBar: { backgroundColor: colors.surfaceRaised, borderTopWidth: 1, borderTopColor: colors.border },
  tabs: { flexDirection: "row" },
  tab: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    paddingVertical: space.xs,
  },
  tabActive: { backgroundColor: colors.accent },
  subnav: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.full,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  dot: {
    position: "absolute",
    top: -space.xxs,
    right: -space.xs,
    width: space.sm,
    height: space.sm,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
  },
  count: {
    minWidth: space.xl,
    alignItems: "center",
    paddingHorizontal: space.xs,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
  },
  countSelected: { backgroundColor: colors.brandForeground },
});
