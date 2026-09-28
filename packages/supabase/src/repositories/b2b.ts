import {
  agreementState,
  fail,
  type AgreementStatus,
  type B2bAccount,
  type B2bAccountListItem,
  type B2bAccountStatus,
  type B2bAgreement,
  type B2bRepository,
  type BillingModel,
  type PriceRuleKind,
  type Result,
  type VehicleRule,
} from "@meguiars/domain";
import {
  applyB2bAccountSchema,
  b2bAccountSchema,
  b2bAgreementSchema,
  b2bContactSchema,
  b2bPriceRuleSchema,
  b2bVehicleSchema,
  createB2bOrderSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

const num = (v: number | string | null) => (v === null ? null : Number(v));

const toAccount = (r: Tables<"b2b_accounts">): B2bAccount => ({
  id: r.id,
  organizationId: r.organization_id,
  homeDetailCenterId: r.home_detail_center_id,
  clientId: r.client_id,
  name: r.name,
  legalName: r.legal_name,
  rfc: r.rfc,
  taxRegime: r.tax_regime,
  fiscalZip: r.fiscal_zip,
  billingEmail: r.billing_email,
  status: r.status as B2bAccountStatus,
  notes: r.notes,
  createdAt: r.created_at,
});

type AgreementRow = Tables<"b2b_agreements"> & {
  b2b_agreement_centers: { detail_center_id: string }[] | null;
};

const toAgreement = (r: AgreementRow): B2bAgreement => ({
  id: r.id,
  accountId: r.account_id,
  name: r.name,
  billingModel: r.billing_model as BillingModel,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  status: r.status as AgreementStatus,
  vehicleRule: r.vehicle_rule as VehicleRule,
  paymentTermsDays: r.payment_terms_days,
  creditLimit: num(r.credit_limit),
  feeAmount: num(r.fee_amount),
  includedUnits: r.included_units,
  notes: r.notes,
  centerIds: (r.b2b_agreement_centers ?? []).map((c) => c.detail_center_id).sort(),
});

async function done(call: PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call;
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

/** Convenio a mostrar: el vigente o, si no hay, el más reciente. */
function currentAgreement(list: AgreementRow[], today: string): AgreementRow | undefined {
  const byEnd = [...list].sort((a, b) => b.ends_on.localeCompare(a.ends_on));
  return (
    byEnd.find(
      (g) => agreementState(g.status as AgreementStatus, g.starts_on, g.ends_on, today) === "vigente",
    ) ?? byEnd[0]
  );
}

const AGREEMENT_SELECT = "*, b2b_agreement_centers(detail_center_id)";

/**
 * Adaptador Supabase del puerto `B2bRepository`. Lecturas bajo RLS (el operador
 * ve cuentas y convenios de sus centros habilitados, nunca tarifas ni
 * facturación); escrituras por RPC con motivo; la tarifa la aplica la base.
 */
export function createB2bRepository(client: MeguiarsSupabaseClient): B2bRepository {
  return {
    async listAccounts(today, filter = {}) {
      let q = client.from("b2b_accounts").select("*").order("name").limit(300);
      if (filter.status) q = q.eq("status", filter.status);
      const text = filter.query?.trim().replace(/[%,()]/g, " ");
      if (text) q = q.or(`name.ilike.%${text}%,rfc.ilike.%${text.toUpperCase()}%,legal_name.ilike.%${text}%`);
      const accounts = await run(
        () => q,
        (rows) => rows.map(toAccount),
      );
      if (!accounts.ok || accounts.data.length === 0) return accounts as Result<B2bAccountListItem[]>;
      const ids = accounts.data.map((a) => a.id);
      const [agreements, centers] = await Promise.all([
        run(
          () => client.from("b2b_agreements").select(AGREEMENT_SELECT).in("account_id", ids),
          (rows) => rows as unknown as AgreementRow[],
        ),
        run(
          () => client.from("detail_centers").select("id, name"),
          (rows) => new Map(rows.map((c) => [c.id, c.name])),
        ),
      ]);
      if (!agreements.ok) return agreements;
      return {
        ok: true,
        data: accounts.data.map((a) => {
          const g = currentAgreement(
            agreements.data.filter((x) => x.account_id === a.id),
            today,
          );
          return {
            ...a,
            homeCenterName: centers.ok ? (centers.data.get(a.homeDetailCenterId) ?? null) : null,
            agreementName: g?.name ?? null,
            agreementState: g
              ? agreementState(g.status as AgreementStatus, g.starts_on, g.ends_on, today)
              : null,
            agreementEndsOn: g?.ends_on ?? null,
          };
        }),
      };
    },

    async companiesWithoutAccount() {
      const [companies, accounts] = await Promise.all([
        run(
          () =>
            client
              .from("clients")
              .select("id, full_name")
              .eq("kind", "company")
              .eq("active", true)
              .order("full_name"),
          (rows) => rows,
        ),
        run(
          () => client.from("b2b_accounts").select("client_id"),
          (rows) => new Set(rows.map((r) => r.client_id)),
        ),
      ]);
      if (!companies.ok) return companies;
      const taken = accounts.ok ? accounts.data : new Set<string>();
      return {
        ok: true,
        data: companies.data.filter((c) => !taken.has(c.id)).map((c) => ({ id: c.id, name: c.full_name })),
      };
    },

    async getAccount(id) {
      const account = await run(
        () => client.from("b2b_accounts").select("*").eq("id", id).maybeSingle(),
        toAccount,
      );
      if (!account.ok)
        return account.error.kind === "not_found"
          ? fail("not_found", "La cuenta no existe o no tienes acceso.")
          : account;
      const a = account.data;
      const [contacts, agreements, fleet, authorized] = await Promise.all([
        run(
          () =>
            client
              .from("b2b_contacts")
              .select("*")
              .eq("account_id", id)
              .order("is_primary", { ascending: false })
              .order("full_name"),
          (rows) => rows,
        ),
        run(
          () =>
            client
              .from("b2b_agreements")
              .select(AGREEMENT_SELECT)
              .eq("account_id", id)
              .order("starts_on", { ascending: false }),
          (rows) => (rows as unknown as AgreementRow[]).map(toAgreement),
        ),
        run(
          () =>
            client
              .from("vehicles")
              .select("id, make, model, year, plate, active")
              .eq("client_id", a.clientId)
              .order("plate"),
          (rows) => rows,
        ),
        run(
          () => client.from("b2b_vehicles").select("*").eq("account_id", id),
          (rows) => rows,
        ),
      ]);
      if (!contacts.ok) return contacts;
      if (!agreements.ok) return agreements;
      const auth = authorized.ok ? authorized.data : [];
      return {
        ok: true,
        data: {
          account: a,
          contacts: contacts.data.map((c) => ({
            id: c.id,
            fullName: c.full_name,
            title: c.title,
            phone: c.phone,
            email: c.email,
            isPrimary: c.is_primary,
            active: c.active,
          })),
          agreements: agreements.data,
          vehicles: (fleet.ok ? fleet.data : [])
            .filter((v) => v.active)
            .map((v) => {
              const bv = auth.find((x) => x.vehicle_id === v.id);
              return {
                vehicleId: v.id,
                label: `${v.make} ${v.model} ${v.year} · ${v.plate}`,
                plate: v.plate,
                authorized: bv?.active ?? false,
                costCenter: bv?.cost_center ?? null,
                driverName: bv?.driver_name ?? null,
              };
            }),
        },
      };
    },

    upsertAccount(command) {
      const parsed = b2bAccountSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_b2b_account", {
            p_id: c.id ?? null,
            p_request_id: c.requestId,
            p_home_detail_center_id: c.homeDetailCenterId,
            p_client_id: c.clientId,
            p_name: c.name,
            p_legal_name: c.legalName ?? null,
            p_rfc: c.rfc ?? null,
            p_tax_regime: c.taxRegime ?? null,
            p_fiscal_zip: c.fiscalZip ?? null,
            p_billing_email: c.billingEmail ?? null,
            p_status: c.status,
            p_notes: c.notes ?? null,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    async upsertContact(command) {
      const parsed = b2bContactSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("upsert_b2b_contact", {
          p_account_id: c.accountId,
          p_id: c.id ?? null,
          p_full_name: c.fullName,
          p_title: c.title ?? null,
          p_phone: c.phone ?? null,
          p_email: c.email ?? null,
          p_is_primary: c.isPrimary,
          p_active: c.active,
          p_reason: c.reason,
        }),
      );
    },

    async getAgreement(id) {
      const agreement = await run(
        () => client.from("b2b_agreements").select(AGREEMENT_SELECT).eq("id", id).maybeSingle(),
        (row) => toAgreement(row as unknown as AgreementRow),
      );
      if (!agreement.ok)
        return agreement.error.kind === "not_found"
          ? fail("not_found", "El convenio no existe o no tienes acceso.")
          : agreement;
      const [account, rules] = await Promise.all([
        run(
          () => client.from("b2b_accounts").select("*").eq("id", agreement.data.accountId),
          (rows) => ({ name: rows[0]?.name ?? "—", home: rows[0]?.home_detail_center_id ?? null }),
        ),
        run(
          () =>
            client
              .from("b2b_price_rules")
              .select("*, services(name)")
              .eq("agreement_id", id)
              .order("created_at"),
          (rows) => rows,
        ),
      ]);
      return {
        ok: true,
        data: {
          agreement: agreement.data,
          accountName: account.ok ? account.data.name : "—",
          accountHomeCenterId: account.ok ? account.data.home : null,
          rules: (rules.ok ? rules.data : []).map((r) => ({
            id: r.id,
            agreementId: r.agreement_id,
            serviceId: r.service_id,
            serviceName: (r as unknown as { services: { name: string } | null }).services?.name ?? null,
            kind: r.kind as PriceRuleKind,
            value: num(r.value),
            minMonthlyOrders: r.min_monthly_orders,
            active: r.active,
            notes: r.notes,
          })),
        },
      };
    },

    upsertAgreement(command) {
      const parsed = b2bAgreementSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_b2b_agreement", {
            p_account_id: c.accountId,
            p_id: c.id ?? null,
            p_request_id: c.requestId,
            p_name: c.name,
            p_billing_model: c.billingModel,
            p_starts_on: c.startsOn,
            p_ends_on: c.endsOn,
            p_status: c.status,
            p_vehicle_rule: c.vehicleRule,
            p_payment_terms_days: c.paymentTermsDays,
            p_credit_limit: c.creditLimit ?? null,
            p_fee_amount: c.feeAmount ?? null,
            p_included_units: c.includedUnits ?? null,
            p_detail_center_ids: c.centerIds,
            p_notes: c.notes ?? null,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    async setPriceRule(command) {
      const parsed = b2bPriceRuleSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("set_b2b_price_rule", {
          p_agreement_id: c.agreementId,
          p_id: c.id ?? null,
          p_service_id: c.serviceId ?? null,
          p_kind: c.kind,
          p_value: c.value ?? null,
          p_min_monthly_orders: c.minMonthlyOrders,
          p_active: c.active,
          p_notes: c.notes ?? null,
          p_reason: c.reason,
        }),
      );
    },

    async setVehicle(command) {
      const parsed = b2bVehicleSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("set_b2b_vehicle", {
          p_account_id: c.accountId,
          p_vehicle_id: c.vehicleId,
          p_active: c.active,
          p_cost_center: c.costCenter ?? null,
          p_driver_name: c.driverName ?? null,
          p_notes: c.notes ?? null,
          p_reason: c.reason,
        }),
      );
    },

    accountsForCenter(detailCenterId) {
      return run(
        () => client.rpc("b2b_accounts_for_center", { p_detail_center_id: detailCenterId }),
        (rows) =>
          rows.map((r) => ({
            accountId: r.account_id,
            accountName: r.account_name,
            clientId: r.client_id,
            agreementId: r.agreement_id,
            agreementName: r.agreement_name,
            billingModel: r.billing_model as BillingModel,
            vehicleRule: r.vehicle_rule as VehicleRule,
            endsOn: r.ends_on,
            vehicles: (r.vehicles ?? []) as {
              id: string;
              make: string;
              model: string;
              year: number;
              plate: string;
              identifier: string | null;
            }[],
          })),
      );
    },

    createOrder(command) {
      const parsed = createB2bOrderSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_b2b_service_order", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_account_id: c.accountId,
            p_vehicle_id: c.vehicleId,
            p_items: c.items.map((i) => ({ service_id: i.serviceId, quantity: i.quantity })),
            p_purchase_order: c.purchaseOrder ?? null,
            p_observations: c.observations ?? null,
          }),
        (row) => ({ id: row.id }),
      );
    },

    async applyAccount(orderId, version, accountId, purchaseOrder) {
      const parsed = applyB2bAccountSchema.safeParse({ orderId, version, accountId, purchaseOrder });
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("apply_b2b_account", {
          p_order_id: c.orderId,
          p_version: c.version,
          p_account_id: c.accountId,
          p_purchase_order: c.purchaseOrder ?? null,
        }),
      );
    },

    async orderInfo(orderId) {
      const order = await run(
        () =>
          client.from("service_orders").select("b2b_account_id, b2b_agreement_id").eq("id", orderId).single(),
        (r) => r,
      );
      if (!order.ok) return order;
      const { b2b_account_id: accountId, b2b_agreement_id: agreementId } = order.data;
      if (!accountId) return { ok: true, data: null };
      const [account, agreement] = await Promise.all([
        run(
          () => client.from("b2b_accounts").select("*").eq("id", accountId),
          (rows) => rows[0]?.name ?? "—",
        ),
        agreementId
          ? run(
              () => client.from("b2b_agreements").select("*").eq("id", agreementId),
              (rows) => rows[0] ?? null,
            )
          : Promise.resolve(null),
      ]);
      return {
        ok: true,
        data: {
          accountId,
          accountName: account.ok ? account.data : "—",
          agreementId,
          agreementName: agreement?.ok ? (agreement.data?.name ?? null) : null,
          billingModel:
            agreement?.ok && agreement.data ? (agreement.data.billing_model as BillingModel) : null,
        },
      };
    },

    async statement(accountId) {
      const r = await run(
        () => client.rpc("b2b_account_statement", { p_account_id: accountId }),
        (rows) => rows[0],
      );
      if (!r.ok) return r;
      const s = r.data;
      if (!s) return fail("not_found", "La cuenta no existe o no tienes acceso.");
      return {
        ok: true,
        data: {
          consumption: Number(s.consumption),
          ordersToInvoice: Number(s.orders_to_invoice),
          feesAccrued: Number(s.fees_accrued),
          feesInvoiced: Number(s.fees_invoiced),
          toInvoice: Number(s.to_invoice),
          invoiced: Number(s.invoiced),
          paid: Number(s.paid),
          receivable: Number(s.receivable),
          overdue: Number(s.overdue),
          openOrders: Number(s.open_orders),
          exposure: Number(s.exposure),
          creditLimit: num(s.credit_limit),
          creditAvailable: num(s.credit_available),
        },
      };
    },

    accountOrders(accountId, from, to) {
      return run(
        () => client.rpc("b2b_account_orders", { p_account_id: accountId, p_from: from, p_to: to }),
        (rows) =>
          rows.map((o) => ({
            id: o.id,
            folio: o.folio,
            detailCenterId: o.detail_center_id,
            centerName: o.center_name,
            status: o.status,
            createdAt: o.created_at,
            finishedAt: o.finished_at,
            vehicleLabel: o.vehicle_label,
            purchaseOrder: o.purchase_order,
            agreementName: o.agreement_name,
            total: Number(o.total),
            costTotal: Number(o.cost_total),
            invoiceId: o.invoice_id,
            invoiceReference: o.invoice_reference,
            evidenceCount: o.evidence_count,
          })),
      );
    },

    profitabilityFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("b2b_profitability_facts", {
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows) =>
          rows.map((r) => ({
            accountId: r.account_id,
            accountName: r.account_name,
            detailCenterId: r.detail_center_id,
            orders: r.orders,
            revenue: Number(r.revenue),
            cost: Number(r.cost),
            feeRevenue: Number(r.fee_revenue),
          })),
      );
    },
  };
}
