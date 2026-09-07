"use client";

import { useActionState } from "react";

import { createAppointment, type BookingState } from "@/app/(app)/appointments/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, inputClass } from "@/components/Field";

type SpaceOption = { id: string; name: string };

const initial: BookingState = {};

export function AppointmentForm({
  spaces,
  defaultStart,
  defaultEnd,
}: {
  spaces: SpaceOption[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, action] = useActionState(createAppointment, initial);

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Field label="Space" error={state.fieldErrors?.spaceId}>
        <select name="spaceId" required defaultValue={spaces[0]?.id} className={inputClass}>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title" error={state.fieldErrors?.title} hint="What is the room for?">
        <input name="title" type="text" required maxLength={120} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" error={state.fieldErrors?.startsAtLocal}>
          <input
            name="startsAtLocal"
            type="datetime-local"
            required
            defaultValue={defaultStart}
            className={inputClass}
          />
        </Field>
        <Field label="End" error={state.fieldErrors?.endsAtLocal}>
          <input
            name="endsAtLocal"
            type="datetime-local"
            required
            defaultValue={defaultEnd}
            className={inputClass}
          />
        </Field>
      </div>

      <SubmitButton>Create booking</SubmitButton>
    </form>
  );
}
