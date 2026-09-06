"use client";

import { useActionState } from "react";
import Link from "next/link";

import { registerAction, type FormState } from "@/app/auth-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, inputClass } from "@/components/Field";

const initial: FormState = {};

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initial);

  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Request received. An admin needs to approve your account before you can
          sign in.
        </p>
        <Link href="/login" className="text-sm font-medium underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Field label="Full name" error={state.fieldErrors?.name}>
        <input name="name" type="text" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Email" error={state.fieldErrors?.email}>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field
        label="Password"
        error={state.fieldErrors?.password}
        hint="At least 8 characters."
      >
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Confirm password" error={state.fieldErrors?.confirmPassword}>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      <SubmitButton className="w-full">Request access</SubmitButton>

      <p className="text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
