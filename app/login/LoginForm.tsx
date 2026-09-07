"use client";

import { useActionState } from "react";
import Link from "next/link";

import { loginAction, type FormState } from "@/app/auth-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, inputClass } from "@/components/Field";

const initial: FormState = {};

export function LoginForm({ rejected }: { rejected?: boolean }) {
  const [state, action] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      {rejected && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Se rechazó tu solicitud de cuenta. Escribí a un administrador.
        </p>
      )}
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Field label="Correo electrónico" error={state.fieldErrors?.email}>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Contraseña" error={state.fieldErrors?.password}>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <SubmitButton className="w-full">Iniciar sesión</SubmitButton>

      <p className="text-center text-sm text-neutral-500">
        ¿No tenés cuenta?{" "}
        <Link href="/register" className="font-medium underline">
          Solicitar acceso
        </Link>
      </p>
    </form>
  );
}
