import { describe, expect, it } from "vitest";
import {
  APP_ROLES,
  can,
  canManageCenterMember,
  canManageRoleAssignments,
  hasAnyRole,
  isReadOnlyRole,
  ROLE_CAPABILITIES,
  ROLE_LABELS,
} from "./roles";

describe("roles y capacidades", () => {
  it("cada rol tiene etiqueta y capacidades", () => {
    for (const role of APP_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_CAPABILITIES[role]).toContain("center.read");
    }
  });

  it("el contador es de sólo lectura (criterio de aceptación)", () => {
    expect(isReadOnlyRole("contador")).toBe(true);
    expect(can(["contador"], "audit.read")).toBe(true);
    expect(can(["contador"], "center.manage")).toBe(false);
    expect(can(["contador"], "members.manage")).toBe(false);
    expect(can(["contador"], "operations.write")).toBe(false);
    expect(APP_ROLES.filter(isReadOnlyRole)).toEqual(["contador"]);
  });

  it("refleja las políticas RLS de lectura de membresías y auditoría", () => {
    const readers = (cap: "members.read" | "audit.read") => APP_ROLES.filter((r) => can([r], cap));
    expect(readers("members.read")).toEqual(["admin_socio", "encargado", "contador"]);
    expect(readers("audit.read")).toEqual(["admin_socio", "contador"]);
  });

  it("combina capacidades de varios roles", () => {
    expect(can(["contador", "operador_recepcion"], "operations.write")).toBe(true);
    expect(hasAnyRole(["encargado"], ["admin_socio"])).toBe(false);
    expect(hasAnyRole(null, ["admin_socio"])).toBe(false);
  });

  it("gestión de membresías: espejo de private.can_manage_center_member", () => {
    const corporate = { centerRoles: [], corporateRoles: ["admin_socio"] } as const;
    const centerAdmin = { centerRoles: ["admin_socio"], corporateRoles: [] } as const;
    const encargado = { centerRoles: ["encargado"], corporateRoles: ["contador"] } as const;
    expect(canManageCenterMember(corporate, "admin_socio")).toBe(true);
    expect(canManageCenterMember(centerAdmin, "encargado")).toBe(true);
    expect(canManageCenterMember(centerAdmin, "admin_socio")).toBe(false);
    expect(canManageCenterMember(encargado, "operador_recepcion")).toBe(false);
  });

  it("sólo el admin_socio corporativo asigna roles de organización", () => {
    expect(canManageRoleAssignments(["admin_socio"])).toBe(true);
    expect(canManageRoleAssignments(["contador"])).toBe(false);
  });
});
