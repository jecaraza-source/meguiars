import { describe, expect, it } from "vitest";
import { guardScreen } from "../auth/guards";
import { navScreenOf, visibleNavigation } from "../navigation";
import { ROLE_CAPABILITIES } from "../roles";
import {
  contributionMargin,
  estimateQuote,
  firstResponseMinutes,
  marginPct,
  mergeBlocker,
  operatorPay,
  priceDrift,
  quoteBookingBlocker,
  quoteDisplayStatus,
  quoteEditable,
  quoteStatusActions,
  suggestedKeep,
  type DuplicatePair,
  type QuoteItem,
} from "./commercial";
import { INTEGRATIONS } from "./integrations";
import { formatMinutes, presentLead } from "./presenter";

describe("cotización: pago al operador y margen de contribución", () => {
  it("Lavado manual detallado: costo del operador = base × % / 100 (base = precio de la línea menos su descuento)", () => {
    expect(operatorPay({ quantity: 1, unitPrice: 400, lineDiscount: 0, operatorCommissionPct: 30 })).toBe(
      120,
    );
    expect(operatorPay({ quantity: 1, unitPrice: 400, lineDiscount: 40, operatorCommissionPct: 30 })).toBe(
      108,
    );
    expect(operatorPay({ quantity: 2, unitPrice: 100, lineDiscount: 0, operatorCommissionPct: null })).toBe(
      0,
    );
    expect(operatorPay({ quantity: 1, unitPrice: 100, lineDiscount: 150, operatorCommissionPct: 30 })).toBe(
      0,
    );
  });

  it("estimado: margen = total − otros costos − pago al operador; % sólo con ventas", () => {
    const e = estimateQuote([
      { quantity: 1, unitPrice: 400, unitDirectCost: 40, operatorCommissionPct: 30 },
      { quantity: 1, unitPrice: 600, unitDirectCost: 120, operatorCommissionPct: null },
    ]);
    expect(e).toEqual({
      subtotal: 1000,
      total: 1000,
      standardCostTotal: 160,
      operatorPayTotal: 120,
      contributionMargin: 720,
    });
    expect(contributionMargin({ total: 860, standardCostTotal: 160, operatorPayTotal: 108 })).toBe(592);
    expect(marginPct(720, 1000)).toBe(72);
    expect(marginPct(0, 0)).toBeNull();
  });
});

describe("cotización: estados, vencimiento y reserva", () => {
  const base = { status: "enviada" as const, expired: false, clientId: "c1" };
  it("vencida es un estado de presentación (sin decidir y con la vigencia pasada)", () => {
    expect(quoteDisplayStatus({ ...base, expired: true })).toBe("vencida");
    expect(quoteEditable({ ...base, expired: true })).toBe(false);
    expect(quoteEditable(base)).toBe(true);
    expect(quoteEditable({ ...base, status: "convertida" })).toBe(false);
  });
  it("reservar exige cliente, vigencia y que no esté cerrada", () => {
    expect(quoteBookingBlocker(base)).toBeNull();
    expect(quoteBookingBlocker({ ...base, clientId: null })).toMatch(/liga al cliente/);
    expect(quoteBookingBlocker({ ...base, expired: true })).toMatch(/venció/);
    expect(quoteBookingBlocker({ ...base, status: "convertida" })).toMatch(/reservó/);
  });
  it("cambios de estado permitidos", () => {
    expect(quoteStatusActions({ status: "borrador", expired: false })).toEqual([
      "enviada",
      "aceptada",
      "rechazada",
      "cancelada",
    ]);
    expect(quoteStatusActions({ status: "enviada", expired: true })).toEqual(["rechazada", "cancelada"]);
    expect(quoteStatusActions({ status: "convertida", expired: false })).toEqual([]);
  });
  it("avisa las líneas cuyo precio de catálogo cambió", () => {
    const item = { unitPrice: 400, currentPrice: 450 } as QuoteItem;
    expect(priceDrift([item, { unitPrice: 600, currentPrice: 600 } as QuoteItem])).toEqual([item]);
  });
});

describe("prospectos", () => {
  it("tiempo de primera respuesta", () => {
    expect(firstResponseMinutes("2026-09-30T10:00:00Z", null)).toBeNull();
    expect(firstResponseMinutes("2026-09-30T10:00:00Z", "2026-09-30T10:42:00Z")).toBe(42);
    expect(formatMinutes(42)).toBe("42 min");
    expect(formatMinutes(185)).toBe("3 h 5 min");
    expect(formatMinutes(60 * 26)).toBe("1 d 2 h");
  });
  it("la ficha resalta al prospecto sin contactar y su siguiente acción", () => {
    const view = presentLead({
      id: "l",
      detailCenterId: "c",
      centerName: "C",
      fullName: "Ana",
      phone: null,
      email: null,
      socialHandle: "@ana",
      source: "instagram",
      sourceDetail: null,
      referredByClientId: null,
      referredByName: null,
      clientId: null,
      clientName: null,
      vehicleDescription: null,
      notes: null,
      consentChannels: [],
      estimatedValue: null,
      stageId: "s",
      stageName: "Nuevo",
      stagePosition: 1,
      status: "abierta",
      ownerId: null,
      ownerName: null,
      nextAction: "Enviar precio",
      nextActionOn: "2026-09-29",
      firstContactAt: null,
      closedAt: null,
      wonValue: null,
      serviceOrderId: null,
      serviceOrderFolio: null,
      lossReason: null,
      lossNotes: null,
      interestServiceIds: [],
      interestServiceNames: ["Lavado manual detallado"],
      openTasks: 0,
      quotes: 0,
      version: 1,
      createdAt: "2026-09-29T10:00:00Z",
      today: "2026-09-30",
    });
    expect(view).toMatchObject({
      sourceLabel: "Instagram",
      contact: "@ana",
      uncontacted: true,
      firstResponse: "Sin contactar",
      nextActionLabel: "Acción vencida",
      nextActionTone: "danger",
    });
  });
});

describe("duplicados: fusión supervisada", () => {
  const side = (over: Partial<DuplicatePair["a"]>) => ({
    clientId: "x",
    name: "Ana",
    phone: "+525511112222",
    email: null,
    createdAt: "2026-01-01",
    orders: 0,
    activeMemberships: 0,
    b2b: false,
    ...over,
  });
  it("sugiere conservar al que tiene membresía o cuenta B2B, luego más órdenes, luego el más antiguo", () => {
    const pair = (a: Partial<DuplicatePair["a"]>, b: Partial<DuplicatePair["a"]>): DuplicatePair => ({
      a: side({ clientId: "a", ...a }),
      b: side({ clientId: "b", ...b }),
      matchedOn: ["telefono"],
      nameSimilarity: 1,
    });
    expect(suggestedKeep(pair({ orders: 5 }, { activeMemberships: 1 }))).toBe("b");
    expect(suggestedKeep(pair({ b2b: true }, { orders: 20 }))).toBe("a");
    expect(suggestedKeep(pair({ orders: 1 }, { orders: 3 }))).toBe("b");
    expect(suggestedKeep(pair({ createdAt: "2026-02-01" }, { createdAt: "2026-01-01" }))).toBe("b");
  });
  it("bloquea lo que la base rechaza", () => {
    expect(mergeBlocker(side({ b2b: true }), side({ b2b: true }))).toMatch(/B2B/);
    expect(mergeBlocker(side({}), side({ activeMemberships: 1 }))).toMatch(/membresía/);
    expect(mergeBlocker(side({ activeMemberships: 1 }), side({}))).toBeNull();
  });
});

describe("permisos y navegación", () => {
  const state = (roles: string[]) =>
    ({
      status: "signed_in",
      user: { id: "u", email: "u@x" },
      profile: { id: "u", fullName: "U", active: true },
      activeCenterId: "c1",
      access: [
        {
          center: { id: "c1", organizationId: "o", code: "A", name: "A", timezone: "UTC", active: true },
          roles,
          corporateRoles: [],
        },
      ],
    }) as unknown as Parameters<typeof guardScreen>[0];

  it("recepción registra prospectos y cotiza; no fusiona ni ve reportes", () => {
    expect(ROLE_CAPABILITIES.operador_recepcion).toContain("leads.use");
    expect(guardScreen(state(["operador_recepcion"]), "leads").allow).toBe(true);
    expect(guardScreen(state(["operador_recepcion"]), "duplicates").allow).toBe(false);
    expect(guardScreen(state(["operador_recepcion"]), "commercialReports").allow).toBe(false);
  });
  it("el contador lee los reportes (sin datos personales) pero no prospectos ni segmentos", () => {
    expect(guardScreen(state(["contador"]), "commercialReports").allow).toBe(true);
    expect(guardScreen(state(["contador"]), "leads").allow).toBe(false);
    expect(guardScreen(state(["contador"]), "segments").allow).toBe(false);
  });
  it("el encargado fusiona duplicados; las pantallas de detalle cuelgan de su lista", () => {
    expect(guardScreen(state(["encargado"]), "duplicates").allow).toBe(true);
    expect(navScreenOf("leadDetail")).toBe("leads");
    expect(navScreenOf("quoteNew")).toBe("quotes");
    const screens = visibleNavigation(state(["encargado"]))
      .flatMap((s) => s.items)
      .map((i) => i.screen);
    expect(screens).toEqual(
      expect.arrayContaining(["leads", "quotes", "segments", "duplicates", "commercialReports"]),
    );
  });
  it("ninguna integración se presenta como conectada sin comprobarla", () => {
    expect(INTEGRATIONS.every((i) => i.status !== "conectada")).toBe(true);
    expect(INTEGRATIONS.filter((i) => i.priority).map((i) => i.channel)).toEqual([
      "instagram",
      "facebook",
      "whatsapp_business",
    ]);
  });
});
