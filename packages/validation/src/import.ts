import {
  PNL_GROUPS,
  PLAN_TIERS,
  REDEEM_SCOPES,
  REVENUE_ENGINES,
  type CenterConfigCommand,
  type CreateServiceCommand,
  type UpdateServiceCommand,
  type UpsertPlanCommand,
  type UpsertResourceCommand,
  type CategoryInput,
} from "@meguiars/domain";
import type { z } from "zod";
import { createServiceSchema, centerConfigSchema } from "./catalog";
import { upsertResourceSchema } from "./agenda";
import { expenseCategorySchema } from "./expenses";
import { membershipPlanSchema } from "./memberships";

/**
 * Importador de datos maestros (F5.2). Un CSV por tipo de dato; se valida con
 * los MISMOS esquemas que los formularios, se compara contra lo que ya existe
 * (vista previa: crear / actualizar / sin cambios / error) y sólo si no hay
 * errores se aplica con las RPC de siempre (permiso, motivo y auditoría). Nunca
 * inserta directo en tablas. Reaplicar el mismo archivo no cambia nada.
 */

export const IMPORT_ENTITIES = [
  "servicios",
  "bahias",
  "tecnicos",
  "categorias_egreso",
  "planes_membresia",
] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

interface ColumnSpec {
  key: string;
  required: boolean;
  help: string;
}

export const IMPORT_SPECS: Record<
  ImportEntity,
  { label: string; scope: "organización" | "centro"; columns: ColumnSpec[]; example: Record<string, string> }
> = {
  servicios: {
    label: "Catálogo de servicios (precios y costos)",
    scope: "organización",
    columns: [
      { key: "codigo", required: true, help: "Clave única, p. ej. LAV-EXP" },
      { key: "nombre", required: true, help: "Nombre visible" },
      { key: "motor", required: true, help: REVENUE_ENGINES.join(" | ") },
      { key: "duracion_min", required: true, help: "Minutos estándar (5 a 1440)" },
      { key: "precio", required: true, help: "Precio base en MXN" },
      { key: "costo_directo", required: true, help: "Productos y consumibles por servicio" },
      { key: "comision_operador_pct", required: false, help: "% del precio al operador; vacío = no paga" },
      { key: "descripcion", required: false, help: "" },
      { key: "activo", required: false, help: "si | no (por defecto si)" },
      { key: "precio_centro", required: false, help: "Precio propio del centro activo" },
      { key: "costo_centro", required: false, help: "Costo propio del centro activo" },
    ],
    example: {
      codigo: "LAV-EXP",
      nombre: "Lavado exprés",
      motor: "recurrente",
      duracion_min: "30",
      precio: "250",
      costo_directo: "45",
      comision_operador_pct: "",
      descripcion: "Exterior e interior básico",
      activo: "si",
      precio_centro: "",
      costo_centro: "",
    },
  },
  bahias: {
    label: "Bahías del centro activo",
    scope: "centro",
    columns: [
      { key: "nombre", required: true, help: "Nombre único en el centro" },
      { key: "activa", required: false, help: "si | no (por defecto si)" },
    ],
    example: { nombre: "Bahía 1", activa: "si" },
  },
  tecnicos: {
    label: "Técnicos del centro activo",
    scope: "centro",
    columns: [
      { key: "nombre", required: true, help: "Nombre completo, único en el centro" },
      { key: "activo", required: false, help: "si | no (por defecto si)" },
    ],
    example: { nombre: "Juan Pérez", activo: "si" },
  },
  categorias_egreso: {
    label: "Categorías de egreso",
    scope: "organización",
    columns: [
      { key: "codigo", required: true, help: "minúsculas, números o _ (p. ej. renta)" },
      { key: "nombre", required: true, help: "" },
      { key: "grupo_pnl", required: true, help: PNL_GROUPS.join(" | ") },
      { key: "descripcion", required: false, help: "" },
      { key: "orden", required: false, help: "1 a 999 (por defecto 100)" },
      { key: "activa", required: false, help: "si | no (por defecto si)" },
    ],
    example: {
      codigo: "renta",
      nombre: "Renta del local",
      grupo_pnl: "operativo",
      descripcion: "",
      orden: "10",
      activa: "si",
    },
  },
  planes_membresia: {
    label: "Planes de membresía y beneficios",
    scope: "organización",
    columns: [
      { key: "codigo", required: true, help: "Clave única, p. ej. PLUS-12" },
      { key: "nivel", required: true, help: PLAN_TIERS.join(" | ") },
      { key: "nombre", required: true, help: "" },
      { key: "precio", required: true, help: "Precio del periodo en MXN" },
      { key: "meses", required: true, help: "1 | 3 | 6 | 12" },
      { key: "alcance", required: false, help: `${REDEEM_SCOPES.join(" | ")} (por defecto centro_origen)` },
      { key: "beneficios", required: false, help: "CLAVE:unidades separados por ; (p. ej. LAV-EXP:2;ENC:1)" },
      { key: "aviso_renovacion_dias", required: false, help: "0 a 60 (por defecto 7)" },
      { key: "disponible_desde", required: false, help: "AAAA-MM-DD" },
      { key: "descripcion", required: false, help: "" },
      { key: "restricciones", required: false, help: "" },
      { key: "activo", required: false, help: "si | no (por defecto si)" },
    ],
    example: {
      codigo: "PLUS-12",
      nivel: "plus",
      nombre: "Plus anual",
      precio: "4800",
      meses: "12",
      alcance: "cualquier_centro",
      beneficios: "LAV-EXP:2",
      aviso_renovacion_dias: "15",
      disponible_desde: "",
      descripcion: "",
      restricciones: "",
      activo: "si",
    },
  },
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");

/**
 * CSV de Excel o Google Sheets: separador coma o punto y coma (se detecta en
 * el encabezado), comillas dobles, saltos CRLF y BOM. Ignora filas vacías.
 */
export function parseCsv(text: string): {
  headers: string[];
  rows: { line: number; values: Record<string, string> }[];
} {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      cells.push(cell);
      records.push({ line: start, cells });
      cells = [];
      cell = "";
      line++;
      start = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length) {
    cells.push(cell);
    records.push({ line: start, cells });
  }
  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ""));
  const [head, ...body] = nonEmpty;
  const headers = (head?.cells ?? []).map(normalizeHeader);
  return {
    headers,
    rows: body.map((r) => ({
      line: r.line,
      values: Object.fromEntries(headers.map((h, i) => [h, (r.cells[i] ?? "").trim()])),
    })),
  };
}

/** Plantilla descargable: encabezados y una fila de ejemplo. */
export function importTemplate(entity: ImportEntity): string {
  const spec = IMPORT_SPECS[entity];
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${spec.columns.map((c) => c.key).join(",")}\n${spec.columns.map((c) => esc(spec.example[c.key] ?? "")).join(",")}\n`;
}

// ---------------------------------------------------------------------------
// Plan de importación
// ---------------------------------------------------------------------------

/** Lo que ya existe (lo carga el servidor con la sesión del usuario). */
export interface ImportExisting {
  services: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    revenueEngine: string;
    standardDurationMinutes: number;
    basePrice: number;
    standardDirectCost: number;
    operatorCommissionPct: number | null;
    active: boolean;
    /** Valores vigentes en el centro activo. */
    centerPrice: number;
    centerDirectCost: number;
    priceSource: "base" | "center";
    available: boolean;
  }[];
  bays: { id: string; name: string; active: boolean }[];
  technicians: { id: string; name: string; active: boolean }[];
  categories: {
    id: string;
    code: string;
    name: string;
    pnlGroup: string;
    description: string | null;
    position: number;
    active: boolean;
  }[];
  plans: {
    id: string;
    code: string;
    tier: string;
    name: string;
    description: string | null;
    price: number;
    periodMonths: number;
    redeemScope: string;
    restrictions: string | null;
    renewalNoticeDays: number;
    availableFrom: string;
    active: boolean;
    benefits: { serviceId: string; quantityPerPeriod: number }[];
  }[];
}

export type ImportOp =
  | { kind: "service.create"; command: CreateServiceCommand }
  | { kind: "service.update"; command: UpdateServiceCommand }
  /** `serviceCode` se resuelve al aplicar (el servicio puede crearse en la misma importación). */
  | { kind: "service.center"; serviceCode: string; command: Omit<CenterConfigCommand, "serviceId"> }
  | { kind: "bay.upsert"; command: UpsertResourceCommand }
  | { kind: "technician.upsert"; command: UpsertResourceCommand }
  | { kind: "category.upsert"; command: CategoryInput }
  | { kind: "plan.upsert"; command: UpsertPlanCommand }
  | { kind: "plan.benefit"; planCode: string; serviceId: string; quantityPerPeriod: number | undefined };

export type ImportAction = "crear" | "actualizar" | "sin_cambios" | "error";

export interface ImportPlanRow {
  line: number;
  key: string;
  action: ImportAction;
  changes: string[];
  errors: string[];
  ops: ImportOp[];
}

export interface ImportPlan {
  entity: ImportEntity;
  headerErrors: string[];
  rows: ImportPlanRow[];
  summary: Record<ImportAction, number>;
  /** Se puede aplicar: sin errores de encabezado ni de filas y con algo que hacer. */
  canApply: boolean;
}

const MAX_ROWS = 500;

const bool = (v: string | undefined, fallback = true) => {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "") return fallback;
  if (["si", "sí", "s", "true", "1", "x", "activo", "activa"].includes(s)) return true;
  if (["no", "n", "false", "0", "inactivo", "inactiva"].includes(s)) return false;
  return null;
};

const issues = (e: z.ZodError, labels: Record<string, string>) =>
  e.issues.map((i) => `${labels[String(i.path[0])] ?? String(i.path[0] ?? "fila")}: ${i.message}`);

const same = (a: unknown, b: unknown) =>
  typeof a === "number" || typeof b === "number"
    ? Number(a ?? 0) === Number(b ?? 0)
    : (a ?? null) === (b ?? null);

function diff(pairs: [string, unknown, unknown][]): string[] {
  return pairs
    .filter(([, before, after]) => !same(before, after))
    .map(([label, before, after]) => `${label}: ${fmt(before)} → ${fmt(after)}`);
}
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function buildImportPlan(
  entity: ImportEntity,
  csvText: string,
  ctx: { organizationId: string; detailCenterId: string; reason: string },
  existing: ImportExisting,
): ImportPlan {
  const spec = IMPORT_SPECS[entity];
  const { headers, rows } = parseCsv(csvText);
  const headerErrors: string[] = [];
  const missing = spec.columns.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key);
  if (headers.length === 0) headerErrors.push("El archivo está vacío.");
  else if (missing.length) headerErrors.push(`Faltan columnas obligatorias: ${missing.join(", ")}.`);
  const unknown = headers.filter((h) => h && !spec.columns.some((c) => c.key === h));
  if (unknown.length)
    headerErrors.push(`Columnas desconocidas (revisa la plantilla): ${unknown.join(", ")}.`);
  if (rows.length === 0 && headers.length) headerErrors.push("El archivo no tiene filas de datos.");
  if (rows.length > MAX_ROWS)
    headerErrors.push(`Máximo ${MAX_ROWS} filas por archivo (tiene ${rows.length}).`);

  const seen = new Map<string, number>();
  const planRows = headerErrors.length
    ? []
    : rows.map(({ line, values: v }): ImportPlanRow => {
        const row = planRow(entity, v, ctx, existing);
        const dup = seen.get(row.key.toLowerCase());
        if (row.key && dup !== undefined)
          return {
            ...row,
            line,
            action: "error",
            errors: [`Repetido: ya aparece en la línea ${dup}`],
            ops: [],
          };
        if (row.key) seen.set(row.key.toLowerCase(), line);
        return { ...row, line };
      });
  const summary = { crear: 0, actualizar: 0, sin_cambios: 0, error: 0 } as Record<ImportAction, number>;
  for (const r of planRows) summary[r.action]++;
  return {
    entity,
    headerErrors,
    rows: planRows,
    summary,
    canApply: headerErrors.length === 0 && summary.error === 0 && summary.crear + summary.actualizar > 0,
  };
}

type RowResult = Omit<ImportPlanRow, "line">;
const err = (key: string, errors: string[]): RowResult => ({
  key,
  action: "error",
  changes: [],
  errors,
  ops: [],
});

function planRow(
  entity: ImportEntity,
  v: Record<string, string>,
  ctx: { organizationId: string; detailCenterId: string; reason: string },
  ex: ImportExisting,
): RowResult {
  switch (entity) {
    case "servicios":
      return serviceRow(v, ctx, ex);
    case "bahias":
    case "tecnicos":
      return resourceRow(entity, v, ctx, ex);
    case "categorias_egreso":
      return categoryRow(v, ctx, ex);
    case "planes_membresia":
      return planRowFor(v, ctx, ex);
  }
}

function serviceRow(
  v: Record<string, string>,
  ctx: { organizationId: string; detailCenterId: string; reason: string },
  ex: ImportExisting,
): RowResult {
  const key = (v.codigo ?? "").trim().toUpperCase();
  const active = bool(v.activo);
  const parsed = createServiceSchema.safeParse({
    organizationId: ctx.organizationId,
    code: v.codigo ?? "",
    name: v.nombre ?? "",
    description: v.descripcion ?? "",
    revenueEngine: (v.motor ?? "").trim().toLowerCase(),
    standardDurationMinutes: v.duracion_min ?? "",
    basePrice: v.precio ?? "",
    standardDirectCost: v.costo_directo ?? "",
    operatorCommissionPct: v.comision_operador_pct ?? "",
  });
  const labels = {
    code: "codigo",
    name: "nombre",
    description: "descripcion",
    revenueEngine: "motor",
    standardDurationMinutes: "duracion_min",
    basePrice: "precio",
    standardDirectCost: "costo_directo",
    operatorCommissionPct: "comision_operador_pct",
  };
  const errors = parsed.success ? [] : issues(parsed.error, labels);
  if (active === null) errors.push("activo: usa si o no");
  const center = centerConfigSchema.safeParse({
    detailCenterId: ctx.detailCenterId,
    serviceId: "00000000-0000-4000-8000-000000000000",
    available: true,
    priceOverride: v.precio_centro ?? "",
    directCostOverride: v.costo_centro ?? "",
    reason: ctx.reason,
  });
  if (!center.success)
    errors.push(
      ...issues(center.error, { priceOverride: "precio_centro", directCostOverride: "costo_centro" }),
    );
  if (!parsed.success || !center.success || active === null) return err(key, errors);

  const s = parsed.data;
  const current = ex.services.find((x) => x.code === s.code);
  const ops: ImportOp[] = [];
  let changes: string[] = [];
  const wantsCenter = center.data.priceOverride !== undefined || center.data.directCostOverride !== undefined;
  if (!current) {
    ops.push({ kind: "service.create", command: s });
    changes = [`precio ${s.basePrice}`, `costo ${s.standardDirectCost}`];
  } else {
    changes = diff([
      ["nombre", current.name, s.name],
      ["descripcion", current.description ?? undefined, s.description],
      ["motor", current.revenueEngine, s.revenueEngine],
      ["duracion_min", current.standardDurationMinutes, s.standardDurationMinutes],
      ["precio", current.basePrice, s.basePrice],
      ["costo_directo", current.standardDirectCost, s.standardDirectCost],
      ["comision_operador_pct", current.operatorCommissionPct, s.operatorCommissionPct],
      ["activo", current.active, active],
    ]);
    if (changes.length)
      ops.push({
        kind: "service.update",
        command: {
          id: current.id,
          name: s.name,
          description: s.description,
          revenueEngine: s.revenueEngine,
          standardDurationMinutes: s.standardDurationMinutes,
          basePrice: s.basePrice,
          standardDirectCost: s.standardDirectCost,
          operatorCommissionPct: s.operatorCommissionPct,
          active,
          reason: ctx.reason,
        },
      });
  }
  if (wantsCenter) {
    const price = center.data.priceOverride;
    const cost = center.data.directCostOverride;
    const centerChanges =
      current && current.priceSource === "center"
        ? diff([
            ["precio_centro", current.centerPrice, price ?? current.basePrice],
            ["costo_centro", current.centerDirectCost, cost ?? current.standardDirectCost],
          ])
        : [`precio_centro ${fmt(price)}`, `costo_centro ${fmt(cost)}`];
    if (centerChanges.length) {
      changes.push(...centerChanges);
      ops.push({
        kind: "service.center",
        serviceCode: s.code,
        command: {
          detailCenterId: ctx.detailCenterId,
          available: true,
          priceOverride: price,
          directCostOverride: cost,
          reason: ctx.reason,
        },
      });
    }
  }
  if (!current && active === false)
    errors.push("activo: un servicio nuevo se da de alta activo; desactívalo después");
  if (errors.length) return err(s.code, errors);
  return {
    key: s.code,
    action: !current ? "crear" : ops.length ? "actualizar" : "sin_cambios",
    changes,
    errors: [],
    ops,
  };
}

function resourceRow(
  entity: "bahias" | "tecnicos",
  v: Record<string, string>,
  ctx: { detailCenterId: string; reason: string },
  ex: ImportExisting,
): RowResult {
  const name = (v.nombre ?? "").trim().replace(/\s+/g, " ");
  const active = bool(entity === "bahias" ? v.activa : v.activo);
  const list = entity === "bahias" ? ex.bays : ex.technicians;
  const current = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const parsed = upsertResourceSchema.safeParse({
    detailCenterId: ctx.detailCenterId,
    id: current?.id ?? "",
    name,
    active: active ?? true,
    reason: ctx.reason,
  });
  const errors = parsed.success ? [] : issues(parsed.error, { name: "nombre" });
  if (active === null) errors.push(`${entity === "bahias" ? "activa" : "activo"}: usa si o no`);
  if (!parsed.success || errors.length) return err(name, errors);
  const kind = entity === "bahias" ? "bay.upsert" : "technician.upsert";
  if (!current)
    return { key: name, action: "crear", changes: [], errors: [], ops: [{ kind, command: parsed.data }] };
  const changes = diff([
    ["nombre", current.name, parsed.data.name],
    ["activo", current.active, parsed.data.active],
  ]);
  return {
    key: name,
    action: changes.length ? "actualizar" : "sin_cambios",
    changes,
    errors: [],
    ops: changes.length ? [{ kind, command: parsed.data }] : [],
  };
}

function categoryRow(
  v: Record<string, string>,
  ctx: { organizationId: string; reason: string },
  ex: ImportExisting,
): RowResult {
  const code = (v.codigo ?? "").trim().toLowerCase();
  const active = bool(v.activa);
  const current = ex.categories.find((c) => c.code === code);
  const parsed = expenseCategorySchema.safeParse({
    organizationId: ctx.organizationId,
    categoryId: current?.id ?? "",
    code,
    name: v.nombre ?? "",
    pnlGroup: (v.grupo_pnl ?? "").trim().toLowerCase(),
    description: v.descripcion ?? "",
    position: (v.orden ?? "").trim() || String(current?.position ?? 100),
    active: active ?? true,
    reason: ctx.reason,
  });
  const errors = parsed.success
    ? []
    : issues(parsed.error, {
        code: "codigo",
        name: "nombre",
        pnlGroup: "grupo_pnl",
        description: "descripcion",
        position: "orden",
      });
  if (active === null) errors.push("activa: usa si o no");
  if (!parsed.success || errors.length) return err(code, errors);
  const c = parsed.data;
  if (!current)
    return {
      key: code,
      action: "crear",
      changes: [],
      errors: [],
      ops: [{ kind: "category.upsert", command: c }],
    };
  const changes = diff([
    ["nombre", current.name, c.name],
    ["grupo_pnl", current.pnlGroup, c.pnlGroup],
    ["descripcion", current.description ?? undefined, c.description],
    ["orden", current.position, c.position],
    ["activa", current.active, c.active],
  ]);
  return {
    key: code,
    action: changes.length ? "actualizar" : "sin_cambios",
    changes,
    errors: [],
    ops: changes.length ? [{ kind: "category.upsert", command: c }] : [],
  };
}

function planRowFor(
  v: Record<string, string>,
  ctx: { organizationId: string; reason: string },
  ex: ImportExisting,
): RowResult {
  const key = (v.codigo ?? "").trim().toUpperCase();
  const active = bool(v.activo);
  const current = ex.plans.find((p) => p.code === key);
  const parsed = membershipPlanSchema.safeParse({
    organizationId: ctx.organizationId,
    id: current?.id ?? "",
    code: v.codigo ?? "",
    tier: (v.nivel ?? "").trim().toLowerCase(),
    name: v.nombre ?? "",
    description: v.descripcion ?? "",
    price: v.precio ?? "",
    periodMonths: v.meses ?? "",
    redeemScope: (v.alcance ?? "").trim().toLowerCase() || current?.redeemScope || "centro_origen",
    restrictions: v.restricciones ?? "",
    renewalNoticeDays: (v.aviso_renovacion_dias ?? "").trim() || String(current?.renewalNoticeDays ?? 7),
    availableFrom: v.disponible_desde ?? "",
    availableUntil: "",
    active: active ?? true,
    reason: ctx.reason,
  });
  const errors = parsed.success
    ? []
    : issues(parsed.error, {
        code: "codigo",
        tier: "nivel",
        name: "nombre",
        price: "precio",
        periodMonths: "meses",
        redeemScope: "alcance",
        renewalNoticeDays: "aviso_renovacion_dias",
        availableFrom: "disponible_desde",
      });
  if (active === null) errors.push("activo: usa si o no");

  // Beneficios: CLAVE:unidades; la clave debe existir en el catálogo.
  const wanted = new Map<string, number>();
  for (const part of (v.beneficios ?? "")
    .split(/[;|]/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [codeRaw, qtyRaw] = part.split(":").map((x) => x.trim());
    const service = ex.services.find((s) => s.code === (codeRaw ?? "").toUpperCase());
    const qty = Number(qtyRaw);
    if (!service) errors.push(`beneficios: el servicio ${codeRaw} no existe (impórtalo primero)`);
    else if (!Number.isInteger(qty) || qty < 1 || qty > 99)
      errors.push(`beneficios: unidades inválidas en ${part} (1 a 99)`);
    else wanted.set(service.id, qty);
  }
  if (!parsed.success || errors.length) return err(key, errors);
  const p = parsed.data;
  const ops: ImportOp[] = [];
  let changes: string[] = [];
  if (!current) ops.push({ kind: "plan.upsert", command: p });
  else {
    changes = diff([
      ["nivel", current.tier, p.tier],
      ["nombre", current.name, p.name],
      ["descripcion", current.description ?? undefined, p.description],
      ["precio", current.price, p.price],
      ["meses", current.periodMonths, p.periodMonths],
      ["alcance", current.redeemScope, p.redeemScope],
      ["restricciones", current.restrictions ?? undefined, p.restrictions],
      ["aviso_renovacion_dias", current.renewalNoticeDays, p.renewalNoticeDays],
      ["activo", current.active, p.active],
      ...(p.availableFrom
        ? ([["disponible_desde", current.availableFrom, p.availableFrom]] as [string, unknown, unknown][])
        : []),
    ]);
    if (changes.length) ops.push({ kind: "plan.upsert", command: p });
  }
  if ((v.beneficios ?? "").trim() !== "") {
    const before = new Map((current?.benefits ?? []).map((b) => [b.serviceId, b.quantityPerPeriod]));
    const code = (id: string) => ex.services.find((s) => s.id === id)?.code ?? id;
    for (const [serviceId, qty] of wanted)
      if (before.get(serviceId) !== qty) {
        ops.push({ kind: "plan.benefit", planCode: p.code, serviceId, quantityPerPeriod: qty });
        changes.push(`beneficio ${code(serviceId)}: ${fmt(before.get(serviceId))} → ${qty}`);
      }
    for (const [serviceId] of before)
      if (!wanted.has(serviceId)) {
        ops.push({ kind: "plan.benefit", planCode: p.code, serviceId, quantityPerPeriod: undefined });
        changes.push(`beneficio ${code(serviceId)}: se quita`);
      }
  }
  return {
    key: p.code,
    action: !current ? "crear" : ops.length ? "actualizar" : "sin_cambios",
    changes,
    errors: [],
    ops,
  };
}
