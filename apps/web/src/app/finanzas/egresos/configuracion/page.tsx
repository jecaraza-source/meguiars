import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  expensesCopy,
  formatMoney,
  PNL_GROUP_LABELS,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CategoryForm, ThresholdForm, VendorForm } from "@/components/expense-forms";
import { Badge, Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Umbral de aprobación del centro, proveedores y categorías del P&L. */
export default async function ExpenseSettingsPage() {
  const state = await requireScreen("expenseSettings");
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const repo = createExpenseRepository((await createSupabaseServerClient())!);
  const [threshold, vendors, categories] = await Promise.all([
    repo.threshold(center.id),
    repo.vendors(center.organizationId),
    repo.categories(center.organizationId),
  ]);
  const canApprove = canInActiveCenter(state, "expenses.approve");
  const canWrite = canInActiveCenter(state, "expenses.write");
  const canManage = can(access.corporateRoles, "expenses.manage");
  const t = threshold.ok ? threshold.data : null;

  return (
    <AppShell
      state={state}
      screen="expenseSettings"
      title={expensesCopy.settingsTitle}
      description={center.name}
    >
      <Link href="/finanzas/egresos" className="text-sm underline">
        ← {expensesCopy.title}
      </Link>
      <Card
        title={expensesCopy.threshold}
        subtitle={t === null ? expensesCopy.noApproval : expensesCopy.approvalHint(formatMoney(t))}
      >
        {canApprove ? (
          <ThresholdForm threshold={t} />
        ) : (
          <p className="text-sm text-muted">{expensesCopy.readOnly}</p>
        )}
      </Card>

      <Card title={expensesCopy.vendors}>
        {!vendors.ok ? (
          <p role="alert" className="text-sm">
            {vendors.error.message}
          </p>
        ) : (
          <ul className="flex flex-col gap-md" data-testid="vendors">
            {vendors.data.map((v) => (
              <li key={v.id} className="flex flex-col gap-sm border-b border-border pb-md">
                <span className="flex flex-wrap items-center gap-xs text-sm">
                  <strong>{v.name}</strong>
                  {v.rfc ? ` · ${v.rfc}` : ""}
                  {!v.active ? <Badge label="Inactivo" tone="neutral" /> : null}
                </span>
                {canWrite ? (
                  <details>
                    <summary className="cursor-pointer text-sm underline">Editar</summary>
                    <div className="mt-sm">
                      <VendorForm vendor={v} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="mt-md">
            <h3 className="mb-sm font-medium">{expensesCopy.newVendor}</h3>
            <VendorForm />
          </div>
        ) : null}
      </Card>

      <Card title={expensesCopy.categories} subtitle={expensesCopy.categoryHint}>
        {!categories.ok ? (
          <p role="alert" className="text-sm">
            {categories.error.message}
          </p>
        ) : (
          <ul className="flex flex-col gap-md" data-testid="categories">
            {categories.data.map((c) => (
              <li key={c.id} className="flex flex-col gap-sm border-b border-border pb-md">
                <span className="flex flex-wrap items-center gap-xs text-sm">
                  <strong>{c.name}</strong> · {PNL_GROUP_LABELS[c.pnlGroup]}
                  {!c.active ? <Badge label="Inactiva" tone="neutral" /> : null}
                </span>
                {canManage ? (
                  <details>
                    <summary className="cursor-pointer text-sm underline">Editar</summary>
                    <div className="mt-sm">
                      <CategoryForm category={c} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="mt-md">
            <h3 className="mb-sm font-medium">{expensesCopy.newCategory}</h3>
            <CategoryForm />
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}
