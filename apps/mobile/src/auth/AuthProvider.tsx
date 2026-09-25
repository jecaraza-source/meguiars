import {
  authCopy,
  isAuthRedirect,
  parseAuthRedirect,
  authErrorMessage,
  type AuthState,
  type Result,
} from "@meguiars/domain";
import {
  exchangeRecoveryLink,
  loadAuthState,
  sendPasswordReset,
  setActiveCenter,
  signInWithPassword,
  signOut as supabaseSignOut,
  updatePassword as supabaseUpdatePassword,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { AUTH_REDIRECT_URL, supabase } from "@/lib/supabase";

interface AuthContextValue {
  client: MeguiarsSupabaseClient | null;
  state: AuthState;
  /** Hay una sesión de recuperación: mostrar "Nueva contraseña". */
  recovery: boolean;
  /** Mensaje de un enlace de recuperación inválido o expirado. */
  linkError: string | null;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  sendReset(email: string): Promise<Result<null>>;
  updatePassword(password: string): Promise<Result<null>>;
  finishRecovery(): void;
  selectCenter(detailCenterId: string): Promise<string | null>;
  reload(): Promise<void>;
  dismissDisabled(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth fuera de AuthProvider");
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: supabase ? "loading" : "signed_out" });
  const [recovery, setRecovery] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Mientras se muestra "cuenta deshabilitada", el SIGNED_OUT local no la oculta.
  const showingDisabled = useRef(false);

  const applyResult = useCallback(async (result: Result<AuthState>) => {
    if (!result.ok) {
      // Sin red: se conserva el estado actual en vez de cerrar la sesión.
      setState((current) => (current.status === "loading" ? { status: "signed_out" } : current));
      return;
    }
    if (result.data.status === "disabled") {
      showingDisabled.current = true;
      setState(result.data);
      if (supabase) await supabaseSignOut(supabase); // borra los tokens del almacén seguro
      return;
    }
    setState(result.data);
  }, []);

  const reload = useCallback(
    async (preferredCenterId?: string | null) => {
      if (!supabase) return;
      await applyResult(await loadAuthState(supabase, preferredCenterId));
    },
    [applyResult],
  );

  useEffect(() => {
    if (!supabase) return;
    void loadAuthState(supabase).then(applyResult);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (!showingDisabled.current) setState({ status: "signed_out" });
        setRecovery(false);
        return;
      }
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      // Se difiere para no llamar a Supabase dentro del callback (evita bloqueos).
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setTimeout(() => void reload(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [applyResult, reload]);

  // Deep link de recuperación: meguiars://auth/confirm?code=…
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const handle = async (url: string | null) => {
      if (!url || !isAuthRedirect(url)) return;
      const params = parseAuthRedirect(url);
      if (params.errorCode) {
        setLinkError(authErrorMessage({ code: params.errorCode }));
        return;
      }
      const result = await exchangeRecoveryLink(client, {
        code: params.code,
        tokenHash: params.type === "recovery" ? params.tokenHash : null,
      });
      if (result.ok) {
        setLinkError(null);
        setRecovery(true);
      } else {
        setLinkError(result.error.message);
      }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => void handle(url));
    return () => sub.remove();
  }, []);

  const value: AuthContextValue = {
    client: supabase,
    state,
    recovery,
    linkError,
    async signIn(email, password) {
      if (!supabase) return authCopy.errors.unknown;
      showingDisabled.current = false;
      const result = await signInWithPassword(supabase, { email, password });
      return result.ok ? null : result.error.message;
    },
    async signOut() {
      if (supabase) await supabaseSignOut(supabase);
      setState({ status: "signed_out" });
    },
    sendReset(email) {
      if (!supabase)
        return Promise.resolve({
          ok: false,
          error: { kind: "unavailable", message: authCopy.errors.network },
        });
      return sendPasswordReset(supabase, email, AUTH_REDIRECT_URL);
    },
    updatePassword(password) {
      if (!supabase)
        return Promise.resolve({
          ok: false,
          error: { kind: "unavailable", message: authCopy.errors.network },
        });
      return supabaseUpdatePassword(supabase, password);
    },
    finishRecovery() {
      setRecovery(false);
    },
    async selectCenter(detailCenterId) {
      if (!supabase) return authCopy.errors.unknown;
      const result = await setActiveCenter(supabase, detailCenterId);
      if (!result.ok) return result.error.message;
      await reload(detailCenterId);
      return null;
    },
    reload: () => reload(),
    dismissDisabled() {
      showingDisabled.current = false;
      setState({ status: "signed_out" });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
