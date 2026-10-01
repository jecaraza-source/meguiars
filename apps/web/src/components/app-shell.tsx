import {
  activeCenterAccess,
  navScreenOf,
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
import { Icon } from "./ui/icon";

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
  const current = section?.items.find((i) => i.screen === navScreenOf(screen));
  const canSwitch = usableCenters(state.access).length > 1;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:p-sm">
        Saltar al contenido
      </a>
      <EnvironmentBanner />
      <header className="flex items-center justify-between gap-sm border-b border-border bg-surface-raised px-lg py-sm shadow-sm print:hidden">
        <Link href="/" className="flex shrink-0 items-center gap-sm" aria-label={`${APP_NAME}: inicio`}>
          <BrandLogo height={48} priority />
          <span className="hidden text-sm font-bold uppercase tracking-wide text-accent lg:inline">
            Detail Center
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-xs text-sm">
          {active ? (
            <span className="flex min-w-0 items-center gap-xs rounded-full border border-border bg-surface px-sm py-xs">
              <Icon name="store" className="size-lg text-accent" />
              <span className="sr-only">{authCopy.activeCenterLabel}:</span>
              <strong className="truncate">{active.center.name}</strong>
              <span className="hidden items-center gap-xs md:flex">
                {active.roles.map((r) => (
                  <Badge key={r} label={ROLE_LABELS[r]} />
                ))}
              </span>
            </span>
          ) : null}
          {canSwitch ? (
            <Link
              href="/seleccionar-centro"
              className="flex min-h-(--mg-touch-target) items-center gap-xs rounded-md px-sm font-medium hover:bg-surface"
            >
              <Icon name="arrowLeftRight" />
              <span className="sr-only lg:not-sr-only">{authCopy.changeCenter}</span>
            </Link>
          ) : null}
          <span className="hidden items-center gap-xs px-sm text-muted xl:flex">
            <Icon name="circleUser" />
            {state.user.fullName ?? state.user.email}
          </span>
          <Link href="/sistema" className="px-sm text-xs text-muted underline md:hidden">
            Sistema
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-(--mg-touch-target) items-center gap-xs rounded-md px-sm font-medium hover:bg-surface"
            >
              <Icon name="logOut" />
              <span className="sr-only lg:not-sr-only">{authCopy.logout}</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 bg-surface">
        <aside className="hidden w-(--mg-layout-sidebar) shrink-0 border-r border-border bg-surface-raised md:block print:hidden">
          <div className="sticky top-0 flex max-h-screen flex-col justify-between gap-xl overflow-y-auto p-md">
            <SideNav sections={sections} />
            <Link href="/sistema" className="px-sm text-xs text-muted underline">
              Sistema de diseño
            </Link>
          </div>
        </aside>
        <main id="contenido" className="min-w-0 flex-1 px-lg pt-lg pb-xxxl md:p-xl">
          <div className="mx-auto flex w-full max-w-(--mg-layout-content) flex-col gap-xl">
            <div className="flex flex-col gap-md">
              <div className="flex flex-col gap-xs">
                {section ? (
                  <nav
                    aria-label="Ubicación"
                    className="flex items-center gap-xs text-sm font-medium text-muted print:hidden"
                  >
                    <Icon name={section.icon} className="size-lg text-accent" />
                    <span>{section.label}</span>
                    {current && current.label !== title ? (
                      <>
                        <span aria-hidden="true">/</span>
                        <span>{current.label}</span>
                      </>
                    ) : null}
                  </nav>
                ) : null}
                <h1 className="text-xl font-bold leading-tight text-foreground md:text-xxl">{title}</h1>
                {description ? <p className="text-muted">{description}</p> : null}
              </div>
              {section ? (
                <div className="print:hidden">
                  <SubNav section={section} />
                </div>
              ) : null}
            </div>
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
