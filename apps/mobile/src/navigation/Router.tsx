import {
  authCopy,
  centersCopy,
  guardScreen,
  sectionOfScreen,
  visibleNavigation,
  type Screen,
} from "@meguiars/domain";
import { colors } from "@meguiars/ui-tokens";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DesignSystemScreen } from "@/screens/DesignSystemScreen";
import { DireccionScreen } from "@/screens/DireccionScreen";
import { ForgotPasswordScreen } from "@/screens/ForgotPasswordScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { MessageScreen } from "@/screens/MessageScreen";
import { ResetPasswordScreen } from "@/screens/ResetPasswordScreen";
import { SectionScreen } from "@/screens/SectionScreen";
import { SelectCenterScreen } from "@/screens/SelectCenterScreen";
import { TeamScreen } from "@/screens/TeamScreen";
import { AppHeader, SubNav, TabBar } from "@/ui/layout";

/**
 * Navegación nativa por pestañas. Las pestañas y los guards salen de
 * @meguiars/domain (visibleNavigation / SCREEN_GUARDS), igual que la web.
 */
export function Router() {
  const { client, state, recovery, signOut, dismissDisabled } = useAuth();
  const [screen, setScreen] = useState<Screen>("home");
  const [publicScreen, setPublicScreen] = useState<"login" | "forgot">("login");
  const goHome = () => setScreen("home");

  if (!client)
    return <MessageScreen title={authCopy.loginTitle} message={centersCopy.notConfigured} tone="danger" />;
  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} accessibilityLabel="Cargando" />
      </View>
    );
  }
  if (recovery && state.status === "signed_in") return <ResetPasswordScreen />;
  if (state.status === "disabled") {
    return (
      <MessageScreen
        title={authCopy.disabledTitle}
        message={authCopy.disabled}
        tone="danger"
        action={{ label: authCopy.backToLogin, onPress: dismissDisabled }}
      />
    );
  }
  if (state.status === "signed_out") {
    return publicScreen === "login" ? (
      <LoginScreen onForgot={() => setPublicScreen("forgot")} />
    ) : (
      <ForgotPasswordScreen onBack={() => setPublicScreen("login")} />
    );
  }

  const guard = guardScreen(state, screen);
  if (!guard.allow && guard.redirect === "select_center")
    return <SelectCenterScreen state={state} onDone={goHome} />;
  if (!guard.allow && guard.redirect === "no_centers") {
    return (
      <MessageScreen
        title={authCopy.noCentersTitle}
        message={authCopy.noCenters}
        action={{ label: authCopy.logout, onPress: () => void signOut() }}
      />
    );
  }
  if (screen === "selectCenter") return <SelectCenterScreen state={state} onDone={goHome} />;

  const sections = visibleNavigation(state);
  const sectionId = sectionOfScreen(screen);
  const header = (
    <AppHeader
      state={state}
      onChangeCenter={() => setScreen("selectCenter")}
      onDesignSystem={() => setScreen("designSystem")}
    />
  );
  const subnav = (
    <SubNav section={sections.find((s) => s.id === sectionId)} current={screen} onSelect={setScreen} />
  );
  const props = { state, header, subnav };

  let content: React.ReactNode;
  if (!guard.allow) {
    content = (
      <MessageScreen
        header={header}
        title={authCopy.forbiddenTitle}
        message={authCopy.forbidden}
        action={{ label: "Ir al inicio", onPress: goHome }}
      />
    );
  } else {
    switch (screen) {
      case "operacion":
      case "comercial":
      case "finanzas":
        content = <SectionScreen {...props} section={screen} />;
        break;
      case "direccion":
        content = <DireccionScreen {...props} />;
        break;
      case "team":
        content = <TeamScreen {...props} />;
        break;
      case "designSystem":
        content = <DesignSystemScreen {...props} />;
        break;
      default:
        content = <HomeScreen {...props} />;
    }
  }

  // key = centro activo: al cambiar de centro se descarta el estado de la pantalla anterior.
  return (
    <View style={styles.fill}>
      <View key={state.activeCenterId ?? "none"} style={styles.fill}>
        {content}
      </View>
      <TabBar sections={sections} active={sectionId} onSelect={setScreen} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", backgroundColor: colors.background },
});
