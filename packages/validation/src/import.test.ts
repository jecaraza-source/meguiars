import { describe, expect, it } from "vitest";
import { buildImportPlan, importTemplate, parseCsv, IMPORT_ENTITIES, type ImportExisting } from "./import";

const ctx = {
  organizationId: "0e000000-0000-4000-8000-000000000001",
  detailCenterId: "11111111-1111-4111-8111-111111111111",
  reason: "Importación de datos maestros",
};
const SERVICE_ID = "5e000000-0000-4000-8000-000000000001";

const existing: ImportExisting = {
  services: [
    {
      id: SERVICE_ID,
      code: "LAV-EXP",
      name: "Lavado exprés",
      description: null,
      revenueEngine: "recurrente",
      standardDurationMinutes: 30,
      basePrice: 250,
      standardDirectCost: 45,
      operatorCommissionPct: null,
      active: true,
      centerPrice: 250,
      centerDirectCost: 45,
      priceSource: "base",
      available: true,
    },
  ],
  bays: [{ id: "b1000000-0000-4000-8000-000000000001", name: "Bahía 1", active: true }],
  technicians: [],
  categories: [
    {
      id: "ca000000-0000-4000-8000-000000000001",
      code: "renta",
      name: "Renta",
      pnlGroup: "operativo",
      description: null,
      position: 10,
      active: true,
    },
  ],
  plans: [],
};

describe("CSV", () => {
  it("lee Excel en español: punto y coma, comillas, BOM, CRLF, acentos en encabezados y filas vacías", () => {
    const csv =
      '﻿Código;Nombre;Descripción\r\nLAV-EXP;"Lavado ""exprés""";"línea 1\nlínea 2"\r\n;;\r\nENC;Encerado;\r\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["codigo", "nombre", "descripcion"]);
    expect(rows).toEqual([
      { line: 2, values: { codigo: "LAV-EXP", nombre: 'Lavado "exprés"', descripcion: "línea 1\nlínea 2" } },
      { line: 5, values: { codigo: "ENC", nombre: "Encerado", descripcion: "" } },
    ]);
  });

  it("la plantilla de cada tipo se vuelve a leer con sus columnas y su ejemplo es válido", () => {
    for (const entity of IMPORT_ENTITIES) {
      const plan = buildImportPlan(entity, importTemplate(entity), ctx, existing);
      expect(plan.headerErrors, entity).toEqual([]);
      expect(plan.summary.error, `${entity}: ${JSON.stringify(plan.rows[0]?.errors)}`).toBe(0);
    }
  });
});

describe("plan de importación", () => {
  it("servicios: crea, actualiza sólo lo que cambia, deja igual lo idéntico y marca errores por columna", () => {
    const csv = [
      "codigo,nombre,motor,duracion_min,precio,costo_directo,activo,precio_centro",
      "lav-exp,Lavado exprés,recurrente,30,250,45,si,",
      'ENC,Encerado,valor_medio,60,"$1,200",180,,1100',
      "POL,Pulido,premium,90,1500,,si,",
      "LAV-EXP,Otra vez,recurrente,30,1,1,si,",
    ].join("\n");
    const plan = buildImportPlan("servicios", csv, ctx, existing);
    expect(plan.rows.map((r) => [r.line, r.key, r.action])).toEqual([
      [2, "LAV-EXP", "sin_cambios"],
      [3, "ENC", "crear"],
      [4, "POL", "error"],
      [5, "LAV-EXP", "error"],
    ]);
    expect(plan.rows[1]!.ops.map((o) => o.kind)).toEqual(["service.create", "service.center"]);
    expect(plan.rows[2]!.errors[0]).toMatch(/^costo_directo: /);
    expect(plan.rows[3]!.errors[0]).toMatch(/Repetido: ya aparece en la línea 2/);
    expect(plan.canApply).toBe(false);

    const update = buildImportPlan(
      "servicios",
      "codigo,nombre,motor,duracion_min,precio,costo_directo\nLAV-EXP,Lavado exprés,recurrente,30,280,45",
      ctx,
      existing,
    );
    expect(update.rows[0]).toMatchObject({ action: "actualizar", changes: ["precio: 250 → 280"] });
    expect(update.canApply).toBe(true);
  });

  it("encabezados: faltantes, desconocidos, vacío y límite de filas", () => {
    expect(buildImportPlan("bahias", "", ctx, existing).headerErrors).toEqual(["El archivo está vacío."]);
    expect(buildImportPlan("bahias", "nombres,activa\nX,si", ctx, existing).headerErrors).toEqual([
      "Faltan columnas obligatorias: nombre.",
      "Columnas desconocidas (revisa la plantilla): nombres.",
    ]);
    expect(buildImportPlan("bahias", "nombre\n", ctx, existing).headerErrors).toEqual([
      "El archivo no tiene filas de datos.",
    ]);
    const many = `nombre\n${Array.from({ length: 501 }, (_, i) => `B${i}`).join("\n")}`;
    expect(buildImportPlan("bahias", many, ctx, existing).headerErrors[0]).toMatch(/Máximo 500 filas/);
  });

  it("bahías y técnicos: por nombre sin importar mayúsculas; sí/no validados", () => {
    const plan = buildImportPlan(
      "bahias",
      "nombre,activa\nbahía 1,no\nBahía 2,\nBahía 3,quizá",
      ctx,
      existing,
    );
    expect(plan.rows.map((r) => r.action)).toEqual(["actualizar", "crear", "error"]);
    expect(plan.rows[0]!.ops[0]).toMatchObject({
      kind: "bay.upsert",
      command: { id: "b1000000-0000-4000-8000-000000000001", active: false },
    });
    expect(plan.rows[2]!.errors).toEqual(["activa: usa si o no"]);
    expect(buildImportPlan("tecnicos", "nombre\nAna López", ctx, existing).rows[0]).toMatchObject({
      action: "crear",
    });
  });

  it("categorías: grupo del P&L validado y orden por defecto", () => {
    const plan = buildImportPlan(
      "categorias_egreso",
      "codigo,nombre,grupo_pnl\nRENTA,Renta,operativo\nluz,Luz,servicios_raros",
      ctx,
      existing,
    );
    expect(plan.rows[0]).toMatchObject({ action: "sin_cambios" });
    expect(plan.rows[1]!.errors[0]).toMatch(/^grupo_pnl: /);
  });

  it("planes: beneficios con claves del catálogo; reaplicar no cambia nada", () => {
    const csv =
      "codigo,nivel,nombre,precio,meses,beneficios\nPLUS-12,plus,Plus anual,4800,12,LAV-EXP:2\nBAD,plus,Malo,100,5,NOPE:1";
    const plan = buildImportPlan("planes_membresia", csv, ctx, existing);
    expect(plan.rows[0]!.ops.map((o) => o.kind)).toEqual(["plan.upsert", "plan.benefit"]);
    expect(plan.rows[1]!.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^meses: /),
        "beneficios: el servicio NOPE no existe (impórtalo primero)",
      ]),
    );

    const after: ImportExisting = {
      ...existing,
      plans: [
        {
          id: "9a000000-0000-4000-8000-000000000001",
          code: "PLUS-12",
          tier: "plus",
          name: "Plus anual",
          description: null,
          price: 4800,
          periodMonths: 12,
          redeemScope: "centro_origen",
          restrictions: null,
          renewalNoticeDays: 7,
          availableFrom: "2026-09-30",
          active: true,
          benefits: [{ serviceId: SERVICE_ID, quantityPerPeriod: 2 }],
        },
      ],
    };
    const again = buildImportPlan("planes_membresia", csv.split("\n").slice(0, 2).join("\n"), ctx, after);
    expect(again.rows[0]).toMatchObject({ action: "sin_cambios", ops: [] });
    expect(again.canApply).toBe(false);
  });
});
