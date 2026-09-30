import "server-only";
import {
  pilotErrorMessage,
  type AgendaRepository,
  type CatalogRepository,
  type ExpenseRepository,
  type MembershipRepository,
  type Result,
} from "@meguiars/domain";
import type { ImportEntity, ImportExisting, ImportOp, ImportPlan } from "@meguiars/validation";

export interface ImportRepos {
  catalog: CatalogRepository;
  agenda: AgendaRepository;
  expenses: ExpenseRepository;
  memberships: MembershipRepository;
}

/**
 * Lo que ya existe, leído con la sesión del usuario (RLS): el plan se arma
 * siempre en el servidor, al previsualizar y otra vez al aplicar.
 */
export async function loadImportExisting(
  repos: ImportRepos,
  entity: ImportEntity,
  organizationId: string,
  centerId: string,
): Promise<Result<ImportExisting>> {
  const needServices = entity === "servicios" || entity === "planes_membresia";
  const [services, bays, technicians, categories, plans] = await Promise.all([
    needServices ? repos.catalog.listForCenter(centerId, { includeInactive: true }) : null,
    entity === "bahias" ? repos.agenda.listBays(centerId) : null,
    entity === "tecnicos" ? repos.agenda.listTechnicians(centerId) : null,
    entity === "categorias_egreso" ? repos.expenses.categories(organizationId) : null,
    entity === "planes_membresia"
      ? repos.memberships.listPlans(organizationId, { includeInactive: true })
      : null,
  ]);
  for (const r of [services, bays, technicians, categories, plans]) if (r && !r.ok) return r;
  return {
    ok: true,
    data: {
      services:
        services?.ok === true
          ? services.data.map((s) => ({
              id: s.id,
              code: s.code,
              name: s.name,
              description: s.description,
              revenueEngine: s.revenueEngine,
              standardDurationMinutes: s.standardDurationMinutes,
              basePrice: s.basePrice,
              standardDirectCost: s.standardDirectCost,
              operatorCommissionPct: s.baseOperatorCommissionPct,
              active: s.active,
              centerPrice: s.price,
              centerDirectCost: s.directCost,
              priceSource: s.priceSource,
              available: s.available,
            }))
          : [],
      bays: bays?.ok === true ? bays.data.map((b) => ({ id: b.id, name: b.name, active: b.active })) : [],
      technicians:
        technicians?.ok === true
          ? technicians.data.map((t) => ({ id: t.id, name: t.fullName, active: t.active }))
          : [],
      categories: categories?.ok === true ? categories.data : [],
      plans:
        plans?.ok === true
          ? plans.data.map((p) => ({
              id: p.id,
              code: p.code,
              tier: p.tier,
              name: p.name,
              description: p.description,
              price: p.price,
              periodMonths: p.periodMonths,
              redeemScope: p.redeemScope,
              restrictions: p.restrictions,
              renewalNoticeDays: p.renewalNoticeDays,
              availableFrom: p.availableFrom,
              active: p.active,
              benefits: p.benefits.map((b) => ({
                serviceId: b.serviceId,
                quantityPerPeriod: b.quantityPerPeriod,
              })),
            }))
          : [],
    },
  };
}

/**
 * Aplica un plan ya validado, fila por fila y en orden, con las mismas RPC
 * de las pantallas (permiso, motivo y auditoría). Se detiene en el primer
 * error: lo aplicado antes queda (cada RPC es su propia transacción) y
 * reintentar el archivo sólo aplica lo que falta.
 */
export async function applyImportPlan(
  repos: ImportRepos,
  plan: ImportPlan,
  organizationId: string,
  reason: string,
) {
  const results: { line: number; key: string; ok: boolean; message: string }[] = [];
  const serviceIds = new Map<string, string>();
  const planIds = new Map<string, string>();
  const lookupService = async (code: string, centerId: string) => {
    if (serviceIds.has(code)) return serviceIds.get(code)!;
    const list = await repos.catalog.listForCenter(centerId, { includeInactive: true });
    const found = list.ok ? list.data.find((s) => s.code === code) : undefined;
    if (found) serviceIds.set(code, found.id);
    return found?.id ?? null;
  };
  const lookupPlan = async (code: string) => {
    if (planIds.has(code)) return planIds.get(code)!;
    const list = await repos.memberships.listPlans(organizationId, { includeInactive: true });
    const found = list.ok ? list.data.find((p) => p.code === code) : undefined;
    if (found) planIds.set(code, found.id);
    return found?.id ?? null;
  };
  const run = async (op: ImportOp): Promise<Result<unknown>> => {
    switch (op.kind) {
      case "service.create": {
        const r = await repos.catalog.create(op.command);
        if (r.ok) serviceIds.set(r.data.code, r.data.id);
        return r;
      }
      case "service.update":
        return repos.catalog.update(op.command);
      case "service.center": {
        const serviceId = await lookupService(op.serviceCode, op.command.detailCenterId);
        if (!serviceId)
          return {
            ok: false,
            error: { kind: "not_found", message: `No encontré el servicio ${op.serviceCode}` },
          };
        return repos.catalog.configureCenter({ ...op.command, serviceId });
      }
      case "bay.upsert":
        return repos.agenda.upsertBay(op.command);
      case "technician.upsert":
        return repos.agenda.upsertTechnician(op.command);
      case "category.upsert":
        return repos.expenses.upsertCategory(op.command);
      case "plan.upsert": {
        const r = await repos.memberships.upsertPlan(op.command);
        if (r.ok) planIds.set(r.data.code, r.data.id);
        return r;
      }
      case "plan.benefit": {
        const planId = await lookupPlan(op.planCode);
        if (!planId)
          return { ok: false, error: { kind: "not_found", message: `No encontré el plan ${op.planCode}` } };
        return repos.memberships.setBenefit({
          planId,
          serviceId: op.serviceId,
          quantityPerPeriod: op.quantityPerPeriod,
          reason,
        });
      }
    }
  };
  for (const row of plan.rows) {
    if (row.ops.length === 0) continue;
    let failure: string | null = null;
    for (const op of row.ops) {
      const r = await run(op);
      if (!r.ok) {
        failure = pilotErrorMessage(r.error);
        break;
      }
    }
    results.push({
      line: row.line,
      key: row.key,
      ok: failure === null,
      message: failure ?? (row.action === "crear" ? "Creado" : "Actualizado"),
    });
    if (failure) break;
  }
  return {
    results,
    applied: results.filter((r) => r.ok).length,
    failed: results.find((r) => !r.ok) ?? null,
  };
}
