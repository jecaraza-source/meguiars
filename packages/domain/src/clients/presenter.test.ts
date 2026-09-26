import { describe, expect, it } from "vitest";
import type { CenterAccess } from "../access/access";
import type { ClientDetail } from "./client";
import { formatDateInCenterTimeZone } from "../time";
import { presentClientDetail, presentHistoryEntry, presentSearchResult } from "./presenter";

// El texto exacto del mes depende de la versión de ICU; lo que importa es el día en la zona del centro.
const SEPT_25 = formatDateInCenterTimeZone("2026-09-26T02:00:00Z", "America/Mexico_City");

const access = [
  {
    center: {
      id: "A",
      organizationId: "O",
      code: "A-01",
      name: "Centro A",
      timezone: "America/Mexico_City",
      active: true,
      createdAt: "",
      updatedAt: "",
    },
    organizationName: "Org",
    roles: ["operador_recepcion"],
    corporateRoles: [],
  },
] as CenterAccess[];

const detail: ClientDetail = {
  id: "c",
  organizationId: "O",
  homeDetailCenterId: "A",
  kind: "company",
  fullName: "Transportes del Norte",
  phone: "+528181234567",
  email: null,
  notes: null,
  marketing: {
    optIn: true,
    channels: ["whatsapp", "email"],
    updatedAt: "2026-09-01T00:00:00Z",
    source: "web",
  },
  // 02:00 UTC del 26 = 25 de septiembre en Ciudad de México.
  lastVisitAt: "2026-09-26T02:00:00Z",
  lastVisitDetailCenterId: "B",
  active: true,
  createdAt: "",
  updatedAt: "",
  vehicles: [
    {
      id: "v1",
      clientId: "c",
      make: "Nissan",
      model: "NP300",
      year: 2020,
      plate: "NL4521A",
      identifier: null,
      notes: null,
      active: true,
      createdAt: "",
    },
    {
      id: "v2",
      clientId: "c",
      make: "Nissan",
      model: "NP300",
      year: 2018,
      plate: "NL1111A",
      identifier: null,
      notes: null,
      active: false,
      createdAt: "",
    },
  ],
  centerIds: ["A", "B"],
};

describe("presentadores de clientes", () => {
  it("la fecha usada es la del centro, no la UTC", () => {
    expect(SEPT_25).toMatch(/^25 /);
  });

  it("resume el expediente con fechas en la zona del centro y centros no visibles como genéricos", () => {
    expect(presentClientDetail(detail, access, "America/Mexico_City")).toEqual({
      title: "Transportes del Norte",
      subtitle: "Empresa / flotilla · +52 81 8123 4567",
      homeCenter: "Centro A",
      lastVisit: SEPT_25,
      lastVisitCenter: "Otro centro",
      vehiclesCount: 1,
      centers: "Centro A, Otro centro",
      consent: "WhatsApp, Email",
    });
  });

  it("fila de búsqueda y entrada de historial", () => {
    expect(
      presentSearchResult(
        {
          id: "c",
          fullName: "José Pérez",
          phone: "+525512345678",
          email: null,
          kind: "person",
          homeDetailCenterId: "A",
          homeCenterName: null,
          lastVisitAt: null,
          inActiveCenter: true,
          plates: [],
          matchedOn: "phone",
        },
        "America/Mexico_City",
      ),
    ).toMatchObject({
      phone: "+52 55 1234 5678",
      plates: "—",
      home: "Otro centro",
      lastVisit: "Sin visitas registradas",
      match: "Teléfono",
    });
    expect(
      presentHistoryEntry(
        {
          occurredAt: "2026-09-26T02:00:00Z",
          kind: "vehicle_added",
          detailCenterId: "A",
          detailCenterName: "Centro A",
          title: "Vehículo Mazda 3 2021 (ABC1234)",
          vehicleId: "v1",
        },
        "America/Mexico_City",
      ),
    ).toMatchObject({ date: SEPT_25, kind: "Vehículo", center: "Centro A" });
  });
});
