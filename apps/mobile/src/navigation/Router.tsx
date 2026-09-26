import { authCopy, centersCopy, guardScreen, type Screen } from "@meguiars/domain";
import { colors } from "@meguiars/ui-tokens";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { ForgotPasswordScreen } from "@/screens/ForgotPasswordScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { MessageScreen } from "@/screens/MessageScreen";
import { ResetPasswordScreen } from "@/screens/ResetPasswordScreen";
import { SelectCenterScreen } from "@/screens/SelectCenterScreen";
import { TeamScreen } from "@/screens/TeamScreen";

type PrivateScreen = Extract<Screen, "home" | "team" | "selectCenter">;

/**
 * Navegación mínima por estado. Cada pantalla privada pasa por el mismo
 * guard de @meguiars/domain que usa la web (SCREEN_GUARDS).
 */
export function Router() {
  const { client, state, recovery, signOut, dismissDisabled } = useAuth();
  const [screen, setScreen] = useState<PrivateScreen>("home");
  const [publicScreen, setPublicScreen] = useState<"login" | "forgot">("login");
  const goHome = () => setScreen("home");
  const changeCenter = () => setScreen("selectCenter");

  if (!client)
    return <MessageScreen title={authCopy.loginTitle} message={centersCopy.notConfigured} tone="danger" />;
  if (state.status === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
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
  if (!guard.allow) {
    switch (guard.redirect) {
      case "select_center":
        return <SelectCenterScreen state={state} onDone={goHome} />;
      case "no_centers":
        return (
          <MessageScreen
            title={authCopy.noCentersTitle}
            message={authCopy.noCenters}
            action={{ label: authCopy.logout, onPress: () => void signOut() }}
          />
        );
      case "forbidden":
        return (
          <MessageScreen
            title={authCopy.forbiddenTitle}
            message={authCopy.forbidden}
            tone="warning"
            action={{ label: "Ir al inicio", onPress: goHome }}
          />
        );
      default:
        return <LoginScreen onForgot={() => setPublicScreen("forgot")} />;
    }
  }

  // key = centro activo: al cambiar de centro se descarta el estado de la pantalla anterior.
  const key = state.activeCenterId ?? "none";
  switch (screen) {
    case "selectCenter":
      return <SelectCenterScreen key={key} state={state} onDone={goHome} />;
    case "team":
      return <TeamScreen key={key} state={state} onBack={goHome} onChangeCenter={changeCenter} />;
    default:
      return (
        <HomeScreen key={key} state={state} onChangeCenter={changeCenter} onTeam={() => setScreen("team")} />
      );
  }
}
