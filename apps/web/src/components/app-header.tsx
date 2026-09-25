import {
  activeCenterAccess,
  APP_NAME,
  authCopy,
  ROLE_LABELS,
  usableCenters,
  type SignedInState,
} from "@meguiars/domain";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

/** Perfil básico y centro activo, visibles en todas las pantallas privadas. */
export function AppHeader({ state }: { state: SignedInState }) {
  const active = activeCenterAccess(state);
  const canSwitch = usableCenters(state.access).length > 1;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-mg-border px-6 py-3">
      <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-mg-accent">
        {APP_NAME}
      </Link>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {active ? (
          <span>
            <span className="text-mg-muted">{authCopy.activeCenterLabel}:</span>{" "}
            <strong>{active.center.name}</strong>{" "}
            <span className="text-mg-muted">({active.roles.map((r) => ROLE_LABELS[r]).join(", ")})</span>
          </span>
        ) : null}
        {canSwitch ? (
          <Link href="/seleccionar-centro" className="underline">
            {authCopy.changeCenter}
          </Link>
        ) : null}
        <span className="text-mg-muted">{state.user.fullName ?? state.user.email}</span>
        <form action={logoutAction}>
          <button type="submit" className="underline">
            {authCopy.logout}
          </button>
        </form>
      </div>
    </header>
  );
}
