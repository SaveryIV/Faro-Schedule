import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
import { OFFICE_TZ, officeLocalInputValue } from "@/lib/tz";
import { AppointmentForm } from "@/components/AppointmentForm";

export const metadata: Metadata = { title: "Nueva reserva · Faro Schedule" };

export default async function NewAppointmentPage() {
  await requireApprovedUser();

  const spaces = await prisma.space.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Default: next half hour → +1 hour, shown in office-local time.
  const now = new Date();
  const start = new Date(Math.ceil(now.getTime() / (30 * 60_000)) * 30 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          Nueva reserva
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Los horarios son de la oficina ({OFFICE_TZ}). Dos reservas no pueden
          superponerse en la misma sala.
        </p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 dark:border-stone-800 dark:bg-stone-900">
        <AppointmentForm
          spaces={spaces}
          defaultStart={officeLocalInputValue(start)}
          defaultEnd={officeLocalInputValue(end)}
        />
      </div>
    </div>
  );
}
