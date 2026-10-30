"use client";

import {
  MEMBERSHIP_REMINDER_RULES,
  MEMBERSHIP_REMINDER_TEMPLATE_EXAMPLE,
  membershipReminderTemplateIssues,
  type MembershipReminderSettings,
  ASSISTANT_COPY,
  ASSISTANT_MODEL_INFO,
  ASSISTANT_MODELS,
  ASSISTANT_MODES,
  CENTER_CHOICES,
  REMINDER_RULES,
  REMINDER_TEMPLATE_EXAMPLE,
  WEEKDAY_LABELS,
  reminderTemplateIssues,
  type AssistantFaq,
  type AssistantService,
  type AssistantSettings,
  type CenterPublicInfo,
  type HandoffRule,
  type WhatsappTemplate,
} from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  conversationAssistantAction,
  deleteAssistantFaqAction,
  saveAssistantFaqAction,
  saveAssistantRemindersAction,
  saveMembershipRemindersAction,
  saveAssistantServiceAction,
  saveAssistantSettingsAction,
  saveCenterInfoAction,
  saveHandoffRuleAction,
  type AssistantFormState,
} from "@/app/actions/assistant";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Option = { value: string; label: string };

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

function useToastOnMessage(state: AssistantFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: AssistantFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const valueOf = (state: AssistantFormState, key: string, fallback: string) => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function TextArea({
  name,
  label,
  defaultValue,
  rows = 2,
  maxLength,
  hint,
  id,
}: {
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
  maxLength: number;
  hint?: string;
  id?: string;
}) {
  const fieldId = id ?? `field-${name}`;
  return (
    <label htmlFor={fieldId} className="flex flex-col gap-xs text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        maxLength={maxLength}
        className="mg-input"
        defaultValue={defaultValue}
      />
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Configuración general (sólo el admin de la organización). */
export function AssistantSettingsForm({ settings }: { settings: AssistantSettings }) {
  const [state, action] = useActionState(saveAssistantSettingsAction, {});
  useToastOnMessage(state);
  const v = (k: string, d: string) => valueOf(state, k, d);
  return (
    <form
      key={state.at ? String(state.at) : "settings"}
      action={action}
      className="flex flex-col gap-md"
      data-testid="assistant-settings-form"
    >
      <input type="hidden" name="version" value={settings.version} />
      <div className="grid gap-sm md:grid-cols-2">
        <Select
          name="mode"
          label="Modo"
          options={ASSISTANT_MODES.map((m) => ({ value: m, label: ASSISTANT_COPY.modes[m] }))}
          defaultValue={v("mode", settings.mode)}
        />
        <Select
          name="model"
          label="Modelo"
          hint="El costo depende del modelo; empieza con el más capaz y cambia sólo si las pruebas lo confirman."
          options={ASSISTANT_MODELS.map((m) => ({
            value: m,
            label: `${ASSISTANT_MODEL_INFO[m].label} · US$${ASSISTANT_MODEL_INFO[m].input}/${ASSISTANT_MODEL_INFO[m].output} por millón de tokens`,
          }))}
          defaultValue={v("model", settings.model)}
        />
        <Input
          name="assistantName"
          label="Nombre del asistente"
          required
          defaultValue={v("assistantName", settings.assistantName)}
        />
        <Input
          name="privacyUrl"
          label="Aviso de privacidad (URL)"
          placeholder="https://"
          defaultValue={v("privacyUrl", settings.privacyUrl ?? "")}
        />
      </div>
      <TextArea
        name="tone"
        label="Tono"
        maxLength={300}
        defaultValue={v("tone", settings.tone)}
        hint="Cómo escribe: tú o usted, formal o casual."
      />
      <TextArea
        name="greeting"
        label="Saludo (primer mensaje)"
        maxLength={500}
        defaultValue={v("greeting", settings.greeting ?? "")}
        hint="Vacío: se presenta como asistente virtual."
      />
      <div className="grid gap-sm md:grid-cols-2">
        <Input
          name="humanHours"
          label="Horario de atención de personas"
          placeholder="lun-sáb 9:00-19:00"
          defaultValue={v("humanHours", settings.humanHours ?? "")}
        />
        <Select
          name="centerChoice"
          label="Cómo elige centro el cliente"
          options={CENTER_CHOICES.map((c) => ({ value: c, label: ASSISTANT_COPY.centerChoices[c] }))}
          defaultValue={v("centerChoice", settings.centerChoice)}
        />
      </div>
      <TextArea
        name="afterHoursMessage"
        label="Mensaje fuera de horario"
        maxLength={500}
        defaultValue={v("afterHoursMessage", settings.afterHoursMessage ?? "")}
      />
      <div className="grid gap-sm md:grid-cols-2">
        <Input
          name="maxDaysAhead"
          type="number"
          min={1}
          max={60}
          label="Días adelante para mostrar horarios"
          defaultValue={v("maxDaysAhead", String(settings.maxDaysAhead))}
        />
        <Input
          name="minHoursAhead"
          type="number"
          min={0}
          max={72}
          label="Horas mínimas de anticipación"
          defaultValue={v("minHoursAhead", String(settings.minHoursAhead))}
        />
      </div>
      <div className="flex flex-wrap gap-md">
        <Checkbox
          name="mentionPromotions"
          value="on"
          label="Menciona promociones vigentes y autorizadas"
          checked={settings.mentionPromotions}
        />
        <Checkbox
          name="mentionMemberships"
          value="on"
          label="Sugiere membresías"
          checked={settings.mentionMemberships}
        />
        <Checkbox
          name="selfBooking"
          value="on"
          label="Agenda, cambia y cancela citas (el cliente confirma con un botón)"
          checked={settings.selfBooking}
        />
      </div>
      <TextArea
        name="testNumbers"
        label="Números de prueba"
        rows={3}
        maxLength={400}
        defaultValue={v("testNumbers", settings.testNumbers.join("\n"))}
        hint="Uno por línea, con lada (p. ej. 52 55 1234 5678). En modo prueba sólo responde a estos números."
      />
      <Input name="reason" label="Motivo del cambio" required defaultValue="" />
      <Submit label="Guardar configuración" />
      <FormError state={state} />
    </form>
  );
}

/** Recordatorio de cita por WhatsApp (sólo el admin): plantilla, horas antes y encendido. */
export function AssistantRemindersForm({
  settings,
  templates,
}: {
  settings: AssistantSettings;
  templates: WhatsappTemplate[];
}) {
  const [state, action] = useActionState(saveAssistantRemindersAction, {});
  useToastOnMessage(state);
  const v = (k: string, d: string) => valueOf(state, k, d);
  const usable = templates.filter((t) => reminderTemplateIssues(t).length === 0);
  return (
    <form
      key={state.at ? String(state.at) : "reminders"}
      action={action}
      className="flex flex-col gap-md"
      data-testid="assistant-reminders-form"
    >
      <input type="hidden" name="version" value={settings.version} />
      <p className="text-sm text-muted">
        Plantilla de WhatsApp de categoría Utilidad, aprobada por Meta, con 3 datos y 2 botones de respuesta
        rápida. Ejemplo: «{REMINDER_TEMPLATE_EXAMPLE.body}» con botones «
        {REMINDER_TEMPLATE_EXAMPLE.buttons.join("» y «")}». Créala en WhatsApp Manager y sincroniza las
        plantillas en Integraciones.
      </p>
      <div className="grid gap-sm md:grid-cols-2">
        <Select
          name="templateId"
          label="Plantilla del recordatorio"
          options={[
            {
              value: "",
              label: usable.length ? "Elige una plantilla" : "Ninguna plantilla cumple los requisitos",
            },
            ...usable.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` })),
          ]}
          defaultValue={v("templateId", settings.reminderTemplateId ?? "")}
          error={state.fields?.templateId}
        />
        <Input
          name="hours"
          type="number"
          min={REMINDER_RULES.hours.min}
          max={REMINDER_RULES.hours.max}
          label="Horas antes de la cita"
          defaultValue={v("hours", String(settings.reminderHours))}
          error={state.fields?.hours}
        />
      </div>
      <Checkbox
        name="enabled"
        value="on"
        label="Enviar recordatorio con botones Confirmar y Reagendar"
        checked={settings.remindersEnabled}
      />
      <Input name="reason" label="Motivo del cambio" required defaultValue="" />
      <Submit label="Guardar recordatorios" />
      <FormError state={state} />
    </form>
  );
}

/** Aviso de membresía por WhatsApp (sólo el admin): plantilla, días sin visita y encendido. */
export function MembershipRemindersForm({
  settings,
  templates,
}: {
  settings: MembershipReminderSettings;
  templates: WhatsappTemplate[];
}) {
  const [state, action] = useActionState(saveMembershipRemindersAction, {});
  useToastOnMessage(state);
  const v = (k: string, d: string) => valueOf(state, k, d);
  const usable = templates.filter((t) => membershipReminderTemplateIssues(t).length === 0);
  return (
    <form
      key={state.at ? String(state.at) : "membership-reminders"}
      action={action}
      className="flex flex-col gap-md"
      data-testid="membership-reminders-form"
    >
      <input type="hidden" name="version" value={settings.version} />
      <p className="text-sm text-muted">
        Se manda a quien tiene una membresía con servicios incluidos sin usar, no ha venido en los días que
        elijas y aceptó recibir WhatsApp; como máximo un aviso cada esos días, entre 10:00 y 19:00. Plantilla
        aprobada por Meta (Marketing o Utilidad) con 2 datos y sin botones. Ejemplo: «
        {MEMBERSHIP_REMINDER_TEMPLATE_EXAMPLE.body}». Créala en WhatsApp Manager y sincroniza las plantillas
        en Integraciones.
      </p>
      <div className="grid gap-sm md:grid-cols-2">
        <Select
          name="templateId"
          label="Plantilla del aviso"
          options={[
            {
              value: "",
              label: usable.length ? "Elige una plantilla" : "Ninguna plantilla cumple los requisitos",
            },
            ...usable.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` })),
          ]}
          defaultValue={v("templateId", settings.templateId ?? "")}
          error={state.fields?.templateId}
        />
        <Input
          name="days"
          type="number"
          min={MEMBERSHIP_REMINDER_RULES.days.min}
          max={MEMBERSHIP_REMINDER_RULES.days.max}
          label="Días sin visita"
          defaultValue={v("days", String(settings.days))}
          error={state.fields?.days}
        />
      </div>
      <Checkbox
        name="enabled"
        value="on"
        label="Avisar a clientes con servicios de su membresía sin usar"
        checked={settings.enabled}
      />
      <Input name="reason" label="Motivo del cambio" required defaultValue="" />
      <Submit label="Guardar aviso de membresía" />
      <FormError state={state} />
    </form>
  );
}

/** Datos públicos y horario de un centro (admin o encargado del centro). */
export function CenterInfoForm({ center, owners }: { center: CenterPublicInfo; owners: Option[] }) {
  const [state, action] = useActionState(saveCenterInfoAction, {});
  useToastOnMessage(state);
  const v = (k: string, d: string) => valueOf(state, k, d);
  const id = (k: string) => `ci-${k}-${center.detailCenterId}`;
  const byDay = new Map(center.hours.map((h) => [h.weekday, h]));
  return (
    <form
      key={state.at ? String(state.at) : center.detailCenterId}
      action={action}
      className="flex flex-col gap-sm"
      data-testid={`center-info-form-${center.code}`}
    >
      <input type="hidden" name="detailCenterId" value={center.detailCenterId} />
      <input type="hidden" name="version" value={center.version ?? ""} />
      <div className="grid gap-sm md:grid-cols-2">
        <Input
          name="address"
          id={id("address")}
          label="Dirección"
          defaultValue={v("address", center.address ?? "")}
        />
        <Input name="phone" id={id("phone")} label="Teléfono" defaultValue={v("phone", center.phone ?? "")} />
        <Input
          name="mapsUrl"
          id={id("maps")}
          label="Mapa (Google Maps)"
          placeholder="https://"
          defaultValue={v("mapsUrl", center.mapsUrl ?? "")}
        />
        <Select
          name="handoffUserId"
          id={id("handoff")}
          label="Responsable de la Bandeja"
          hint="Quién recibe las conversaciones que pasa el asistente."
          options={[{ value: "", label: "Sin responsable" }, ...owners]}
          defaultValue={v("handoffUserId", center.handoffUserId ?? "")}
        />
      </div>
      <TextArea
        name="directions"
        id={id("directions")}
        label="Cómo llegar"
        maxLength={500}
        defaultValue={v("directions", center.directions ?? "")}
      />
      <TextArea
        name="nearbyZones"
        id={id("zones")}
        label="Colonias o zonas cercanas"
        maxLength={2000}
        defaultValue={v("nearbyZones", center.nearbyZones.join(", "))}
        hint="Separadas por coma; el asistente sugiere el centro más cercano con ellas."
      />
      <fieldset className="flex flex-col gap-xs">
        <legend className="text-sm font-medium">Horario (vacío = cerrado)</legend>
        <div className="grid gap-xs sm:grid-cols-2 lg:grid-cols-4">
          {WEEKDAY_LABELS.map((label, i) => {
            const d = i + 1;
            const h = byDay.get(d);
            return (
              <div key={d} className="flex items-end gap-xs" data-testid={`hours-${center.code}-${d}`}>
                <Input
                  name={`opens_${d}`}
                  id={id(`opens-${d}`)}
                  type="time"
                  label={`${label} abre`}
                  defaultValue={v(`opens_${d}`, h?.opens ?? "")}
                />
                <Input
                  name={`closes_${d}`}
                  id={id(`closes-${d}`)}
                  type="time"
                  label="cierra"
                  defaultValue={v(`closes_${d}`, h?.closes ?? "")}
                />
              </div>
            );
          })}
        </div>
      </fieldset>
      <Input
        name="reason"
        id={id("reason")}
        label="Motivo"
        required
        defaultValue="Datos públicos del centro"
      />
      <Submit label="Guardar datos del centro" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Qué ofrece el asistente de un servicio (fila de la tabla). */
export function AssistantServiceForm({ service }: { service: AssistantService }) {
  const [state, action] = useActionState(saveAssistantServiceAction, {});
  useToastOnMessage(state);
  const id = (k: string) => `svc-${k}-${service.serviceId}`;
  return (
    <form
      key={state.at ? String(state.at) : service.serviceId}
      action={action}
      className="flex flex-wrap items-center gap-sm"
      data-testid={`assistant-service-${service.code}`}
    >
      <input type="hidden" name="serviceId" value={service.serviceId} />
      <Checkbox name="visible" value="on" id={id("visible")} label="Lo ofrece" checked={service.visible} />
      <Checkbox
        name="bookable"
        value="on"
        id={id("bookable")}
        label="Sin valoración"
        checked={service.bookable}
      />
      <Checkbox
        name="priceVariesBySize"
        value="on"
        id={id("size")}
        label="Precio varía por tamaño"
        checked={service.priceVariesBySize}
      />
      <Submit label="Guardar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Respuesta aprobada (alta o edición). */
export function AssistantFaqForm({ faq, centers }: { faq?: AssistantFaq; centers: Option[] }) {
  const [state, action] = useActionState(saveAssistantFaqAction, {});
  useToastOnMessage(state);
  const v = (k: string, d: string) => valueOf(state, k, d);
  const id = (k: string) => `faq-${k}-${faq?.id ?? "new"}`;
  return (
    <form
      key={state.at ? String(state.at) : (faq?.id ?? "faq")}
      action={action}
      className="flex flex-col gap-sm"
      data-testid={faq ? `faq-form-${faq.id}` : "faq-form"}
    >
      {faq ? (
        <>
          <input type="hidden" name="id" value={faq.id} />
          <input type="hidden" name="version" value={faq.version} />
        </>
      ) : null}
      <div className="grid gap-sm md:grid-cols-3">
        <div className="md:col-span-2">
          <Input
            name="question"
            id={id("question")}
            label="Pregunta"
            required
            defaultValue={v("question", faq?.question ?? "")}
          />
        </div>
        <Select
          name="detailCenterId"
          id={id("center")}
          label="Centro"
          options={[{ value: "", label: "Todos los centros" }, ...centers]}
          defaultValue={v("detailCenterId", faq?.detailCenterId ?? "")}
        />
      </div>
      <TextArea
        name="answer"
        id={id("answer")}
        label="Respuesta exacta"
        maxLength={1000}
        defaultValue={v("answer", faq?.answer ?? "")}
        hint="Sin precios ni horarios: el asistente los toma del catálogo y de los centros."
      />
      <div className="flex flex-wrap items-end gap-sm">
        <Input
          name="position"
          id={id("position")}
          type="number"
          min={1}
          max={999}
          label="Orden"
          defaultValue={v("position", String(faq?.position ?? 100))}
        />
        <Checkbox name="active" value="on" id={id("active")} label="Activa" checked={faq?.active ?? true} />
      </div>
      <Input
        name="reason"
        id={id("reason")}
        label="Motivo"
        required
        defaultValue={faq ? "" : "Alta de respuesta aprobada"}
      />
      <Submit label={faq ? "Guardar" : "Agregar respuesta"} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function DeleteFaqButton({ id }: { id: string }) {
  const [state, action] = useActionState(deleteAssistantFaqAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} data-testid={`faq-delete-${id}`}>
      <input type="hidden" name="id" value={id} />
      <Submit label="Eliminar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Regla de escalamiento (activa, a quién y con qué aviso). */
export function HandoffRuleForm({ rule, owners }: { rule: HandoffRule; owners: Option[] }) {
  const [state, action] = useActionState(saveHandoffRuleAction, {});
  useToastOnMessage(state);
  const id = (k: string) => `hr-${k}-${rule.code}`;
  return (
    <form
      key={state.at ? String(state.at) : rule.code}
      action={action}
      className="flex flex-col gap-sm"
      data-testid={`handoff-rule-${rule.code}`}
    >
      <input type="hidden" name="code" value={rule.code} />
      <input type="hidden" name="version" value={rule.version} />
      {rule.required ? (
        <>
          <input type="hidden" name="active" value="on" />
          <p className="text-xs text-muted">Siempre activa.</p>
        </>
      ) : (
        <Checkbox name="active" value="on" id={id("active")} label="Activa" checked={rule.active} />
      )}
      <div className="grid gap-sm md:grid-cols-2">
        <Select
          name="assignTo"
          id={id("assign")}
          label="Asignar a"
          options={[{ value: "", label: "Responsable del centro" }, ...owners]}
          defaultValue={valueOf(state, "assignTo", rule.assignTo ?? "")}
        />
        <Input
          name="message"
          id={id("message")}
          label="Aviso al cliente"
          placeholder={rule.defaultMessage}
          defaultValue={valueOf(state, "message", rule.message ?? "")}
        />
      </div>
      <Submit label="Guardar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Pausar o reactivar el asistente en una conversación. */
export function ConversationAssistantToggle({
  conversationId,
  active,
}: {
  conversationId: string;
  active: boolean;
}) {
  const [state, action] = useActionState(conversationAssistantAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-col gap-xs" data-testid="assistant-toggle">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Submit label={active ? "Pausar asistente aquí" : "Reactivar asistente aquí"} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}
