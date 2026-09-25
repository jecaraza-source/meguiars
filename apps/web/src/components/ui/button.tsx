import type { ButtonContract } from "@meguiars/ui-tokens";
import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonContract & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled">;

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className="mg-btn"
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? "…" : label}
    </button>
  );
}

/** Enlace con apariencia de botón (navegación, no acción). */
export function ButtonLink({
  label,
  href,
  variant = "secondary",
  size = "md",
}: ButtonContract & { href: string }) {
  return (
    <Link href={href} className="mg-btn" data-variant={variant} data-size={size}>
      {label}
    </Link>
  );
}
