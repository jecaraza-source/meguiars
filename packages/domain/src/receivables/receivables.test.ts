import { describe, expect, it } from "vitest";
import {
  agingBucketOf,
  agingInputs,
  receivablesTotals,
  agingBuckets,
  autoAllocation,
  b2bDocumentStatus,
  documentActions,
  previewAllocation,
  receivablesAging,
  receivableTraceGap,
  type B2bReceivableAccount,
} from "./receivables";
import {
  presentAccountPayment,
  presentDocumentRow,
  presentReceivableAccount,
  receivablesErrorMessage,
  receivablesExportCsv,
} from "./presenter";

describe("estado del documento (espejo de private.b2b_document_status)", () => {
  const base = { status: "emitida" as const, amount: 100, paid: 0, externalRef: null, dueOn: "2026-10-10" };
  it("precedencia anulado > cobrado > vencido > parcial > facturado externo > por facturar", () => {
    expect(b2bDocumentStatus({ ...base, status: "anulada", paid: 100 }, "2026-10-01")).toBe("anulado");
    expect(b2bDocumentStatus({ ...base, paid: 100 }, "2026-12-01")).toBe("cobrado");
    expect(b2bDocumentStatus({ ...base, paid: 40, externalRef: "F-1" }, "2026-10-11")).toBe("vencido");
    expect(b2bDocumentStatus(base, "2026-10-11")).toBe("vencido");
    expect(b2bDocumentStatus({ ...base, paid: 40 }, "2026-10-10")).toBe("parcial");
    expect(b2bDocumentStatus({ ...base, externalRef: "F-1" }, "2026-10-10")).toBe("facturado_externo");
    expect(b2bDocumentStatus(base, "2026-10-01")).toBe("por_facturar");
  });
  it("compara en centavos (0.1 + 0.2)", () => {
    expect(b2bDocumentStatus({ ...base, amount: 0.3, paid: 0.1 + 0.2 }, "2026-10-01")).toBe("cobrado");
  });
});

describe("antigüedad", () => {
  it("rangos por defecto 0-30 / 31-60 / 61-90 / 90+", () => {
    const b = agingBuckets();
    expect(b.map((x) => x.key)).toEqual(["0-30", "31-60", "61-90", "90+"]);
    expect(agingBucketOf(0, b).key).toBe("0-30");
    expect(agingBucketOf(30, b).key).toBe("0-30");
    expect(agingBucketOf(31, b).key).toBe("31-60");
    expect(agingBucketOf(90, b).key).toBe("61-90");
    expect(agingBucketOf(91, b).key).toBe("90+");
    expect(agingBucketOf(-3, b).key).toBe("0-30");
  });
  it("rangos configurables y validados", () => {
    expect(agingBuckets([15, 45]).map((x) => x.key)).toEqual(["0-15", "16-45", "45+"]);
    expect(() => agingBuckets([30, 30])).toThrow();
    expect(() => agingBuckets([])).toThrow();
    expect(() => agingBuckets([0, 10])).toThrow();
  });
  it("suma documentos y OS sin agrupar por rango y por cuenta", () => {
    const r = receivablesAging([
      { accountId: "a", accountName: "Alfa", amount: 100.1, ageDays: 10, kind: "documento" },
      { accountId: "a", accountName: "Alfa", amount: 200.2, ageDays: 45, kind: "sin_agrupar" },
      { accountId: "b", accountName: "Beta", amount: 500, ageDays: 120, kind: "documento" },
      { accountId: "b", accountName: "Beta", amount: 0, ageDays: 5, kind: "documento" },
    ]);
    expect(r.totals).toEqual([100.1, 200.2, 0, 500]);
    expect(r.documents).toEqual([100.1, 0, 0, 500]);
    expect(r.unbilled).toEqual([0, 200.2, 0, 0]);
    expect(r.total).toBe(800.3);
    expect(r.byAccount.map((a) => [a.accountName, a.total])).toEqual([
      ["Beta", 500],
      ["Alfa", 300.3],
    ]);
  });
});

describe("aplicación de pagos", () => {
  const docs = [
    { id: "d1", folio: "CXC-000001", issuedOn: "2026-09-01", dueOn: "2026-10-20", balance: 3000 },
    { id: "d2", folio: "CXC-000002", issuedOn: "2026-09-10", dueOn: "2026-10-05", balance: 200 },
    { id: "d3", folio: "CXC-000003", issuedOn: "2026-09-20", dueOn: "2026-10-20", balance: 0 },
  ];
  it("automática: compromiso más antiguo primero (espejo de b2b_apply_payment)", () => {
    expect(autoAllocation(1200, docs)).toEqual([
      { invoiceId: "d2", amount: 200 },
      { invoiceId: "d1", amount: 1000 },
    ]);
    expect(autoAllocation(5000, docs)).toEqual([
      { invoiceId: "d2", amount: 200 },
      { invoiceId: "d1", amount: 3000 },
    ]);
  });
  it("explícita: valida saldo por documento, pago y saldo por cobrar; lo demás queda a favor", () => {
    expect(previewAllocation(900, [{ invoiceId: "d1", amount: 500 }], docs, 3200)).toEqual({
      applied: 500,
      unapplied: 400,
      issues: [],
    });
    expect(previewAllocation(500, [{ invoiceId: "d2", amount: 300 }], docs, 3200).issues).toEqual([
      "Lo aplicado a CXC-000002 supera su saldo.",
    ]);
    expect(previewAllocation(100, [{ invoiceId: "d1", amount: 150 }], docs, 3200).issues).toEqual([
      "Lo aplicado no puede superar el pago.",
    ]);
    expect(previewAllocation(5000, [], docs, 3200).issues).toEqual([
      "El pago no puede superar el saldo por cobrar.",
    ]);
    expect(previewAllocation(10, [{ invoiceId: "x", amount: 5 }], docs, 3200).issues).toEqual([
      "Sólo se aplica a documentos con saldo de la cuenta.",
    ]);
  });
});

const account: B2bReceivableAccount = {
  accountId: "a",
  accountName: "Flotillas SA",
  homeDetailCenterId: "c",
  status: "activa",
  unbilledOrders: 400,
  unbilledOrdersCount: 1,
  unbilledFees: 0,
  documentsBalance: 1100,
  porFacturar: 0,
  facturadoExterno: 0,
  parcial: 100,
  vencido: 1000,
  unapplied: 0,
  consumption: 3600,
  paid: 2100,
  balance: 1500,
  oldestUnbilledOn: "2026-09-27",
  creditLimit: null,
};

describe("saldo trazable y presentación", () => {
  it("consumo − pagos = sin agrupar + documentos − saldo a favor", () => {
    expect(receivableTraceGap(account)).toBe(0);
    expect(receivableTraceGap({ ...account, unapplied: 50 })).toBe(50);
    const p = presentReceivableAccount(account);
    expect(p.traceOk).toBe(true);
    expect(p.balance).toBe("$1,500.00");
    expect(p.unbilled).toBe("$400.00 · 1 OS");
    expect(p.overdueTone).toBe("danger");
  });

  it("acciones del documento según estado y permiso", () => {
    expect(documentActions({ status: "parcial", paid: 10 }, { billing: true })).toEqual({
      edit: true,
      void: false,
      pay: true,
    });
    expect(documentActions({ status: "por_facturar", paid: 0 }, { billing: true })).toEqual({
      edit: true,
      void: true,
      pay: true,
    });
    expect(documentActions({ status: "cobrado", paid: 100 }, { billing: true }).pay).toBe(false);
    expect(documentActions({ status: "anulado", paid: 0 }, { billing: true })).toEqual({
      edit: false,
      void: false,
      pay: false,
    });
    expect(documentActions({ status: "vencido", paid: 0 }, { billing: false })).toEqual({
      edit: false,
      void: false,
      pay: false,
    });
  });

  it("filas de documento y pago", () => {
    const row = presentDocumentRow({
      id: "d1",
      accountId: "a",
      accountName: "Flotillas SA",
      homeDetailCenterId: "c",
      folio: "CXC-000001",
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      issuedOn: "2026-09-01",
      externalRef: null,
      externalInvoicedOn: null,
      dueOn: "2026-09-16",
      dueOnReason: null,
      ordersAmount: 3000,
      feeAmount: 1000,
      amount: 4000,
      paid: 0,
      balance: 4000,
      status: "vencido",
      ageDays: 26,
      daysOverdue: 11,
      ordersCount: 2,
      notes: null,
      voidReason: null,
      createdAt: "2026-09-01T12:00:00Z",
    });
    expect(row).toMatchObject({
      period: "1 ago 2026 – 31 ago 2026",
      status: "Vencido",
      statusTone: "danger",
      overdue: "11 días",
      externalRef: "—",
      orders: "2 OS + cuota",
    });
    const pay = presentAccountPayment({
      id: "p",
      amount: 900,
      method: "cheque",
      reference: "CH-12",
      paidOn: "2026-09-20",
      voidedAt: null,
      voidReason: null,
      applied: 500,
      unapplied: 400,
      allocations: [{ invoiceId: "d1", folio: "CXC-000001", amount: 500 }],
      createdAt: "2026-09-20T12:00:00Z",
    });
    expect(pay).toMatchObject({
      title: "20 sep 2026 · Cheque · CH-12",
      allocations: "CXC-000001 $500.00",
      unapplied: "$400.00",
    });
  });

  it("CSV de soporte: encabezado fijo, importes con punto y celdas escapadas", () => {
    const csv = receivablesExportCsv([
      {
        folio: "CXC-000001",
        status: "vencido",
        accountName: "Flotillas, SA",
        legalName: 'Flotillas "del Valle"',
        rfc: "FVA010101AB1",
        taxRegime: "601",
        fiscalZip: "06600",
        billingEmail: null,
        periodFrom: "2026-08-01",
        periodTo: "2026-08-31",
        issuedOn: "2026-09-01",
        externalRef: "FAC-777",
        externalInvoicedOn: "2026-09-02",
        dueOn: "2026-09-16",
        lineKind: "os",
        orderFolio: "A-01-000001",
        centerName: "Centro A",
        deliveredOn: "2026-08-10",
        vehicleLabel: "Nissan NP300 · FLT0001",
        purchaseOrder: "OC-1",
        lineAmount: 200,
        documentAmount: 3000,
        documentPaid: 1900.5,
        documentBalance: 1099.5,
      },
    ]);
    const [header, line] = csv.split("\n");
    expect(header?.split(",")[0]).toBe("documento");
    expect(header?.split(",")).toHaveLength(24);
    expect(line).toContain('"Flotillas, SA","Flotillas ""del Valle"""');
    expect(line?.endsWith("200.00,3000.00,1900.50,1099.50")).toBe(true);
  });

  it("errores", () => {
    expect(receivablesErrorMessage({ kind: "unavailable", message: "" })).toContain("requiere conexión");
    expect(receivablesErrorMessage({ kind: "permission_denied", message: "" })).toBe(
      "Sin permiso para esta acción.",
    );
    expect(receivablesErrorMessage({ kind: "validation", message: "Periodo inválido" })).toBe(
      "Periodo inválido",
    );
  });
});

describe("cartera", () => {
  it("aging: documentos abiertos por su saldo y OS sin agrupar por su total; sin anulados", () => {
    const inputs = agingInputs(
      [
        { accountId: "a", accountName: "Alfa", balance: 1000, ageDays: 70, status: "vencido" },
        { accountId: "a", accountName: "Alfa", balance: 0, ageDays: 3, status: "anulado" },
      ],
      [{ accountId: "a", accountName: "Alfa", total: 400, ageDays: 0 }],
    );
    expect(inputs.map((i) => [i.kind, i.amount])).toEqual([
      ["documento", 1000],
      ["sin_agrupar", 400],
    ]);
    expect(receivablesAging(inputs).totals).toEqual([400, 0, 1000, 0]);
  });

  it("totales en centavos", () => {
    expect(
      receivablesTotals([account, { ...account, balance: 0.1, unbilledOrders: 0.2, vencido: 0 }]),
    ).toEqual({
      balance: 1500.1,
      unbilled: 400.2,
      documents: 2200,
      overdue: 1000,
      unapplied: 0,
    });
  });
});
