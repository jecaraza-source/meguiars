/**
 * Roles de la plataforma. Deben coincidir con el enum `public.app_role`
 * (ver schema-parity.test.ts). Un rol se asigna en un centro
 * (user_detail_centers) o en la organización completa (role_assignments,
 * "corporativo"). La base de datos (RLS) es la fuente de verdad; esta matriz
 * es su espejo para decidir qué mostrar en la UI.
 */
export const APP_ROLES = [
  "admin_socio",
  "encargado",
  "operador_recepcion",
  "contador",
  "comercial_b2b",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin_socio: "Admin / socio",
  encargado: "Encargado",
  operador_recepcion: "Operador de recepción",
  contador: "Contador",
  comercial_b2b: "Comercial B2B",
};

export const CAPABILITIES = [
  "center.read",
  "operations.read",
  "commercial.read",
  "finance.read",
  "executive.read",
  "center.manage",
  "members.read",
  "members.manage",
  "audit.read",
  "operations.write",
  "b2b.write",
  "clients.read",
  "clients.write",
  "catalog.read",
  "catalog.manage",
  "agenda.read",
  "agenda.write",
  "agenda.manage",
  "orders.read",
  "orders.write",
  "orders.manage",
  // Membresías de clientes (C1); no confundir con members.* (equipo del centro).
  "memberships.read",
  "memberships.write",
  "memberships.manage",
  // CRM de recurrencia (C2): mismos roles que leen clientes.
  "crm.read",
  "crm.write",
  // Cuentas B2B (C3): b2b.write administra cuentas, convenios, tarifas y vehículos.
  "b2b.read",
  "b2b.billing",
  // Recomendaciones de venta (C4): indicadores y reglas (las sugerencias en la OS usan orders.write).
  "upsell.read",
  "upsell.manage",
  // Pipeline comercial (C5): pipeline.write basta para B2C premium; B2B exige además b2b.write.
  "pipeline.read",
  "pipeline.write",
  "pipeline.metrics.read",
  "pipeline.manage",
  // Cobranza (AF1): cobrar exige payments.write; revertir un recibo, payments.reverse.
  "payments.read",
  "payments.write",
  "payments.reverse",
  // Egresos y P&L (AF2): approve = aprobar, rechazar, anular aprobados y fijar el umbral;
  // manage = catálogo de categorías (admin corporativo).
  "expenses.read",
  "expenses.write",
  "expenses.approve",
  "expenses.manage",
  // Corte de caja (AF3): operate = abrir y cerrar (arqueo); reopen = reabrir un corte cerrado (admin).
  "cash.read",
  "cash.operate",
  "cash.reopen",
  // P&L multicentro (AF4): estado de resultados y drill-down (sólo lectura).
  "pnl.read",
  // Tableros ejecutivos (D1): read = ver tableros de su rol; manage = constructor (admin corporativo).
  "dashboards.read",
  "dashboards.manage",
  // Usuarios (A1): altas con correo y contraseña, roles y acceso (admin corporativo).
  "users.manage",
  // Alertas (D4): read = bandeja; manage = revisar y resolver; rules = reglas y evaluar (admin corporativo).
  "alerts.read",
  "alerts.manage",
  "alerts.rules",
  // Indicadores de membresías (private.can_read_membership_metrics): métricas de los tableros.
  "memberships.metrics.read",
  // Indicadores de clientes sin datos personales (D2): recurrencia, frecuencia y LTV.
  "customers.metrics.read",
  // Activación de centros (F5.2): checklist de datos maestros, línea base e importador
  // (private.can_setup_center: admin_socio del centro o corporativo); el alta de un
  // centro exige además rol corporativo (public.create_detail_center).
  "centers.setup",
  // Comercial CR2 (fase 1): prospectos y cotizaciones (private.can_use_leads), embudo de
  // la organización (private.can_manage_lead_stages, admin corporativo), indicadores del
  // recorrido sin datos personales (private.can_read_commercial_metrics) y fusión de
  // duplicados (private.can_merge_clients).
  "leads.use",
  "leads.manage",
  "commercial.metrics.read",
  "clients.merge",
  // CR2 (fase 2): registrar las cuentas oficiales de Meta de la organización
  // (private.can_manage_channels). La bandeja usa leads.use.
  "channels.manage",
  // CR2 (fase 3): ver calendario, campañas y promociones (private.can_read_marketing),
  // gestionar campañas y calendario (private.can_manage_marketing) y crear
  // promociones, que son descuentos preautorizados (private.can_manage_promotions).
  "marketing.read",
  "marketing.manage",
  "promotions.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Matriz rol → capacidades. `center.*`, `members.*` y `audit.read` están
 * aplicadas por RLS en la migración 20260923000000; `clients.*`, en
 * 20260927000000 (private.can_read_clients / private.can_write_clients);
 * `catalog.*`, en 20260928000000 (servicios: admin_socio corporativo; centro:
 * private.can_manage_center_catalog); `agenda.*`, en 20260929000000
 * (private.can_use_agenda / private.can_manage_agenda); `orders.*`, en
 * 20260930000000 (private.can_use_orders / private.can_manage_orders);
 * `memberships.*`, en 20261002000000 (private.can_use_memberships /
 * private.can_manage_memberships); `crm.*`, en 20261003000000 (private.can_use_crm);
 * `b2b.*`, en 20261004000000 (private.can_read_b2b / can_manage_b2b = b2b.write /
 * can_bill_b2b); `upsell.*`, en 20261005000000 (private.can_read_upsell_metrics /
 * private.can_manage_upsell, admin corporativo); `pipeline.*`, en 20261006000000
 * (private.can_read_pipeline / can_write_pipeline / can_read_pipeline_metrics /
 * can_manage_pipeline, admin corporativo); `payments.*`, en 20261007000000
 * (private.can_read_payments / can_use_orders / can_manage_orders); `expenses.*`, en
 * 20261008000000 (private.can_read_expenses / can_write_expenses /
 * can_approve_expenses / can_manage_expense_catalog, admin corporativo); `cash.*`, en
 * 20261009000000 (private.can_read_cash / can_operate_cash / can_reopen_cash); `pnl.read`, en
 * 20261010000000 (private.can_read_pnl); `dashboards.*`, en 20261013000000
 * (private.can_read_dashboards / can_manage_dashboards, admin corporativo);
 * `memberships.metrics.read` = private.can_read_membership_metrics (20261002000000);
 * `customers.metrics.read` = private.can_read_customer_metrics (20261015000000).
 * `alerts.*`, en 20261018000000 (private.can_read_alerts / can_manage_alerts;
 * reglas: admin_socio corporativo). `users.manage`, en 20261019000000
 * (public.can_admin_users: admin_socio corporativo).
 * `operations.*`,
 * `commercial.read`, `finance.read`, `executive.read` y `b2b.write` definen la
 * navegación por dominio y son el contrato para las tablas de negocio futuras.
 */
export const ROLE_CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  admin_socio: [
    "center.read",
    "operations.read",
    "commercial.read",
    "finance.read",
    "executive.read",
    "center.manage",
    "members.read",
    "members.manage",
    "audit.read",
    "operations.write",
    "b2b.write",
    "clients.read",
    "clients.write",
    "catalog.read",
    "catalog.manage",
    "agenda.read",
    "agenda.write",
    "agenda.manage",
    "orders.read",
    "orders.write",
    "orders.manage",
    "memberships.read",
    "memberships.write",
    "memberships.manage",
    "crm.read",
    "crm.write",
    "b2b.read",
    "b2b.billing",
    "upsell.read",
    "upsell.manage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.metrics.read",
    "pipeline.manage",
    "payments.read",
    "payments.write",
    "payments.reverse",
    "expenses.read",
    "expenses.write",
    "expenses.approve",
    "expenses.manage",
    "cash.read",
    "cash.operate",
    "cash.reopen",
    "pnl.read",
    "dashboards.read",
    "dashboards.manage",
    "alerts.read",
    "alerts.manage",
    "alerts.rules",
    "users.manage",
    "centers.setup",
    "memberships.metrics.read",
    "customers.metrics.read",
    "leads.use",
    "leads.manage",
    "commercial.metrics.read",
    "clients.merge",
    "channels.manage",
    "marketing.read",
    "marketing.manage",
    "promotions.manage",
  ],
  encargado: [
    "center.read",
    "operations.read",
    "commercial.read",
    "members.read",
    "operations.write",
    "clients.read",
    "clients.write",
    "catalog.read",
    "agenda.read",
    "agenda.write",
    "agenda.manage",
    "orders.read",
    "orders.write",
    "orders.manage",
    "memberships.read",
    "memberships.write",
    "memberships.manage",
    "crm.read",
    "crm.write",
    "b2b.read",
    "upsell.read",
    "pipeline.read",
    "pipeline.write",
    "pipeline.metrics.read",
    "payments.read",
    "payments.write",
    "payments.reverse",
    "expenses.read",
    "expenses.write",
    "cash.read",
    "cash.operate",
    "pnl.read",
    "dashboards.read",
    "alerts.read",
    "alerts.manage",
    "memberships.metrics.read",
    "customers.metrics.read",
    "leads.use",
    "commercial.metrics.read",
    "clients.merge",
    "marketing.read",
    "marketing.manage",
  ],
  operador_recepcion: [
    "center.read",
    "operations.read",
    "operations.write",
    "clients.read",
    "clients.write",
    "catalog.read",
    "agenda.read",
    "agenda.write",
    "orders.read",
    "orders.write",
    "memberships.read",
    "memberships.write",
    "crm.read",
    "crm.write",
    "payments.read",
    "payments.write",
    "cash.read",
    "leads.use",
    "marketing.read",
  ],
  // El contador no ve datos personales de clientes.
  contador: [
    "center.read",
    "finance.read",
    "members.read",
    "audit.read",
    "catalog.read",
    "b2b.read",
    "upsell.read",
    "pipeline.metrics.read",
    "payments.read",
    "expenses.read",
    "cash.read",
    "pnl.read",
    "dashboards.read",
    "alerts.read",
    "memberships.metrics.read",
    "customers.metrics.read",
    "commercial.metrics.read",
    "marketing.read",
  ],
  comercial_b2b: [
    "center.read",
    "commercial.read",
    "b2b.write",
    "clients.read",
    "catalog.read",
    "memberships.read",
    "memberships.write",
    "crm.read",
    "crm.write",
    "b2b.read",
    "b2b.billing",
    "upsell.read",
    "pipeline.read",
    "pipeline.write",
    "pipeline.metrics.read",
    "dashboards.read",
    "memberships.metrics.read",
    "customers.metrics.read",
    "leads.use",
    "commercial.metrics.read",
    "marketing.read",
    "marketing.manage",
  ],
};

export function can(roles: readonly AppRole[], capability: Capability): boolean {
  return roles.some((role) => ROLE_CAPABILITIES[role].includes(capability));
}

export function hasAnyRole(
  roles: readonly AppRole[] | null | undefined,
  allowed: readonly AppRole[],
): boolean {
  return roles != null && roles.some((role) => allowed.includes(role));
}

/** Un rol es de sólo lectura si no tiene ninguna capacidad de escritura. */
export function isReadOnlyRole(role: AppRole): boolean {
  return ROLE_CAPABILITIES[role].every((c) => c.endsWith(".read"));
}

export interface ActorRoles {
  /** Roles del actor en el centro (user_detail_centers). */
  centerRoles: readonly AppRole[];
  /** Roles del actor en la organización del centro (role_assignments). */
  corporateRoles: readonly AppRole[];
}

/**
 * Espejo de `private.can_manage_center_member`: el admin_socio corporativo
 * asigna cualquier rol en los centros de su organización; el admin_socio de
 * un centro, cualquiera salvo admin_socio.
 */
export function canManageCenterMember(actor: ActorRoles, target: AppRole): boolean {
  if (actor.corporateRoles.includes("admin_socio")) return true;
  return target !== "admin_socio" && actor.centerRoles.includes("admin_socio");
}

/** Sólo el admin_socio corporativo asigna roles a nivel organización. */
export function canManageRoleAssignments(corporateRoles: readonly AppRole[]): boolean {
  return corporateRoles.includes("admin_socio");
}
