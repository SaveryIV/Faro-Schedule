import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
import { formatOffice, officeDayKey, officeTime } from "@/lib/tz";
import { deleteAppointment } from "./actions";

export const metadata: Metadata = { title: "All bookings · Faro Schedule" };

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireApprovedUser();
  const { created } = await searchParams;

  const appointments = await prisma.appointment.findMany({
    where: { endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    include: {
      space: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  const byDay = new Map<string, typeof appointments>();
  for (const a of appointments) {
    const key = officeDayKey(a.startsAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(a);
    else byDay.set(key, [a]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Upcoming bookings</h1>
        <Link
          href="/appointments/new"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          New booking
        </Link>
      </div>

      {created && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Booking created.
        </p>
      )}

      {appointments.length === 0 ? (
        <p className="text-sm text-neutral-500">No upcoming bookings yet.</p>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, items]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-sm font-semibold text-neutral-500">
                {formatOffice(items[0].startsAt, "EEEE d MMMM yyyy")}
              </h2>
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {items.map((a) => {
                  const canDelete =
                    a.userId === user.id || user.role !== "USER";
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white px-4 py-3 text-sm dark:bg-neutral-900"
                    >
                      <span className="w-28 font-mono text-neutral-600 dark:text-neutral-400">
                        {officeTime(a.startsAt)}–{officeTime(a.endsAt)}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium dark:bg-neutral-800">
                        {a.space.name}
                      </span>
                      <span className="font-medium">{a.title}</span>
                      <span className="text-neutral-500">· {a.user.name}</span>
                      {canDelete && (
                        <form action={deleteAppointment} className="ml-auto">
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
