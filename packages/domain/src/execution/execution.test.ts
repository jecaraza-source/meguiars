import { describe, expect, it } from "vitest";
import {
  canAddEvidence,
  canRecordConsumption,
  canTransitionItemWork,
  consumptionVariance,
  evidencePath,
  lineWorkedMinutes,
  targetImageSize,
  type ExecutionLine,
} from "./execution";
import { consumptionRows, lineWorkActions, presentLine } from "./presenter";

const line = (patch: Partial<ExecutionLine> = {}): ExecutionLine => ({
  id: "l1",
  serviceId: "s1",
  serviceCode: "LAV",
  serviceName: "Lavado",
  quantity: 2,
  workStatus: "pendiente",
  startedAt: null,
  finishedAt: null,
  workStartedAt: null,
  workedMinutes: 0,
  technicianId: null,
  standards: [{ inventoryItemId: "i1", code: "SHP-01", name: "Shampoo", unit: "ml", quantity: 50 }],
  ...patch,
});

describe("ejecución por línea", () => {
  it("transiciones: pendiente → en proceso ⇄ pausada → terminada", () => {
    expect(canTransitionItemWork("pendiente", "en_proceso")).toBe(true);
    expect(canTransitionItemWork("pausada", "en_proceso")).toBe(true);
    expect(canTransitionItemWork("pausada", "terminada")).toBe(true);
    expect(canTransitionItemWork("pendiente", "terminada")).toBe(false);
    expect(canTransitionItemWork("terminada", "en_proceso")).toBe(false);
  });

  it("acciones sólo con la OS en proceso, con etiqueta según el estatus", () => {
    expect(lineWorkActions(line(), "autorizada")).toEqual([]);
    expect(lineWorkActions(line(), "en_proceso").map((a) => a.label)).toEqual(["Iniciar"]);
    expect(lineWorkActions(line({ workStatus: "pausada" }), "en_proceso").map((a) => a.label)).toEqual([
      "Reanudar",
      "Terminar",
    ]);
  });

  it("tiempo real: acumulado más tramo en curso, nunca negativo", () => {
    const now = new Date("2026-10-01T17:00:00Z");
    expect(lineWorkedMinutes({ workedMinutes: 20, workStartedAt: "2026-10-01T16:45:00Z" }, now)).toBe(35);
    // Reloj del dispositivo atrasado respecto al servidor: el tramo cuenta 0.
    expect(lineWorkedMinutes({ workedMinutes: 20, workStartedAt: "2026-10-01T17:10:00Z" }, now)).toBe(20);
    expect(lineWorkedMinutes({ workedMinutes: -3, workStartedAt: null }, now)).toBe(0);
    expect(presentLine(line({ workedMinutes: 90 }), () => "Toño").worked).toBe("1 h 30 min");
  });

  it("evidencia y consumo según el estatus de la OS", () => {
    expect(canAddEvidence("abierta")).toBe(true);
    expect(canAddEvidence("entregada")).toBe(false);
    expect(canAddEvidence("cancelada")).toBe(false);
    expect(canRecordConsumption("autorizada")).toBe(false);
    expect(canRecordConsumption("terminada")).toBe(true);
  });
});

describe("fotos", () => {
  it("redimensiona el lado mayor a 1600 px conservando la proporción y nunca amplía", () => {
    expect(targetImageSize(4032, 3024)).toEqual({ width: 1600, height: 1200, resized: true });
    expect(targetImageSize(3024, 4032)).toEqual({ width: 1200, height: 1600, resized: true });
    expect(targetImageSize(800, 600)).toEqual({ width: 800, height: 600, resized: false });
  });

  it("ruta privada por organización, centro y OS (la usan las políticas de Storage)", () => {
    expect(
      evidencePath({ organizationId: "org", detailCenterId: "center", id: "os" }, "file", "image/jpeg"),
    ).toBe("org/center/os/file.jpg");
  });
});

describe("consumos", () => {
  it("variación con una sola definición: real − estándar, % y costo", () => {
    expect(consumptionVariance({ standardQuantity: 100, actualQuantity: 120, unitCost: 0.05 })).toEqual({
      quantity: 20,
      percent: 20,
      cost: 1,
      actualCost: 6,
    });
    expect(consumptionVariance({ standardQuantity: 0, actualQuantity: 5, unitCost: 1 }).percent).toBe(0);
  });

  it("filas por insumo configurado: estándar esperado antes de registrar, variación después", () => {
    const [pending] = consumptionRows([line()], []);
    expect(pending).toMatchObject({ standard: "100 ml", actual: "—", variance: "—" });
    const [recorded] = consumptionRows(
      [line()],
      [
        {
          id: "c1",
          itemId: "l1",
          inventoryItemId: "i1",
          inventoryName: "Shampoo",
          unit: "ml",
          standardQuantity: 100,
          actualQuantity: 120,
          unitCost: 0.05,
          note: null,
        },
      ],
    );
    expect(recorded).toMatchObject({ actual: "120 ml", over: true });
    expect(recorded?.variance).toMatch(/^\+20 ml \(\+20%\)/);
    expect(consumptionRows([line({ standards: [] })], [])).toEqual([]);
  });
});
