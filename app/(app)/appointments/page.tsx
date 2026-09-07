import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
import { formatOffice, officeDayKey, officeTime } from "@/lib/tz";
import { deleteAppointment } from "./actions";

export const metadata: Metadata = { title: "Reservas · Faro Schedule" };

const ROOM_DOT: Record<string, string> = {
  hall: "bg-sky-500",
  "meeting-room": "bg-violet-500",
};

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
      space: { select: { name: true, slug: true } },
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          Próximas reservas
        </h1>
        <Link
          href="/appointments/new"
          className="hidden rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 sm:inline-flex dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Nueva reserva
        </Link>
      </div>

      {created && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Reserva creada.
        </p>
      )}

      {appointments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700">
          <p className="font-medium">Todavía no hay reservas</p>
          <p className="mt-1 text-sm text-stone-500">
            Tocá Nueva reserva para reservar el Salón o la Sala de Reuniones.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {[...byDay.entries()].map(([day, items]) => (
            <section key={day}>
              <h2 className="sticky top-14 z-10 -mx-4 bg-stone-50/90 px-4 py-1.5 text-xs font-semibold tracking-wide text-stone-500 backdrop-blur sm:mx-0 sm:px-0 dark:bg-stone-950/90">
                {formatOffice(items[0].startsAt, "EEEE d 'de' MMMM")}
              </h2>
              <ul className="mt-2 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
                {items.map((a) => {
                  const canDelete =
                    a.userId === user.id || user.role !== "USER";
                  return (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 px-4 py-3.5"
                    >
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ROOM_DOT[a.space.slug] ?? "bg-stone-400"}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold tabular-nums">
                          {officeTime(a.startsAt)}–{officeTime(a.endsAt)}
                          <span className="ml-2 font-normal text-stone-500">
                            {a.space.name}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-sm text-stone-700 dark:text-stone-300">
                          {a.title}
                        </p>
                        <p className="text-xs text-stone-400">{a.user.name}</p>
                      </div>
                      {canDelete && (
                        <form action={deleteAppointment} className="shrink-0">
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            Cancelar
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
