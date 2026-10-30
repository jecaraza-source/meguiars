import { b2bCopy, b2bErrorMessage, b2bQrUrl, canInCenter } from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RegenerateQrForm } from "@/components/b2b-forms";
import { PrintButton } from "@/components/payment-forms";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { qrSvg } from "@/lib/qr";
import { siteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Calcomanías con el QR de cada vehículo de la flotilla, listas para imprimir (ADR 0050). */
export default async function B2bQrPage({ params }: PageProps<"/comercial/b2b/[id]/qr">) {
  const state = await requireScreen("b2bAccountDetail");
  const { id } = await params;
  const repo = createB2bRepository((await createSupabaseServerClient())!);
  const [detail, codes] = await Promise.all([repo.getAccount(id), repo.vehicleQrCodes(id)]);
  const base = await siteUrl();
  if (!detail.ok || !codes.ok) {
    const error = !detail.ok ? detail.error : !codes.ok ? codes.error : null;
    return (
      <AppShell state={state} screen="b2bAccountDetail" title={b2bCopy.qrTitle}>
        <EmptyState title={error ? b2bErrorMessage(error) : b2bCopy.qrNotFound} />
      </AppShell>
    );
  }
  const account = detail.data.account;
  const canWrite = canInCenter(state, account.homeDetailCenterId, "b2b.write");
  const stickers = await Promise.all(
    codes.data
      .filter((c) => c.active)
      .map(async (c) => ({ ...c, svg: await qrSvg(b2bQrUrl(base, c.token)) })),
  );
  return (
    <AppShell state={state} screen="b2bAccountDetail" title={`${b2bCopy.qrTitle} · ${account.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-sm print:hidden">
        <Link href={`/comercial/b2b/${account.id}`} className="text-sm underline">
          ← {account.name}
        </Link>
        <PrintButton />
      </div>
      <p className="text-sm text-muted print:hidden">{b2bCopy.qrHelp}</p>
      {stickers.length === 0 ? <EmptyState title={b2bCopy.vehiclesEmpty} /> : null}
      <div
        className="grid gap-md sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3"
        data-testid="b2b-qr-stickers"
      >
        {stickers.map((s) => (
          <Card key={s.vehicleId} title={s.plate ?? s.vehicleLabel} subtitle={account.name}>
            <div
              className="mx-auto w-full max-w-(--mg-layout-narrow)"
              aria-label={`QR de ${s.plate ?? s.vehicleLabel}`}
              role="img"
              dangerouslySetInnerHTML={{ __html: s.svg }}
            />
            <p className="text-center text-sm">{s.vehicleLabel}</p>
            {s.driverName || s.costCenter ? (
              <p className="text-center text-xs text-muted">
                {[s.driverName, s.costCenter].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {canWrite ? (
              <div className="print:hidden">
                <RegenerateQrForm accountId={account.id} vehicleId={s.vehicleId} />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
