import { describe, expect, it } from "vitest";
import { canAssignRole, hasAnyRole, CENTER_ADMIN_ROLES } from "./roles";

describe("roles", () => {
  it("sólo owner/admin administran el centro", () => {
    expect(hasAnyRole("admin", CENTER_ADMIN_ROLES)).toBe(true);
    expect(hasAnyRole("technician", CENTER_ADMIN_ROLES)).toBe(false);
    expect(hasAnyRole(null, CENTER_ADMIN_ROLES)).toBe(false);
  });

  it("sólo un owner otorga el rol owner (espejo de la política RLS)", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "manager")).toBe(true);
    expect(canAssignRole("manager", "viewer")).toBe(false);
  });
});
