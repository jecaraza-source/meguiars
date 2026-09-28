import {
  activeCenterAccess,
  APP_NAME,
  authCopy,
  ROLE_LABELS,
  sectionOfScreen,
  usableCenters,
  visibleNavigation,
  type Screen,
  type SignedInState,
} from "@meguiars/domain";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { BrandLogo } from "./brand-logo";
import { EnvironmentBanner } from "./environment-banner";
import { BottomNav, SideNav, SubNav } from "./nav";
import { Badge } from "./ui/display";

/**
 * Estructura de toda pantalla privada:
 * - móvil (< 768): encabezado compacto + barra inferior por sección;
 * - tablet (≥ 768): barra lateral + contenido a una o dos columnas;
 * - escritorio (≥ 1024): barra lateral + rejillas más anchas.
 */
export function AppShell({
  state,
  screen,
  title,
  description,
  children,
}: {
  state: SignedInState;
  screen: Screen;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const sections = visibleNavigation(state);
  const active = activeCenterAccess(state);
  const sectionId = sectionOfScreen(screen);
  const section = sections.find((s) => s.id === sectionId);
  const canSwitch = usableCenters(state.access).length > 1;

  return (
    <div className="flex min-h-full flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:p-sm">
        Saltar al contenido
      </a>
      <EnvironmentBanner />
      <header className="flex flex-wrap items-center justify-between gap-sm border-b border-border bg-surface-raised px-lg py-sm print:hidden">
        <Link href="/" className="flex items-center gap-sm" aria-label={`${APP_NAME}: inicio`}>
          <BrandLogo height={48} priority />
          <span className="hidden text-sm font-bold uppercase tracking-wide text-accent sm:inline">
            Detail Center
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-md text-sm">
          {active ? (
            <span className="flex flex-wrap items-center gap-xs">
              <span className="sr-only">{authCopy.activeCenterLabel}:</span>
              <strong>{active.center.name}</strong>
              {active.roles.map((r) => (
                <Badge key={r} label={ROLE_LABELS[r]} />
              ))}
            </span>
          ) : null}
          {canSwitch ? (
            <Link href="/seleccionar-centro" className="underline">
              {authCopy.changeCenter}
            </Link>
          ) : null}
          <span className="hidden text-muted sm:inline">{state.user.fullName ?? state.user.email}</span>
          <Link href="/sistema" className="underline md:hidden">
            Sistema
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="min-h-(--mg-touch-target) underline">
              {authCopy.logout}
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-(--mg-layout-sidebar) shrink-0 flex-col justify-between gap-xl border-r border-border p-lg md:flex print:hidden">
          <SideNav sections={sections} />
          <Link href="/sistema" className="text-xs text-muted underline">
            Sistema de diseño
          </Link>
        </aside>
        <main id="contenido" className="min-w-0 flex-1 px-lg pt-lg pb-xxxl md:p-xl">
          <div className="mx-auto flex w-full max-w-(--mg-layout-content) flex-col gap-xl">
            <div className="flex flex-col gap-xs">
              <h1 className="text-xl font-bold leading-tight text-accent md:text-xxl">{title}</h1>
              {description ? <p className="text-muted">{description}</p> : null}
            </div>
            {section ? (
              <div className="print:hidden">
                <SubNav section={section} />
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
      <div className="print:hidden">
        <BottomNav sections={sections} />
      </div>
    </div>
  );
}

/** Pantallas informativas o de autenticación, sin navegación. */
export function PlainShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <EnvironmentBanner />
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-(--mg-layout-narrow) flex-1 flex-col justify-center gap-xl p-lg"
      >
        <header className="flex flex-col items-start gap-sm">
          <BrandLogo height={96} priority />
          <p className="text-sm font-bold uppercase tracking-wide text-accent">{APP_NAME}</p>
          <h1 className="text-xl font-bold leading-tight text-accent">{title}</h1>
        </header>
        {children}
      </main>
    </>
  );
}
