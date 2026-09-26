import {
  colors,
  radius,
  space,
  toneRecipes,
  colorOf,
  TOAST_DURATION_MS,
  touchTarget,
  zIndex,
  type SheetContract,
  type ToastContract,
} from "@meguiars/ui-tokens";
import { createContext, useCallback, useContext, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { textStyle } from "./theme";

/** Hoja inferior nativa (Modal): el lector de pantalla queda dentro mientras está abierta. */
export function Sheet({ open, title, onClose, children }: SheetContract & { children: React.ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={textStyle("heading")}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
              <Text style={textStyle("label")}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

interface ToastItem extends ToastContract {
  id: number;
}

const ToastContext = createContext<((toast: ToastContract) => void) | null>(null);

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast fuera de ToastProvider");
  return show;
}

/** Avisos breves; también se anuncian al lector de pantalla. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((toast: ToastContract) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { ...toast, id }]);
    AccessibilityInfo.announceForAccessibility(toast.message);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.durationMs ?? TOAST_DURATION_MS);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="none" style={styles.toasts}>
        {toasts.map((t) => {
          const recipe = toneRecipes[t.tone ?? "neutral"];
          return (
            <View
              key={t.id}
              accessibilityLiveRegion="polite"
              style={[
                styles.toast,
                { backgroundColor: colorOf(recipe.bg), borderColor: colorOf(recipe.border) },
              ]}
            >
              <Text style={[textStyle("bodySmall"), { color: colorOf(recipe.fg) }]}>{t.message}</Text>
            </View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  close: { minHeight: touchTarget, minWidth: touchTarget, alignItems: "flex-end", justifyContent: "center" },
  sheetBody: { padding: space.xl, gap: space.sm },
  toasts: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: space.xxxl * 2,
    gap: space.sm,
    zIndex: zIndex.toast,
    alignItems: "center",
  },
  toast: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
