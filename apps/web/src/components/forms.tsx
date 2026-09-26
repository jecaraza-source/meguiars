"use client";

import { authCopy } from "@meguiars/domain";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  editCenterAction,
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  type FormState,
} from "@/app/actions/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} />;
}

function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
        {state.message}
      </p>
    );
  }
  return null;
}

export function LoginForm({ next }: { next?: string | undefined }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="next" value={next ?? "/"} />
      <Input
        name="email"
        label={authCopy.emailLabel}
        type="email"
        autoComplete="email"
        error={state.fields?.email}
      />
      <Input
        name="password"
        label={authCopy.passwordLabel}
        type="password"
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <FormMessage state={state} />
      <Submit label={authCopy.submitLogin} />
      <Link href="/recuperar" className="text-sm text-muted underline">
        {authCopy.forgotLink}
      </Link>
    </form>
  );
}

export function ForgotPasswordForm({ initialError }: { initialError?: string | undefined }) {
  const [state, action] = useActionState(forgotPasswordAction, initialError ? { error: initialError } : {});
  return (
    <form action={action} className="flex flex-col gap-lg" noValidate>
      <p className="text-sm text-muted">{authCopy.forgotHelp}</p>
      <Input
        name="email"
        label={authCopy.emailLabel}
        type="email"
        autoComplete="email"
        error={state.fields?.email}
      />
      <FormMessage state={state} />
      <Submit label={authCopy.submitForgot} />
      <Link href="/login" className="text-sm text-muted underline">
        {authCopy.backToLogin}
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-lg" noValidate>
      <Input
        name="password"
        label={authCopy.newPasswordLabel}
        type="password"
        autoComplete="new-password"
        hint="Al menos 8 caracteres."
        error={state.fields?.password}
      />
      <Input
        name="confirm"
        label={authCopy.confirmPasswordLabel}
        type="password"
        autoComplete="new-password"
        error={state.fields?.confirm}
      />
      <FormMessage state={state} />
      <Submit label={authCopy.submitReset} />
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
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
  return (
    <form action={action} className="grid gap-lg md:grid-cols-2" noValidate>
      <Input name="name" label={authCopy.centerNameLabel} defaultValue={name} error={state.fields?.name} />
      <Input
        name="timezone"
        label={authCopy.timezoneLabel}
        defaultValue={timezone}
        hint="Por ejemplo America/Mexico_City."
        error={state.fields?.timezone}
      />
      <div className="md:col-span-2">
        <Input name="reason" label={authCopy.reasonLabel} required error={state.fields?.reason} />
      </div>
      <div className="md:col-span-2">
        {state.error ? <FormMessage state={{ error: state.error }} /> : null}
      </div>
      <div>
        <Submit label={authCopy.submitEditCenter} />
      </div>
    </form>
  );
}
