"use client";

import { TOAST_DURATION_MS, type SheetContract, type Tone, type ToastContract } from "@meguiars/ui-tokens";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "./button";

/**
 * Modal en escritorio y hoja inferior en móvil (misma <dialog>, CSS por
 * breakpoint). showModal() da foco atrapado, Escape y fondo inerte nativos.
 */
export function Sheet({ open, title, onClose, children }: SheetContract & { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="mg-dialog" aria-labelledby="mg-sheet-title" onClose={onClose}>
      <div className="flex flex-col gap-lg p-xl">
        <header className="flex items-center justify-between gap-md">
          <h2 id="mg-sheet-title" className="text-lg font-semibold">
            {title}
          </h2>
          <Button label="Cerrar" variant="ghost" size="sm" onClick={onClose} />
        </header>
        {children}
      </div>
    </dialog>
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

/** Avisos breves anunciados a lectores de pantalla (role=status / alert). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((toast: ToastContract) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { ...toast, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.durationMs ?? TOAST_DURATION_MS);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-xxxl z-(--mg-z-toast) flex flex-col items-center gap-sm px-lg md:bottom-xl">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "danger" ? "alert" : "status"}
            className="mg-toast pointer-events-auto"
            data-tone={t.tone ?? ("neutral" satisfies Tone)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
