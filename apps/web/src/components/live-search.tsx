"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "./ui/field";

/**
 * Campo de búsqueda que actualiza `?q=` mientras se escribe (desde 2 letras,
 * con pausa de 300 ms): la página del servidor vuelve a pintar los resultados.
 * Conserva los demás parámetros. Sin JavaScript funciona como formulario normal.
 */
export function LiveSearchInput({
  name = "q",
  label,
  hint,
  defaultValue,
}: {
  name?: string;
  label: string;
  hint?: string;
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const last = useRef(defaultValue);

  useEffect(() => {
    const q = value.trim();
    if (q === last.current || (q.length > 0 && q.length < 2)) return;
    const timer = setTimeout(() => {
      last.current = q;
      const next = new URLSearchParams(params.toString());
      if (q) next.set(name, q);
      else next.delete(name);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, name, params, pathname, router]);

  return (
    <Input
      name={name}
      type="search"
      label={label}
      hint={hint}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      autoComplete="off"
      autoFocus
    />
  );
}
