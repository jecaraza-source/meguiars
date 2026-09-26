import { describe, expect, it } from "vitest";
import {
  allowedTaskChannels,
  allowedTaskKinds,
  channelForKind,
  customerSegment,
  nextVisitState,
  type CrmCustomer,
} from "./crm";
import { contactLinks, presentCrmCustomer, taskDueRange } from "./presenter";

const base = {
  kind: "person",
  b2bOrders: 0,
  membershipStatus: null,
  visits: 0,
  lastVisit: null,
  today: "2026-10-01",
};

describe("segmentos (espejo de private.customer_segment, mismos casos que la prueba SQL)", () => {
  it("B2B > miembro > inactivo (>180 días) > recurrente (≥2 visitas) > nuevo", () => {
    expect(customerSegment({ ...base, kind: "company" })).toBe("b2b_contacto");
    expect(customerSegment({ ...base, b2bOrders: 1, visits: 1, lastVisit: "2026-09-01" })).toBe(
      "b2b_contacto",
    );
    expect(customerSegment({ ...base, membershipStatus: "activa" })).toBe("miembro");
    expect(
      customerSegment({ ...base, membershipStatus: "vencida", visits: 5, lastVisit: "2026-03-01" }),
    ).toBe("inactivo");
    expect(customerSegment({ ...base, visits: 2, lastVisit: "2026-09-01" })).toBe("recurrente");
    expect(customerSegment({ ...base, visits: 1, lastVisit: "2026-09-01" })).toBe("nuevo");
    expect(customerSegment(base)).toBe("nuevo");
  });

  it("próxima visita: vencida, próxima (≤ 14 días) o programada", () => {
    expect(nextVisitState("2026-09-30", "2026-10-01")).toBe("vencida");
    expect(nextVisitState("2026-10-15", "2026-10-01")).toBe("proxima");
    expect(nextVisitState("2026-10-16", "2026-10-01")).toBe("programada");
    expect(nextVisitState(null, "2026-10-01")).toBeNull();
  });
});

describe("consentimiento", () => {
  it("canal por tipo y tipos/canales permitidos según el opt-in", () => {
    expect(channelForKind("llamar")).toBe("llamada");
    expect(channelForKind("renovar")).toBe("presencial");
    expect(channelForKind("renovar", "whatsapp")).toBe("whatsapp");
    expect(allowedTaskKinds([])).toEqual(["renovar", "ofrecer_mantenimiento"]);
    expect(allowedTaskKinds(["whatsapp"])).toEqual(["whatsapp", "renovar", "ofrecer_mantenimiento"]);
    expect(allowedTaskChannels(["email", "sms"])).toEqual(["email", "presencial"]);
  });

  it("enlaces de contacto manual sólo por canales aceptados", () => {
    expect(contactLinks({ phone: "+525512345678", email: "a@b.mx", optedInChannels: ["whatsapp"] })).toEqual([
      { channel: "whatsapp", label: "WhatsApp", href: "https://wa.me/525512345678" },
    ]);
    expect(contactLinks({ phone: "+525512345678", email: null, optedInChannels: [] })).toEqual([]);
  });
});

describe("presentación", () => {
  it("ficha: valor acumulado con desglose y próxima recomendación", () => {
    const c: CrmCustomer = {
      clientId: "c1",
      fullName: "José Pérez",
      phone: "+525512345678",
      email: null,
      kind: "person",
      segment: "recurrente",
      visits: 3,
      lastVisitAt: "2026-09-20T16:00:00Z",
      servicesValue: 2800,
      membershipValue: 449,
      lifetimeValue: 3249,
      membershipId: null,
      membershipNumber: null,
      membershipPlan: null,
      membershipStatus: null,
      membershipEndsOn: null,
      nextVisitOn: "2026-10-20",
      nextVisitState: "proxima",
      nextVisitService: "Lavado exprés",
      nextVisitOrderId: "o1",
      nextVisitFolio: "CDMX-01-000001",
      openTasks: 1,
      optedInChannels: ["whatsapp"],
    };
    expect(presentCrmCustomer(c, "America/Mexico_City")).toMatchObject({
      segment: "Recurrente",
      lifetimeValue: "$3,249.00",
      nextVisit: "20 oct 2026 · Lavado exprés",
      nextVisitLabel: "Próxima",
      membership: "Sin membresía",
    });
  });

  it("rangos de vencimiento de la cola", () => {
    expect(taskDueRange("vencidas", "2026-10-01")).toEqual({ before: "2026-10-01" });
    expect(taskDueRange("hoy", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(taskDueRange("proximas", "2026-10-01")).toEqual({ from: "2026-10-02", to: "2026-10-08" });
  });
});
