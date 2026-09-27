"use client";

import {
  CASH_SHIFT_LABELS,
  CASH_SHIFTS,
  cashCopy,
  cashDifference,
  cashSummaryCsv,
  closeNoteRequired,
  formatDifference,
  formatMoney,
  type CashSession,
} from "@meguiars/domain";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { closeCashAction, openCashAction, reopenCashAction, type CashFormState } from "@/app/actions/cash";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";

function Submit({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

const valueOf = (state: CashFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function FormError({ state }: { state: CashFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

/** Apertura de caja del turno (centro activo). */
export function OpenCashForm({ requestId, defaultFloat }: { requestId: string; defaultFloat: number }) {
  const [state, action] = useActionState(openCashAction, {});
  const f = state.fields ?? {};
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="cash-open"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-md md:grid-cols-3">
        <Select
          name="shift"
          label={cashCopy.shift}
          options={CASH_SHIFTS.map((s) => ({ value: s, label: CASH_SHIFT_LABELS[s] }))}
          defaultValue={valueOf(state, "shift", "unico")}
          error={f.shift}
        />
        <Input
          name="openingFloat"
          label={cashCopy.openingFloat}
          inputMode="decimal"
          defaultValue={valueOf(state, "openingFloat", String(defaultFloat))}
          error={f.openingFloat}
        />
        <Input
          name="notes"
          label={cashCopy.openNotes}
          maxLength={500}
          defaultValue={valueOf(state, "notes")}
          error={f.notes}
        />
      </div>
      <p className="text-xs text-muted">
        {cashCopy.openHint} {cashCopy.onlineOnly}
      </p>
      <FormError state={state} />
      <div>
        <Submit label={cashCopy.open} />
      </div>
    </form>
  );
}

/**
 * Arqueo y cierre. Muestra la diferencia contra el esperado al momento (la
 * base la vuelve a calcular al cerrar, con los cobros que hayan entrado).
 */
export function CloseCashForm({
  session,
  requestId,
}: {
  session: Pick<CashSession, "id" | "version" | "live">;
  requestId: string;
}) {
  const [state, action] = useActionState(closeCashAction, {});
  const f = state.fields ?? {};
  const [counted, setCounted] = useState(valueOf(state, "countedCash"));
  const expected = session.live.expectedCash;
  const n = Number(counted.replace(/[$,\s]/g, ""));
  const valid = counted.trim() !== "" && Number.isFinite(n) && n >= 0;
  const diff = valid ? formatDifference(cashDifference(n, expected).difference) : null;
  const noteRequired = valid && closeNoteRequired(n, expected);
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="cash-close"
    >
      <input type="hidden" name="sessionId" value={session.id} />
      <input type="hidden" name="version" value={session.version} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedCash" value={expected} />
      <p className="text-sm">
        {cashCopy.expected}: <strong data-testid="cash-expected">{formatMoney(expected)}</strong>
      </p>
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="countedCash"
          label={cashCopy.countedCash}
          inputMode="decimal"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          hint={diff ? `${cashCopy.difference}: ${diff.text}` : undefined}
          error={f.countedCash}
        />
        <Input
          name="notes"
          label={noteRequired ? cashCopy.closeNotes : `${cashCopy.closeNotes} (opcional)`}
          maxLength={500}
          defaultValue={valueOf(state, "notes")}
          hint={noteRequired ? cashCopy.closeNoteRequired : undefined}
          error={f.notes}
        />
      </div>
      <p className="text-xs text-muted">{cashCopy.closeHint}</p>
      <FormError state={state} />
      <div>
        <Submit label={cashCopy.close} />
      </div>
    </form>
  );
}

/** Reapertura (sólo admin) con motivo. */
export function ReopenCashForm({ session }: { session: Pick<CashSession, "id" | "version"> }) {
  const [state, action] = useActionState(reopenCashAction, {});
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-sm"
      noValidate
      data-testid="cash-reopen"
    >
      <input type="hidden" name="sessionId" value={session.id} />
      <input type="hidden" name="version" value={session.version} />
      <Input
        name="reason"
        label={cashCopy.reopenReason}
        maxLength={500}
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      <p className="text-xs text-muted">{cashCopy.reopenHint}</p>
      <FormError state={state} />
      <div>
        <Submit label={cashCopy.reopen} variant="danger" />
      </div>
    </form>
  );
}

/** Exportación del corte: CSV (mismo contenido que móvil) e impresión del resumen. */
export function CashExport({ session }: { session: CashSession }) {
  const download = () => {
    const blob = new Blob([`﻿${cashSummaryCsv(session)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.folio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap gap-sm print:hidden">
      <Button type="button" label={cashCopy.exportCsv} variant="secondary" size="sm" onClick={download} />
      <Button
        type="button"
        label={cashCopy.print}
        variant="secondary"
        size="sm"
        onClick={() => window.print()}
      />
    </div>
  );
}
