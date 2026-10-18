"use client";

import { UNREAD_POLL_MS, unreadLabel } from "@meguiars/domain";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

const UnreadContext = createContext(0);

/**
 * Revisa los mensajes sin leer de la bandeja: al cargar, cada 30 s, al volver
 * a la pestaña y al cambiar de página (abrir una conversación la marca leída).
 * Sólo corre si el rol ve la bandeja.
 */
export function InboxUnreadProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/inbox/unread", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { unread?: unknown };
        if (alive && typeof body.unread === "number") setUnread(body.unread);
      } catch {
        // Sin red: se conserva el último valor y se reintenta en la siguiente vuelta.
      }
    };
    void check();
    const timer = setInterval(() => void check(), UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [enabled, pathname]);

  return <UnreadContext.Provider value={enabled ? unread : 0}>{children}</UnreadContext.Provider>;
}

export const useInboxUnread = () => useContext(UnreadContext);

/** Número en rojo junto a «Bandeja». */
export function UnreadCount({ count }: { count: number }) {
  const label = unreadLabel(count);
  if (!label) return null;
  return (
    <span
      title={label}
      className="inline-flex min-w-xl items-center justify-center rounded-full bg-danger px-xs text-xs font-bold leading-normal text-brand-foreground"
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Punto rojo en la sección o pestaña que contiene la bandeja. */
export function UnreadDot({ count, className = "" }: { count: number; className?: string }) {
  const label = unreadLabel(count);
  if (!label) return null;
  return (
    <span className={`${className} size-sm shrink-0 rounded-full bg-danger`} title={label}>
      <span className="sr-only">{label}</span>
    </span>
  );
}
