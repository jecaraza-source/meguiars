import { activeCenterAccess, canInActiveCenter, UNREAD_POLL_MS, type AuthState } from "@meguiars/domain";
import { createInboxRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Mensajes sin leer de la bandeja del centro activo (punto rojo en la pestaña
 * Comercial y en «Bandeja»). Igual que en web: al abrir, cada 30 s, al volver
 * a la app y al cambiar de pantalla (abrir una conversación la marca leída).
 */
export function useInboxUnread(
  client: MeguiarsSupabaseClient | null,
  state: AuthState,
  screen: string,
): number {
  const [unread, setUnread] = useState(0);
  const signedIn = state.status === "signed_in";
  const centerId = signedIn ? (activeCenterAccess(state)?.center.id ?? null) : null;
  const enabled = Boolean(client && signedIn && centerId && canInActiveCenter(state, "leads.use"));

  useEffect(() => {
    if (!enabled || !client || !centerId) return;
    let alive = true;
    const repo = createInboxRepository(client);
    const check = () =>
      void repo.unreadCount(centerId).then((r) => {
        if (alive && r.ok) setUnread(r.data);
      });
    check();
    const timer = setInterval(check, UNREAD_POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, client, centerId, screen]);

  return enabled ? unread : 0;
}
