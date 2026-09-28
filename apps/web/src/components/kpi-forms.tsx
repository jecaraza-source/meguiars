"use client";

import { kpisCopy, type KpiSettings } from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { saveKpiSettingsAction } from "@/app/actions/dashboards";
import { Button } from "./ui/button";
import { Input } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" label={kpisCopy.saveSettings} loading={pending} size="sm" />;
}

/** Parámetros gerenciales de los KPIs (admin corporativo). */
export function KpiSettingsForm({ settings }: { settings: KpiSettings }) {
  const [state, action] = useActionState(saveKpiSettingsAction, {});
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
  const f = state.fields ?? {};
  const v = (k: string, fallback: string | number) =>
    typeof state.values?.[k] === "string" ? (state.values[k] as string) : String(fallback);
  return (
    <form key={state.at} action={action} className="flex flex-col gap-md" data-testid="kpi-settings">
      <input type="hidden" name="organizationId" value={settings.organizationId} />
      <input type="hidden" name="version" value={settings.version} />
      {state.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="ltvLifetimeYears"
          label={kpisCopy.ltvYears}
          inputMode="decimal"
          defaultValue={v("ltvLifetimeYears", settings.ltvLifetimeYears)}
          error={f.ltvLifetimeYears}
          required
        />
        <Input
          name="operatingHoursPerDay"
          label={kpisCopy.hoursPerDay}
          inputMode="decimal"
          defaultValue={v("operatingHoursPerDay", settings.operatingHoursPerDay)}
          error={f.operatingHoursPerDay}
          required
        />
        <Input
          name="operatingDaysPerWeek"
          label={kpisCopy.daysPerWeek}
          inputMode="numeric"
          defaultValue={v("operatingDaysPerWeek", settings.operatingDaysPerWeek)}
          error={f.operatingDaysPerWeek}
          required
        />
      </div>
      <Input name="reason" id="kpi-reason" label={kpisCopy.reason} error={f.reason} required />
      <div>
        <Submit />
      </div>
    </form>
  );
}
