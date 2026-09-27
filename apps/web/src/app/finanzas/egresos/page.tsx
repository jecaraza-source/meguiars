import {
  activeCenterAccess,
  addDays,
  can,
  canInActiveCenter,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUSES,
  expenseErrorMessage,
  expensesCopy,
  formatMoney,
  PNL_GROUP_LABELS,
  PNL_GROUPS,
  presentExpenseRow,
  todayIn,
  usableCenters,
  type ExpenseStatus,
  type PnlGroup,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Egresos con filtros por centro, fecha, categoría, proveedor, estado y grupo del P&L. */
export default async function ExpensesPage({ searchParams }: PageProps<"/finanzas/egresos">) {
  const state = await requireScreen("expenses");
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const params = await searchParams;
  const all = one(params.alcance) === "todos";
  const today = todayIn(center.timezone);
  const from = isDay(one(params.desde)) ? one(params.desde) : addDays(today, -29);
  const to = isDay(one(params.hasta)) ? one(params.hasta) : today;
  const categoryId = one(params.categoria);
  const vendorId = one(params.proveedor);
  const status = (EXPENSE_STATUSES as readonly string[]).includes(one(params.estado))
    ? (one(params.estado) as ExpenseStatus)
    : undefined;
  const pnlGroup = (PNL_GROUPS as readonly string[]).includes(one(params.grupo))
    ? (one(params.grupo) as PnlGroup)
    : undefined;
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "expenses.read"))
        .map((a) => a.center.id)
    : [center.id];
  const repo = createExpenseRepository((await createSupabaseServerClient())!);
  const [list, categories, vendors] = await Promise.all([
    repo.list({
      detailCenterIds: centers,
      from,
      to,
      categoryId: categoryId || undefined,
      vendorId: vendorId || undefined,
      status,
      pnlGroup,
    }),
    repo.categories(center.organizationId),
    repo.vendors(center.organizationId),
  ]);
  const rows = list.ok ? list.data : [];
  const valid = rows.filter((r) => r.status === "aprobado");
  const names = new Map(usableCenters(state.access).map((a) => [a.center.id, a.center.code]));

  return (
    <AppShell
      state={state}
      screen="expenses"
      title={expensesCopy.title}
      description={expensesCopy.description}
    >
      <div className="flex flex-wrap gap-sm">
        {canInActiveCenter(state, "expenses.write") ? (
          <ButtonLink href="/finanzas/egresos/nuevo" label={expensesCopy.newExpense} variant="primary" />
        ) : null}
        <ButtonLink href="/finanzas/egresos/configuracion" label={expensesCopy.settingsTitle} />
      </div>
      <Card title={expensesCopy.filters}>
        <form className="grid gap-md md:grid-cols-4" method="get" data-testid="expense-filters">
          <label className="mg-field">
            <span className="mg-label">{expensesCopy.from}</span>
            <input className="mg-input" type="date" name="desde" defaultValue={from} />
          </label>
          <label className="mg-field">
            <span className="mg-label">{expensesCopy.to}</span>
            <input className="mg-input" type="date" name="hasta" defaultValue={to} />
          </label>
          <label className="mg-field">
            <span className="mg-label">{expensesCopy.category}</span>
            <select className="mg-input" name="categoria" defaultValue={categoryId}>
              <option value="">{expensesCopy.allCategories}</option>
              {(categories.ok ? categories.data : []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mg-field">
            <span className="mg-label">{expensesCopy.vendor}</span>
            <select className="mg-input" name="proveedor" defaultValue={vendorId}>
              <option value="">{expensesCopy.allVendors}</option>
              {(vendors.ok ? vendors.data : []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mg-field">
            <span className="mg-label">{expensesCopy.status}</span>
            <select className="mg-input" name="estado" defaultValue={status ?? ""}>
              <option value="">{expensesCopy.allStatuses}</option>
              {EXPENSE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EXPENSE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="mg-field">
            <span className="mg-label">{expensesCopy.group}</span>
            <select className="mg-input" name="grupo" defaultValue={pnlGroup ?? ""}>
              <option value="">—</option>
              {PNL_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {PNL_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          {all ? <input type="hidden" name="alcance" value="todos" /> : null}
          <div className="flex items-end gap-md">
            <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
              {expensesCopy.apply}
            </button>
            <Link
              href={all ? "/finanzas/egresos" : "/finanzas/egresos?alcance=todos"}
              className="text-sm underline"
            >
              {all ? expensesCopy.scopeCenter : expensesCopy.scopeAll}
            </Link>
          </div>
        </form>
      </Card>
      <Card
        title={`${expensesCopy.title} · ${all ? expensesCopy.scopeAll : center.name}`}
        subtitle={`${expensesCopy.total} aprobado: ${formatMoney(valid.reduce((a, r) => a + r.amount, 0))} · ${rows.length} registros`}
      >
        {!list.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {expenseErrorMessage(list.error)}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState title={expensesCopy.empty} />
        ) : (
          <Table
            caption={expensesCopy.title}
            rows={rows.map((r) => ({ ...presentExpenseRow(r), center: names.get(r.detailCenterId) ?? "" }))}
            rowKey={(r) => r.id}
            rowHref={(r) => `/finanzas/egresos/${r.id}`}
            emptyMessage={expensesCopy.empty}
            columns={[
              { key: "folio", header: "Folio", value: (r) => r.folio },
              { key: "date", header: expensesCopy.paidOn, value: (r) => r.date },
              { key: "concept", header: expensesCopy.concept, value: (r) => r.concept },
              { key: "category", header: expensesCopy.category, value: (r) => `${r.category} · ${r.group}` },
              { key: "vendor", header: "Proveedor", value: (r) => r.vendor },
              { key: "amount", header: "Monto", value: (r) => r.amount, align: "end" },
              { key: "status", header: expensesCopy.status, value: (r) => r.status },
              { key: "receipts", header: expensesCopy.receipts, value: (r) => r.receipts, align: "end" },
            ]}
          />
        )}
      </Card>
    </AppShell>
  );
}
