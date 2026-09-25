import {
  createChunkedSecureStorage,
  createMeguiarsClient,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { parseSupabasePublicEnv } from "@meguiars/validation";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

/** URL a la que Supabase redirige el enlace de recuperación (scheme de app.json). */
export const AUTH_REDIRECT_URL = "meguiars://auth/confirm";

// Keychain/Keystore; los tokens no se migran a otro dispositivo en respaldos.
const secureOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const env = parseSupabasePublicEnv(
  // Las variables EXPO_PUBLIC_* se incrustan en el bundle: deben leerse de forma literal.
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

export const supabase: MeguiarsSupabaseClient | null = env
  ? createMeguiarsClient(env, {
      auth: {
        storage: createChunkedSecureStorage({
          getItemAsync: (key) => SecureStore.getItemAsync(key, secureOptions),
          setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, secureOptions),
          deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, secureOptions),
        }),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;

// Refresca el token sólo con la app en primer plano (recomendación de Supabase
// para React Native); al volver, renueva la sesión si expiró.
if (supabase) {
  AppState.addEventListener("change", (status) => {
    if (status === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
