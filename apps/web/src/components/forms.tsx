"use client";

import { authCopy } from "@meguiars/domain";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  editCenterAction,
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  type FormState,
} from "@/app/actions/auth";

const inputClass = "rounded-lg border border-mg-border px-3 py-2 outline-none focus:border-mg-brand";

function Field({
  name,
  label,
  type = "text",
  error,
  defaultValue,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string | undefined;
  defaultValue?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={inputClass}
      />
      {error ? <span className="text-mg-danger">{error}</span> : null}
    </label>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-mg-brand px-4 py-2 font-semibold text-white disabled:opacity-60"
    >
      {pending ? "…" : children}
    </button>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-mg-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-sm text-mg-success">
        {state.message}
      </p>
    );
  }
  return null;
}

export function LoginForm({ next }: { next?: string | undefined }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field
        name="email"
        label={authCopy.emailLabel}
        type="email"
        autoComplete="email"
        error={state.fields?.email}
      />
      <Field
        name="password"
        label={authCopy.passwordLabel}
        type="password"
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <Feedback state={state} />
      <Submit>{authCopy.submitLogin}</Submit>
      <Link href="/recuperar" className="text-sm text-mg-muted underline">
        {authCopy.forgotLink}
      </Link>
    </form>
  );
}

export function ForgotPasswordForm({ initialError }: { initialError?: string | undefined }) {
  const [state, action] = useActionState(forgotPasswordAction, initialError ? { error: initialError } : {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-mg-muted">{authCopy.forgotHelp}</p>
      <Field
        name="email"
        label={authCopy.emailLabel}
        type="email"
        autoComplete="email"
        error={state.fields?.email}
      />
      <Feedback state={state} />
      <Submit>{authCopy.submitForgot}</Submit>
      <Link href="/login" className="text-sm text-mg-muted underline">
        {authCopy.backToLogin}
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        name="password"
        label={authCopy.newPasswordLabel}
        type="password"
        autoComplete="new-password"
        error={state.fields?.password}
      />
      <Field
        name="confirm"
        label={authCopy.confirmPasswordLabel}
        type="password"
        autoComplete="new-password"
        error={state.fields?.confirm}
      />
      <Feedback state={state} />
      <Submit>{authCopy.submitReset}</Submit>
      {state.message ? (
        <Link href="/" className="text-sm underline">
          Ir al inicio
        </Link>
      ) : null}
    </form>
  );
}

export function EditCenterForm({ name, timezone }: { name: string; timezone: string }) {
  const [state, action] = useActionState(editCenterAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field name="name" label={authCopy.centerNameLabel} defaultValue={name} error={state.fields?.name} />
      <Field
        name="timezone"
        label={authCopy.timezoneLabel}
        defaultValue={timezone}
        error={state.fields?.timezone}
      />
      <Field name="reason" label={authCopy.reasonLabel} error={state.fields?.reason} />
      <Feedback state={state} />
      <Submit>{authCopy.submitEditCenter}</Submit>
    </form>
  );
}
