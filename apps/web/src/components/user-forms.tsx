"use client";

import { APP_ROLES, ROLE_LABELS, USERS_COPY } from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createUserAction,
  setPasswordAction,
  setUserDisabledAction,
  setUserRoleAction,
} from "@/app/actions/users";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Center = { id: string; name: string };
const ROLE_OPTIONS = APP_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

function Submit({ label, variant }: { label: string; variant?: "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} size="sm" {...(variant ? { variant } : {})} />;
}

function ErrorBox({ error }: { error?: string | undefined }) {
  return error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {error}
    </p>
  ) : null;
}

function useSuccessToast(state: { message?: string | undefined; at?: number | undefined }) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

/** Alta: nombre, correo, contraseña y acceso inicial (admin corporativo o rol en centros). */
export function CreateUserForm({ centers }: { centers: readonly Center[] }) {
  const [state, action] = useActionState(createUserAction, {});
  const f = state.fields ?? {};
  const v = (k: string, d = "") => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : d);
  const chosen = Array.isArray(state.values?.centerIds) ? (state.values.centerIds as string[]) : [];
  const [kind, setKind] = useState(v("accessKind", "centro"));
  return (
    <form
      key={state.at}
      action={action}
      className="flex flex-col gap-md"
      data-testid="create-user-form"
      autoComplete="off"
    >
      <ErrorBox error={state.error} />
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="fullName"
          label="Nombre completo"
          defaultValue={v("fullName")}
          error={f.fullName}
          required
        />
        <Input
          name="email"
          type="email"
          label="Correo (usuario)"
          defaultValue={v("email")}
          error={f.email}
          required
        />
        <Input
          name="password"
          type="password"
          label={USERS_COPY.password}
          hint={USERS_COPY.passwordHint}
          autoComplete="new-password"
          error={f.password}
          required
        />
        <Input
          name="confirmPassword"
          type="password"
          label={USERS_COPY.confirmPassword}
          autoComplete="new-password"
          error={f.confirmPassword}
          required
        />
        <Select
          name="accessKind"
          label="Acceso"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[
            { value: "centro", label: "Rol en uno o más centros" },
            { value: "corporativo", label: USERS_COPY.corporateAdmin },
          ]}
        />
        {kind === "centro" ? (
          <Select
            name="role"
            label="Rol"
            defaultValue={v("role", "operador_recepcion")}
            error={f.role}
            options={ROLE_OPTIONS}
          />
        ) : null}
      </div>
      {kind === "centro" ? (
        <fieldset className="flex flex-col gap-xs" data-testid="user-centers">
          <legend className="text-sm font-medium">Centros</legend>
          {centers.map((c) => (
            <Checkbox
              key={c.id}
              name="centerIds"
              value={c.id}
              label={c.name}
              checked={chosen.includes(c.id)}
            />
          ))}
          {f.centerIds ? (
            <p role="alert" className="text-xs text-danger">
              {f.centerIds}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <Input
        name="reason"
        id="new-user-reason"
        label="Motivo del alta"
        defaultValue={v("reason", "Alta de personal")}
        error={f.reason}
        required
      />
      <div>
        <Submit label={USERS_COPY.create} />
      </div>
    </form>
  );
}

export function PasswordForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(setPasswordAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form
      key={state.at}
      action={action}
      className="flex flex-col gap-sm"
      data-testid="password-form"
      autoComplete="off"
    >
      <input type="hidden" name="userId" value={userId} />
      <ErrorBox error={state.error} />
      {state.message ? (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      ) : null}
      <Input
        name="password"
        type="password"
        label="Nueva contraseña"
        hint={USERS_COPY.passwordHint}
        autoComplete="new-password"
        error={f.password}
        required
      />
      <Input
        name="confirmPassword"
        type="password"
        label={USERS_COPY.confirmPassword}
        autoComplete="new-password"
        error={f.confirmPassword}
        required
      />
      <div>
        <Submit label={USERS_COPY.setPassword} />
      </div>
    </form>
  );
}

export function DisableUserForm({ userId, active }: { userId: string; active: boolean }) {
  const [state, action] = useActionState(setUserDisabledAction, {});
  useSuccessToast(state);
  return (
    <form key={state.at} action={action} className="flex flex-col gap-sm" data-testid="disable-form">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="disabled" value={active ? "true" : "false"} />
      <ErrorBox error={state.error} />
      <Input name="reason" id="disable-reason" label="Motivo" required />
      <div>
        <Submit
          label={active ? USERS_COPY.disable : USERS_COPY.enable}
          variant={active ? "danger" : "secondary"}
        />
      </div>
    </form>
  );
}

/** Asignar (o cambiar) el rol en un centro; o hacerlo admin corporativo. */
export function AddRoleForm({ userId, centers }: { userId: string; centers: readonly Center[] }) {
  const [state, action] = useActionState(setUserRoleAction, {});
  useSuccessToast(state);
  const [scope, setScope] = useState("centro");
  return (
    <form key={state.at} action={action} className="flex flex-col gap-sm" data-testid="add-role-form">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value="true" />
      <ErrorBox error={state.error} />
      <div className="grid gap-md md:grid-cols-3">
        <Select
          name="scope"
          label="Tipo"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: "centro", label: "Rol en un centro" },
            { value: "corporativo", label: USERS_COPY.corporateAdmin },
          ]}
        />
        {scope === "centro" ? (
          <>
            <Select
              name="detailCenterId"
              label="Centro"
              options={centers.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select name="role" label="Rol" defaultValue="operador_recepcion" options={ROLE_OPTIONS} />
          </>
        ) : null}
      </div>
      <Input name="reason" id="add-role-reason" label="Motivo" required />
      <div>
        <Submit label={USERS_COPY.addRole} variant="secondary" />
      </div>
    </form>
  );
}

/** Quitar un rol (queda inactivo: el historial se conserva en la bitácora). */
export function RemoveRoleForm(props: {
  userId: string;
  scope: "centro" | "corporativo";
  detailCenterId?: string;
  role: string;
}) {
  const [state, action] = useActionState(setUserRoleAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="userId" value={props.userId} />
      <input type="hidden" name="scope" value={props.scope} />
      <input type="hidden" name="active" value="false" />
      <input type="hidden" name="role" value={props.role} />
      {props.detailCenterId ? (
        <input type="hidden" name="detailCenterId" value={props.detailCenterId} />
      ) : null}
      <label className="mg-field">
        <span className="sr-only">Motivo</span>
        <input name="reason" required placeholder="Motivo" className="mg-input" data-size="sm" />
      </label>
      <Submit label={USERS_COPY.removeRole} variant="secondary" />
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
