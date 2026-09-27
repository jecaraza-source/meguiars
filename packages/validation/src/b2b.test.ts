import { describe, expect, it } from "vitest";
import {
  b2bAccountSchema,
  b2bAgreementSchema,
  b2bContactSchema,
  b2bInvoiceSchema,
  b2bPriceRuleSchema,
} from "./b2b";

const U = "00000000-0000-4000-8000-000000000001";

describe("validación B2B", () => {
  it("cuenta: RFC en mayúsculas, datos fiscales opcionales", () => {
    const ok = b2bAccountSchema.parse({
      requestId: U,
      homeDetailCenterId: U,
      clientId: U,
      name: "  Flotillas   SA ",
      rfc: "fva010101ab1",
      taxRegime: "",
      fiscalZip: "06600",
      billingEmail: "Facturas@Flotillas.MX",
      status: "activa",
      reason: "Alta",
    });
    expect(ok).toMatchObject({
      name: "Flotillas SA",
      rfc: "FVA010101AB1",
      taxRegime: undefined,
      billingEmail: "facturas@flotillas.mx",
    });
    expect(b2bAccountSchema.safeParse({ ...ok, requestId: U, rfc: "XX" }).success).toBe(false);
  });

  it("contacto: teléfono o email", () => {
    const base = { accountId: U, fullName: "Laura", isPrimary: true, active: true, reason: "Contacto" };
    expect(b2bContactSchema.safeParse(base).success).toBe(false);
    expect(b2bContactSchema.parse({ ...base, phone: "5512345678" }).phone).toBe("+525512345678");
  });

  it("convenio: vigencia, cuota e incluidos en paquete / iguala, centros", () => {
    const base = {
      accountId: U,
      requestId: U,
      name: "Iguala",
      billingModel: "iguala",
      startsOn: "2026-10-01",
      endsOn: "2027-09-30",
      status: "activo",
      vehicleRule: "lista",
      paymentTermsDays: "30",
      centerIds: [U],
      reason: "Alta",
    };
    const missing = b2bAgreementSchema.safeParse(base);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map((i) => i.path[0])).toEqual(["feeAmount", "includedUnits"]);
    expect(b2bAgreementSchema.parse({ ...base, feeAmount: "1,000", includedUnits: "4" })).toMatchObject({
      feeAmount: 1000,
      includedUnits: 4,
      paymentTermsDays: 30,
    });
    expect(
      b2bAgreementSchema.safeParse({ ...base, billingModel: "por_vehiculo", endsOn: "2026-01-01" }).success,
    ).toBe(false);
    expect(
      b2bAgreementSchema.safeParse({ ...base, billingModel: "por_vehiculo", centerIds: [] }).success,
    ).toBe(false);
  });

  it("tarifa: precio o % obligatorio salvo incluido; descuento hasta 100 %", () => {
    const base = { agreementId: U, active: true, minMonthlyOrders: "", reason: "Tarifa" };
    expect(b2bPriceRuleSchema.safeParse({ ...base, kind: "precio_fijo" }).success).toBe(false);
    expect(b2bPriceRuleSchema.safeParse({ ...base, kind: "descuento_pct", value: "120" }).success).toBe(
      false,
    );
    expect(b2bPriceRuleSchema.parse({ ...base, kind: "incluido", value: "5" })).toMatchObject({
      value: undefined,
      minMonthlyOrders: 0,
    });
  });

  it("corte: OS o cuota", () => {
    const base = {
      accountId: U,
      requestId: U,
      reference: "A-1",
      issuedOn: "2026-10-01",
      orderIds: [],
      feeAmount: "",
    };
    expect(b2bInvoiceSchema.safeParse(base).success).toBe(false);
    expect(b2bInvoiceSchema.parse({ ...base, feeAmount: "1000" }).feeAmount).toBe(1000);
  });
});
