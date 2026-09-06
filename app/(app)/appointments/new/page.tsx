import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
import { OFFICE_TZ, officeLocalInputValue } from "@/lib/tz";
import { AppointmentForm } from "@/components/AppointmentForm";

export const metadata: Metadata = { title: "New booking · Faro Schedule" };

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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New booking</h1>
        <p className="text-sm text-neutral-500">
          Times are in office time ({OFFICE_TZ}). Overlapping bookings for the
          same space are not allowed.
        </p>
      </div>
      <AppointmentForm
        spaces={spaces}
        defaultStart={officeLocalInputValue(start)}
        defaultEnd={officeLocalInputValue(end)}
      />
    </div>
  );
}
