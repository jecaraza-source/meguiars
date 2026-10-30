"use client";

import { useEffect } from "react";

/**
 * En las pantallas internas, Enter dentro de un campo no envía el formulario:
 * hay que tocar el botón (Guardar, Continuar…). Así nadie avanza ni guarda por
 * accidente. Siguen funcionando con Enter los buscadores y filtros (formularios
 * GET, que no guardan nada), las áreas de texto y los botones enfocados.
 */
export function EnterGuard() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (["submit", "button", "reset", "checkbox", "radio", "file", "image"].includes(target.type)) return;
      const form = target.form;
      if (!form || form.method.toLowerCase() === "get" || form.dataset.enterSubmit === "true") return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
  return null;
}
