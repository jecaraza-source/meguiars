"use client";

import {
  buildUtmUrl,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_OBJECTIVE_LABELS,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  CONTENT_FORMAT_LABELS,
  CONTENT_FORMATS,
  CONTENT_STATUS_LABELS,
  contentStatusActions,
  utmSlug,
  type Campaign,
  type ContentPost,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addSpendAction,
  applyPromotionAction,
  postStatusAction,
  saveCampaignAction,
  savePostAction,
  savePromotionAction,
  setLeadCampaignAction,
  voidSpendAction,
  type MarketingFormState,
} from "@/app/actions/marketing";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Option = { value: string; label: string };

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

function useToastOnMessage(state: MarketingFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: MarketingFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const valueOf = (state: MarketingFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};
const listOf = (state: MarketingFormState, key: string, fallback: readonly string[] = []) => {
  const v = state.values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [...fallback];
};

export function CampaignForm({
  campaign,
  centers,
  defaultCenterId,
  today,
}: {
  campaign?: Campaign;
  centers: Option[];
  defaultCenterId?: string | undefined;
  today: string;
}) {
  const [state, action] = useActionState(saveCampaignAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const [name, setName] = useState(valueOf(state, "name", campaign?.name ?? ""));
  const [slug, setSlug] = useState(valueOf(state, "utmCampaign", campaign?.utmCampaign ?? ""));
  const channels = listOf(state, "channels", campaign?.channels ?? []);
  return (
    <form action={action} className="flex flex-col gap-sm" data-testid="campaign-form" noValidate>
      {campaign ? (
        <>
          <input type="hidden" name="id" value={campaign.id} />
          <input type="hidden" name="version" value={campaign.version} />
        </>
      ) : null}
      <Input
        name="name"
        label="Nombre"
        required
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
          if (!campaign) setSlug(utmSlug(e.currentTarget.value));
        }}
        error={f.name}
      />
      <div className="grid gap-sm md:grid-cols-2">
        <Select
          name="objective"
          id={`objective-${campaign?.id ?? "new"}`}
          label="Objetivo"
          options={CAMPAIGN_OBJECTIVES.map((o) => ({ value: o, label: CAMPAIGN_OBJECTIVE_LABELS[o] }))}
          defaultValue={valueOf(state, "objective", campaign?.objective ?? "prospectos")}
        />
        <Select
          name="detailCenterId"
          id={`campaign-center-${campaign?.id ?? "new"}`}
          label="Centro"
          options={[{ value: "", label: "Toda la organización (admin)" }, ...centers]}
          defaultValue={valueOf(
            state,
            "detailCenterId",
            campaign ? (campaign.detailCenterId ?? "") : (defaultCenterId ?? ""),
          )}
        />
        <Input
          name="startsOn"
          type="date"
          label="Inicio"
          required
          defaultValue={valueOf(state, "startsOn", campaign?.startsOn ?? today)}
          error={f.startsOn}
        />
        <Input
          name="endsOn"
          type="date"
          label="Fin"
          required
          defaultValue={valueOf(state, "endsOn", campaign?.endsOn ?? "")}
          error={f.endsOn}
        />
        <Input
          name="budget"
          type="number"
          step="0.01"
          label="Presupuesto (opcional)"
          defaultValue={valueOf(state, "budget", campaign?.budget != null ? String(campaign.budget) : "")}
          error={f.budget}
        />
        <Select
          name="status"
          id={`campaign-status-${campaign?.id ?? "new"}`}
          label="Estado"
          options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: CAMPAIGN_STATUS_LABELS[s] }))}
          defaultValue={valueOf(state, "status", campaign?.status ?? "planeada")}
        />
      </div>
      <fieldset className="flex flex-wrap gap-md">
        <legend className="text-sm font-medium">Canales</legend>
        {CAMPAIGN_CHANNELS.map((c) => (
          <Checkbox
            key={c}
            name="channels"
            value={c}
            id={`ch-${campaign?.id ?? "new"}-${c}`}
            label={CAMPAIGN_CHANNEL_LABELS[c]}
            checked={channels.includes(c)}
          />
        ))}
      </fieldset>
      <div className="grid gap-sm md:grid-cols-3">
        <Input
          name="utmSource"
          label="utm_source"
          required
          defaultValue={valueOf(state, "utmSource", campaign?.utmSource ?? "instagram")}
          error={f.utmSource}
        />
        <Input
          name="utmMedium"
          label="utm_medium"
          required
          defaultValue={valueOf(state, "utmMedium", campaign?.utmMedium ?? "social")}
          error={f.utmMedium}
        />
        <Input
          name="utmCampaign"
          label="utm_campaign"
          required
          value={slug}
          onChange={(e) => setSlug(e.currentTarget.value)}
          error={f.utmCampaign}
        />
      </div>
      <Input
        name="landingUrl"
        label="Página de destino (https)"
        defaultValue={valueOf(state, "landingUrl", campaign?.landingUrl ?? "")}
        error={f.landingUrl}
      />
      <Input name="notes" label="Notas" defaultValue={valueOf(state, "notes", campaign?.notes ?? "")} />
      <Input
        name="reason"
        label="Motivo del cambio"
        required
        defaultValue={campaign ? "" : "Alta de campaña"}
        error={f.reason}
      />
      <div>
        <Submit label={campaign ? "Guardar" : "Crear campaña"} />
      </div>
      <FormError state={state} />
    </form>
  );
}

/** Arma el enlace UTM de una pieza (utm_content) para pegarlo en la publicación. */
export function UtmBuilder({ campaign }: { campaign: Campaign }) {
  const [content, setContent] = useState("");
  const [base, setBase] = useState(campaign.landingUrl ?? "");
  const [copied, setCopied] = useState(false);
  const url = base
    ? buildUtmUrl(base, {
        source: campaign.utmSource,
        medium: campaign.utmMedium,
        campaign: campaign.utmCampaign,
        content: content || undefined,
      })
    : null;
  return (
    <div className="flex flex-col gap-sm" data-testid="utm-builder">
      <div className="grid gap-sm md:grid-cols-2">
        <Input
          name="base"
          label="Enlace de destino (https)"
          value={base}
          onChange={(e) => setBase(e.currentTarget.value)}
        />
        <Input
          name="content"
          label="Pieza (utm_content)"
          hint="p. ej. reel-antes-despues"
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
        />
      </div>
      {url ? (
        <div className="flex flex-wrap items-center gap-sm">
          <code className="break-all text-sm" data-testid="utm-url">
            {url}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            label={copied ? "Copiado" : "Copiar"}
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Escribe un enlace https para armar la URL con UTM.</p>
      )}
    </div>
  );
}

export function SpendForm({
  campaignId,
  expenses,
  today,
}: {
  campaignId: string;
  expenses: Option[];
  today: string;
}) {
  const [state, action] = useActionState(addSpendAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form
      key={state.message ? state.at : "spend"}
      action={action}
      className="flex flex-col gap-sm"
      data-testid="spend-form"
      noValidate
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="grid gap-sm md:grid-cols-3">
        <Select
          name="channel"
          id="spend-channel"
          label="Canal"
          options={CAMPAIGN_CHANNELS.map((c) => ({ value: c, label: CAMPAIGN_CHANNEL_LABELS[c] }))}
          defaultValue={valueOf(state, "channel", "instagram")}
        />
        <Select
          name="expenseId"
          id="spend-expense"
          label="Egreso de marketing (recomendado)"
          options={[{ value: "", label: "Sin egreso: capturar importe" }, ...expenses]}
          defaultValue={valueOf(state, "expenseId")}
        />
        <Input
          name="amount"
          type="number"
          step="0.01"
          label="Importe (si no hay egreso)"
          defaultValue={valueOf(state, "amount")}
          error={f.amount}
        />
        <Input
          name="spentOn"
          type="date"
          label="Fecha (si no hay egreso)"
          defaultValue={valueOf(state, "spentOn", today)}
          error={f.spentOn}
        />
        <Input name="note" label="Nota" defaultValue={valueOf(state, "note")} />
      </div>
      <div>
        <Submit label="Registrar gasto" variant="secondary" />
      </div>
      <FormError state={state} />
    </form>
  );
}

export function VoidSpendForm({ campaignId, spendId }: { campaignId: string; spendId: string }) {
  const [state, action] = useActionState(voidSpendAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="spendId" value={spendId} />
      <Input name="reason" id={`void-${spendId}`} label="Motivo para anular" required defaultValue="" />
      <Submit label="Anular" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function PostForm({
  campaigns,
  centers,
  defaultCenterId,
  today,
}: {
  campaigns: Option[];
  centers: Option[];
  defaultCenterId?: string | undefined;
  today: string;
}) {
  const [state, action] = useActionState(savePostAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form
      key={state.message ? state.at : "post"}
      action={action}
      className="flex flex-col gap-sm"
      data-testid="post-form"
      noValidate
    >
      <Input name="title" label="Título" required defaultValue={valueOf(state, "title")} error={f.title} />
      <div className="grid gap-sm md:grid-cols-3">
        <Select
          name="channel"
          id="post-channel"
          label="Canal"
          options={CAMPAIGN_CHANNELS.map((c) => ({ value: c, label: CAMPAIGN_CHANNEL_LABELS[c] }))}
          defaultValue={valueOf(state, "channel", "instagram")}
        />
        <Select
          name="format"
          id="post-format"
          label="Formato"
          options={CONTENT_FORMATS.map((c) => ({ value: c, label: CONTENT_FORMAT_LABELS[c] }))}
          defaultValue={valueOf(state, "format", "publicacion")}
        />
        <Select
          name="campaignId"
          id="post-campaign"
          label="Campaña"
          options={[{ value: "", label: "Sin campaña" }, ...campaigns]}
          defaultValue={valueOf(state, "campaignId")}
        />
        <Input
          name="date"
          type="date"
          label="Fecha"
          required
          defaultValue={valueOf(state, "date", today)}
          error={f.plannedAt}
        />
        <Input name="time" type="time" label="Hora" defaultValue={valueOf(state, "time", "10:00")} />
        <Select
          name="detailCenterId"
          id="post-center"
          label="Centro"
          options={[{ value: "", label: "Toda la organización (admin)" }, ...centers]}
          defaultValue={valueOf(state, "detailCenterId", defaultCenterId ?? "")}
        />
      </div>
      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium">Texto de la publicación</span>
        <textarea name="copy" rows={3} className="mg-input" defaultValue={valueOf(state, "copy")} />
      </label>
      <Input
        name="linkUrl"
        label="Enlace con UTM (https)"
        defaultValue={valueOf(state, "linkUrl")}
        error={f.linkUrl}
      />
      <div>
        <Submit label="Planear publicación" />
      </div>
      <FormError state={state} />
    </form>
  );
}

export function PostStatusForm({ post }: { post: ContentPost }) {
  const [state, action] = useActionState(postStatusAction, {});
  useToastOnMessage(state);
  const [status, setStatus] = useState(contentStatusActions(post.status)[0] ?? "");
  const options = contentStatusActions(post.status);
  if (options.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm" data-testid={`post-status-${post.id}`}>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="version" value={post.version} />
      <Select
        name="status"
        id={`status-${post.id}`}
        label="Pasar a"
        options={options.map((s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }))}
        value={status}
        onChange={(e) => setStatus(e.currentTarget.value as typeof status)}
      />
      {status === "publicada" ? (
        <Input
          name="publishedUrl"
          id={`url-${post.id}`}
          label="Enlace de la publicación"
          required
          defaultValue=""
        />
      ) : null}
      <Submit label="Actualizar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function PromotionForm({
  campaigns,
  services,
  centers,
  today,
}: {
  campaigns: Option[];
  services: Option[];
  centers: Option[];
  today: string;
}) {
  const [state, action] = useActionState(savePromotionAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const pickedServices = listOf(state, "serviceIds");
  const pickedCenters = listOf(state, "detailCenterIds");
  return (
    <form
      key={state.message ? state.at : "promo"}
      action={action}
      className="flex flex-col gap-sm"
      data-testid="promotion-form"
      noValidate
    >
      <div className="grid gap-sm md:grid-cols-3">
        <Input
          name="code"
          label="Código"
          required
          hint="Lo dice el cliente, p. ej. LAVA15"
          defaultValue={valueOf(state, "code")}
          error={f.code}
        />
        <Input name="name" label="Nombre" required defaultValue={valueOf(state, "name")} error={f.name} />
        <Select
          name="campaignId"
          id="promo-campaign"
          label="Campaña"
          options={[{ value: "", label: "Sin campaña" }, ...campaigns]}
          defaultValue={valueOf(state, "campaignId")}
        />
        <Select
          name="kind"
          id="promo-kind"
          label="Tipo"
          options={[
            { value: "percent", label: "Porcentaje" },
            { value: "amount", label: "Importe" },
          ]}
          defaultValue={valueOf(state, "kind", "percent")}
        />
        <Input
          name="value"
          type="number"
          step="0.01"
          label="Valor"
          required
          defaultValue={valueOf(state, "value")}
          error={f.value}
        />
        <Input
          name="maxUses"
          type="number"
          label="Usos máximos (opcional)"
          defaultValue={valueOf(state, "maxUses")}
          error={f.maxUses}
        />
        <Input
          name="startsOn"
          type="date"
          label="Desde"
          required
          defaultValue={valueOf(state, "startsOn", today)}
          error={f.startsOn}
        />
        <Input
          name="endsOn"
          type="date"
          label="Hasta"
          required
          defaultValue={valueOf(state, "endsOn")}
          error={f.endsOn}
        />
      </div>
      <fieldset className="flex flex-wrap gap-md">
        <legend className="text-sm font-medium">Servicios (vacío = toda la cotización u OS)</legend>
        {services.map((s) => (
          <Checkbox
            key={s.value}
            name="serviceIds"
            value={s.value}
            id={`ps-${s.value}`}
            label={s.label}
            checked={pickedServices.includes(s.value)}
          />
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-md">
        <legend className="text-sm font-medium">Centros (vacío = todos)</legend>
        {centers.map((c) => (
          <Checkbox
            key={c.value}
            name="detailCenterIds"
            value={c.value}
            id={`pc-${c.value}`}
            label={c.label}
            checked={pickedCenters.includes(c.value)}
          />
        ))}
      </fieldset>
      <Input name="terms" label="Condiciones" defaultValue={valueOf(state, "terms")} />
      <Checkbox name="active" value="on" id="promo-active" label="Activa" checked />
      <Input name="reason" label="Motivo" required defaultValue="Alta de promoción" error={f.reason} />
      <div>
        <Submit label="Crear promoción" />
      </div>
      <FormError state={state} />
    </form>
  );
}

/** Aplicar un código de promoción a una cotización o a una OS. */
export function ApplyPromotionForm({
  target,
  documentId,
  version,
}: {
  target: "quote" | "order";
  documentId: string;
  version: number;
}) {
  const [state, action] = useActionState(applyPromotionAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm" data-testid="apply-promotion-form">
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="version" value={version} />
      <Input
        name="code"
        id={`promo-code-${target}`}
        label="Código de promoción"
        required
        defaultValue={valueOf(state, "code")}
      />
      <Submit label="Aplicar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function LeadCampaignForm({
  leadId,
  version,
  campaignId,
  campaigns,
}: {
  leadId: string;
  version: number;
  campaignId: string | null;
  campaigns: Option[];
}) {
  const [state, action] = useActionState(setLeadCampaignAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm" data-testid="lead-campaign-form">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="version" value={version} />
      <Select
        name="campaignId"
        id="lead-campaign"
        label="Campaña"
        options={[{ value: "", label: "Sin campaña" }, ...campaigns]}
        defaultValue={campaignId ?? ""}
      />
      <Submit label="Guardar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}
