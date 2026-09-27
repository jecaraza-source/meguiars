import { describe, expect, it } from "vitest";
import { can } from "../roles";
import { boardColumns, presentOpportunityCard, presentOpportunityEvent } from "./presenter";
import {
  canWriteOpportunity,
  DEFAULT_PIPELINE_STAGES,
  nextActionState,
  proposalEndsOn,
  proposalNeedsFee,
  weightedValue,
  writableOpportunityKinds,
  type Opportunity,
  type PipelineStage,
} from "./pipeline";

const opportunity = (o: Partial<Opportunity>): Opportunity => ({
  id: "o1",
  organizationId: "org",
  detailCenterId: "A",
  centerName: "Centro A",
  kind: "b2b",
  title: "Flotilla",
  displayName: "Logística Sur",
  clientId: null,
  b2bAccountId: null,
  prospect: {
    companyName: "Logística Sur",
    legalName: null,
    rfc: null,
    contactName: "Carla",
    contactTitle: null,
    contactPhone: "+525522223333",
    contactEmail: null,
  },
  estimatedValue: 100_000,
  stageId: "s2",
  stageName: "Contactado",
  stagePosition: 2,
  stageProbability: 25,
  status: "abierta",
  ownerId: null,
  ownerName: null,
  nextAction: "Enviar propuesta",
  nextActionOn: "2026-10-01",
  expectedCloseOn: null,
  source: null,
  proposal: {
    billingModel: null,
    months: null,
    vehicleRule: null,
    paymentTermsDays: null,
    creditLimit: null,
    feeAmount: null,
    includedUnits: null,
  },
  notes: null,
  closedAt: null,
  wonValue: null,
  lossReason: null,
  lossNotes: null,
  convertedAccountId: null,
  convertedAgreementId: null,
  openTasks: 0,
  version: 1,
  createdAt: "2026-09-20T15:00:00Z",
  today: "2026-10-01",
  ...o,
});

const stage = (s: Partial<PipelineStage>): PipelineStage => ({
  id: "s1",
  organizationId: "org",
  code: "prospecto",
  name: "Prospecto",
  kind: "abierta",
  position: 1,
  probability: 10,
  active: true,
  ...s,
});

describe("pipeline comercial", () => {
  it("etapas mínimas: 4 abiertas y una de ganado y perdido al final", () => {
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.code)).toEqual([
      "prospecto",
      "contactado",
      "propuesta",
      "negociacion",
      "ganado",
      "perdido",
    ]);
    expect(DEFAULT_PIPELINE_STAGES.filter((s) => s.kind === "ganada")).toHaveLength(1);
    expect(DEFAULT_PIPELINE_STAGES.filter((s) => s.kind === "perdida")).toHaveLength(1);
  });

  it("permisos por rol: B2B sólo admin y comercial; B2C premium también el encargado", () => {
    expect(canWriteOpportunity(["comercial_b2b"], "b2b")).toBe(true);
    expect(canWriteOpportunity(["admin_socio"], "b2b")).toBe(true);
    expect(canWriteOpportunity(["encargado"], "b2b")).toBe(false);
    expect(canWriteOpportunity(["encargado"], "b2c_premium")).toBe(true);
    expect(canWriteOpportunity(["operador_recepcion"], "b2c_premium")).toBe(false);
    expect(canWriteOpportunity(["contador"], "b2c_premium")).toBe(false);
    expect(writableOpportunityKinds(["encargado"])).toEqual(["b2c_premium"]);
    expect(can(["contador"], "pipeline.metrics.read")).toBe(true);
    expect(can(["contador"], "pipeline.read")).toBe(false);
    expect(can(["operador_recepcion"], "pipeline.read")).toBe(false);
  });

  it("siguiente acción: vencida, hoy, programada, sin fecha o sin acción; nada si está cerrada", () => {
    const today = "2026-10-01";
    const o = (nextAction: string | null, nextActionOn: string | null) =>
      nextActionState({ status: "abierta", nextAction, nextActionOn }, today);
    expect(o("Llamar", "2026-09-30")).toBe("vencida");
    expect(o("Llamar", today)).toBe("hoy");
    expect(o("Llamar", "2026-10-05")).toBe("proxima");
    expect(o("Llamar", null)).toBe("sin_fecha");
    expect(o(null, null)).toBe("sin_accion");
    expect(nextActionState({ status: "ganada", nextAction: null, nextActionOn: null }, today)).toBeNull();
  });

  it("propuesta: cuota en paquete e iguala; el convenio termina un día antes del mismo día N meses después", () => {
    expect(proposalNeedsFee("iguala")).toBe(true);
    expect(proposalNeedsFee("por_vehiculo")).toBe(false);
    expect(proposalEndsOn("2026-10-01", 12)).toBe("2027-09-30");
    expect(proposalEndsOn("2026-01-31", 1)).toBe("2026-02-27");
    expect(proposalEndsOn("2026-10-15", null)).toBe("2027-10-14");
    expect(weightedValue(100_000, 25)).toBe(25_000);
  });

  it("tablero: columnas por etapa abierta con totales; una etapa inactiva se muestra si aún tiene oportunidades", () => {
    const stages = [
      stage({}),
      stage({ id: "s2", code: "contactado", name: "Contactado", position: 2, probability: 25 }),
      stage({ id: "s3", code: "vieja", name: "Vieja", position: 3, active: false }),
      stage({ id: "s4", code: "demo", name: "Demo", position: 4, active: false }),
      stage({ id: "sg", code: "ganado", name: "Ganado", kind: "ganada", position: 90, probability: 100 }),
    ];
    const cols = boardColumns(stages, [
      opportunity({}),
      opportunity({ id: "o2", estimatedValue: 50_000 }),
      opportunity({ id: "o3", stageId: "s3" }),
      opportunity({ id: "o4", status: "ganada", stageId: "sg" }),
    ]);
    expect(cols.map((c) => [c.name, c.count])).toEqual([
      ["Prospecto", 0],
      ["Contactado", 2],
      ["Vieja", 1],
    ]);
    expect(cols[1]?.weighted).toBe(presentOpportunityCard(opportunity({ estimatedValue: 150_000 })).weighted);
  });

  it("presenta la tarjeta y el historial", () => {
    const card = presentOpportunityCard(opportunity({ nextActionOn: "2026-09-28" }));
    expect(card.nextActionState).toBe("vencida");
    expect(card.owner).toBe("Sin asignar");
    expect(card.ageDays).toBe(11);
    expect(
      presentOpportunityEvent({
        id: "e",
        seq: 1,
        kind: "etapa",
        occurredAt: "2026-10-01T15:00:00Z",
        actorName: "Ana",
        fromStageName: "Prospecto",
        toStageName: "Contactado",
        value: 1,
        ownerName: null,
        note: null,
      }).detail,
    ).toBe("Prospecto → Contactado");
  });
});
