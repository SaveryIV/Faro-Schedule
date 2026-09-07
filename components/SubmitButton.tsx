"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200 " +
        className
      }
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
