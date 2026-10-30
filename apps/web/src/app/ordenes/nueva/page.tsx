import {
  activeCenterAccess,
  agendaCopy,
  b2bCopy,
  clientErrorMessage,
  newRequestId,
  ordersCopy,
  parseB2bQrToken,
  presentSearchResult,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createB2bRepository,
  createCatalogRepository,
  createClientRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewB2bOrderForm } from "@/components/b2b-forms";
import { NewOrderForm } from "@/components/order-forms";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** OS walk-in (sin cita): elegir cliente y después vehículo, canal y líneas. */
export default async function NewOrderPage({ searchParams }: PageProps<"/ordenes/nueva">) {
  const state = await requireScreen("orderNew");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const clientId = param("cliente");
  const b2bMode = param("modo") === "b2b";
  const q = param("q");
  const supabase = (await createSupabaseServerClient())!;

  if (b2bMode) {
    const b2b = createB2bRepository(supabase);
    const [accounts, catalog] = await Promise.all([
      b2b.accountsForCenter(center.id),
      createCatalogRepository(supabase).listForCenter(center.id),
    ]);
    // QR del vehículo (ADR 0050): por la cámara (/q/b2b/<token>) o un lector que escribe el código.
    const qrText = param("qr");
    const qrToken = qrText ? parseB2bQrToken(qrText) : null;
    const qr = qrToken ? await b2b.vehicleByQr(center.id, qrToken) : null;
    const qrVehicle = qr?.ok && qr.data?.usable ? qr.data : null;
    const qrMessage = !qrText
      ? null
      : !qrToken
        ? b2bCopy.qrInvalid
        : qr && !qr.ok
          ? qr.error.message
          : !qr?.data
            ? b2bCopy.qrNotFound
            : !qr.data.usable
              ? `${qr.data.accountName} · ${qr.data.plate ?? qr.data.vehicleLabel}: ${b2bCopy.qrNotUsable}`
              : null;
    return (
      <AppShell state={state} screen="orderNew" title={`${ordersCopy.newTitle} · ${b2bCopy.b2bMode}`}>
        <Link href="/ordenes/nueva" className="text-sm underline">
          ← {ordersCopy.newTitle}
        </Link>
        <form method="get" action="/ordenes/nueva" className="flex flex-col gap-sm md:flex-row md:items-end">
          <input type="hidden" name="modo" value="b2b" />
          <div className="flex-1">
            <Input
              name="qr"
              label={b2bCopy.qrScan}
              hint="Escanea con la app o un lector; también puedes pegar el enlace."
              defaultValue={qrVehicle ? "" : qrText}
            />
          </div>
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            Buscar
          </button>
        </form>
        {qrMessage ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
            {qrMessage}
          </p>
        ) : null}
        {qrVehicle ? (
          <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
            {qrVehicle.accountName} · {qrVehicle.plate ?? qrVehicle.vehicleLabel}
          </p>
        ) : null}
        <Card>
          {accounts.ok ? (
            <NewB2bOrderForm
              key={qrVehicle?.vehicleId ?? "b2b"}
              requestId={newRequestId()}
              accounts={accounts.data}
              services={catalog.ok ? catalog.data : []}
              initialAccountId={qrVehicle?.accountId}
              initialVehicleId={qrVehicle?.vehicleId}
            />
          ) : (
            <p role="alert" className="text-sm">
              {accounts.error.message}
            </p>
          )}
        </Card>
      </AppShell>
    );
  }

  if (!clientId) {
    const results = q ? await createClientRepository(supabase).search(center.id, q) : null;
    return (
      <AppShell
        state={state}
        screen="orderNew"
        title={ordersCopy.newTitle}
        description={ordersCopy.newDescription}
      >
        <Card>
          <form className="flex flex-col gap-sm md:flex-row md:items-end" action="/ordenes/nueva">
            <div className="flex-1">
              <Input name="q" type="search" label={agendaCopy.clientSearch} defaultValue={q} autoFocus />
            </div>
            <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
              Buscar
            </button>
          </form>
          <div className="flex flex-wrap gap-md">
            <Link href="/clientes/nuevo" className="text-sm underline">
              {agendaCopy.noClient}
            </Link>
            <Link href="/ordenes/nueva?modo=b2b" className="text-sm underline">
              {b2bCopy.b2bMode}
            </Link>
          </div>
        </Card>
        {results && !results.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {clientErrorMessage(results.error)}
          </p>
        ) : results?.ok && results.data.length === 0 ? (
          <EmptyState title="Sin resultados" message={agendaCopy.noClient} />
        ) : results?.ok ? (
          <Table
            caption="Clientes"
            rows={results.data.map((r) => presentSearchResult(r, center.timezone))}
            rowKey={(r) => r.id}
            rowHref={(r) => `/ordenes/nueva?cliente=${r.id}`}
            emptyMessage="Sin resultados"
            columns={[
              { key: "name", header: "Cliente", value: (r) => r.name },
              { key: "phone", header: "Teléfono", value: (r) => r.phone },
              { key: "plates", header: "Placas", value: (r) => r.plates },
            ]}
          />
        ) : null}
      </AppShell>
    );
  }

  const agenda = createAgendaRepository(supabase);
  const [client, catalog, bays, technicians] = await Promise.all([
    createClientRepository(supabase).get(clientId),
    createCatalogRepository(supabase).listForCenter(center.id),
    agenda.listBays(center.id),
    agenda.listTechnicians(center.id),
  ]);
  if (!client.ok) {
    return (
      <AppShell state={state} screen="orderNew" title={ordersCopy.newTitle}>
        <EmptyState title={clientErrorMessage(client.error)} />
      </AppShell>
    );
  }
  return (
    <AppShell state={state} screen="orderNew" title={ordersCopy.newTitle} description={client.data.fullName}>
      <Link href="/ordenes/nueva" className="text-sm underline">
        {agendaCopy.changeClient}
      </Link>
      <Card>
        <NewOrderForm
          requestId={newRequestId()}
          clientId={client.data.id}
          vehicles={client.data.vehicles}
          services={catalog.ok ? catalog.data : []}
          bays={bays.ok ? bays.data : []}
          technicians={technicians.ok ? technicians.data : []}
        />
      </Card>
    </AppShell>
  );
}
