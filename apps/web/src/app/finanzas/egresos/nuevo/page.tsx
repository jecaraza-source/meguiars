import { activeCenterAccess, canInActiveCenter, expensesCopy, newRequestId, todayIn } from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ExpenseForm } from "@/components/expense-forms";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewExpensePage() {
  const state = await requireScreen("expenseNew");
  const center = activeCenterAccess(state)!.center;
  const repo = createExpenseRepository((await createSupabaseServerClient())!);
  const [categories, vendors, threshold] = await Promise.all([
    repo.categories(center.organizationId),
    repo.vendors(center.organizationId),
    repo.threshold(center.id),
  ]);
  return (
    <AppShell state={state} screen="expenseNew" title={expensesCopy.newExpense} description={center.name}>
      <Link href="/finanzas/egresos" className="text-sm underline">
        ← {expensesCopy.title}
      </Link>
      {!categories.ok ? (
        <EmptyState title={expensesCopy.forbidden} message={categories.error.message} />
      ) : (
        <Card>
          <ExpenseForm
            categories={categories.data}
            vendors={vendors.ok ? vendors.data : []}
            threshold={threshold.ok ? threshold.data : null}
            isApprover={canInActiveCenter(state, "expenses.approve")}
            today={todayIn(center.timezone)}
            requestId={newRequestId()}
            fileId={newRequestId()}
          />
        </Card>
      )}
    </AppShell>
  );
}
