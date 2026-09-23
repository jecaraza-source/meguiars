import { describe, expect, it } from "vitest";
import { summarizeAccess, type CenterAccess } from "./access";

const access = (id: string, org: string, corporate: boolean, active = true): CenterAccess => ({
  center: {
    id,
    organizationId: org,
    code: id.toUpperCase(),
    name: id,
    timezone: "UTC",
    active,
    createdAt: "",
    updatedAt: "",
  },
  organizationName: org,
  roles: corporate ? ["contador"] : ["encargado"],
  corporateRoles: corporate ? ["contador"] : [],
});

describe("summarizeAccess", () => {
  it("resume centros, organizaciones y vista corporativa", () => {
    expect(
      summarizeAccess([access("a", "o1", true), access("b", "o1", true, false), access("c", "o2", false)]),
    ).toEqual({ centers: 3, activeCenters: 2, organizations: 2, corporateCenters: 2 });
  });

  it("maneja la lista vacía", () => {
    expect(summarizeAccess([])).toEqual({
      centers: 0,
      activeCenters: 0,
      organizations: 0,
      corporateCenters: 0,
    });
  });
});
