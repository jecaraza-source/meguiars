import { centersCopy } from "../centers/copy";
import { isReadOnlyRole, ROLE_LABELS } from "../roles";
import { summarizeAccess, type CenterAccess } from "./access";

export type AccessBadge = "corporate" | "inactive" | "readOnly";

export interface CenterAccessItem {
  id: string;
  title: string;
  /** Código del centro · organización. */
  subtitle: string;
  timezone: string;
  rolesText: string;
  badges: { kind: AccessBadge; label: string }[];
}

const BADGE_LABELS: Record<AccessBadge, string> = {
  corporate: centersCopy.corporateBadge,
  inactive: centersCopy.inactiveBadge,
  readOnly: centersCopy.readOnlyBadge,
};

/** Lo que web y móvil muestran de cada centro: misma información en ambas. */
export function presentCenterAccess(access: CenterAccess): CenterAccessItem {
  const kinds: AccessBadge[] = [];
  if (access.corporateRoles.length > 0) kinds.push("corporate");
  if (!access.center.active) kinds.push("inactive");
  if (access.roles.length > 0 && access.roles.every(isReadOnlyRole)) kinds.push("readOnly");
  return {
    id: access.center.id,
    title: access.center.name,
    subtitle: `${access.center.code} · ${access.organizationName}`,
    timezone: access.center.timezone,
    rolesText: access.roles.length > 0 ? access.roles.map((r) => ROLE_LABELS[r]).join(", ") : "—",
    badges: kinds.map((kind) => ({ kind, label: BADGE_LABELS[kind] })),
  };
}

/** Texto de la vista corporativa consolidada, o null si el usuario no tiene rol corporativo. */
export function corporateSummaryText(list: readonly CenterAccess[]): string | null {
  const summary = summarizeAccess(list);
  if (summary.corporateCenters === 0) return null;
  const orgs = new Set(list.filter((a) => a.corporateRoles.length > 0).map((a) => a.center.organizationId))
    .size;
  return centersCopy.corporateSummary(summary.corporateCenters, orgs);
}
