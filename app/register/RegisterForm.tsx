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
          Recibimos tu solicitud. Un administrador debe aprobar tu cuenta antes
          de que puedas iniciar sesión.
        </p>
        <Link href="/login" className="text-sm font-medium underline">
          Volver a iniciar sesión
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

      <Field label="Nombre completo" error={state.fieldErrors?.name}>
        <input name="name" type="text" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Correo electrónico" error={state.fieldErrors?.email}>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field
        label="Contraseña"
        error={state.fieldErrors?.password}
        hint="Al menos 8 caracteres."
      >
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Confirmar contraseña" error={state.fieldErrors?.confirmPassword}>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      <SubmitButton className="w-full">Solicitar acceso</SubmitButton>

      <p className="text-center text-sm text-neutral-500">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium underline">
          Iniciar sesión
        </Link>
      </p>
    </form>
  );
}
