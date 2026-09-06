import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
import { formatOffice, officeDayKey, officeTime } from "@/lib/tz";
import { mondayKey, addDaysKey, weekDays } from "@/lib/week";
import { SpaceFilter } from "@/components/SpaceFilter";

export const metadata: Metadata = { title: "Calendar · Faro Schedule" };

const SPACE_COLORS: Record<string, string> = {
  hall: "border-l-sky-500 bg-sky-50 dark:bg-sky-950/40",
  "meeting-room": "border-l-violet-500 bg-violet-50 dark:bg-violet-950/40",
};
const DEFAULT_COLOR = "border-l-neutral-400 bg-neutral-50 dark:bg-neutral-800/40";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; space?: string }>;
}) {
  await requireApprovedUser();
  const { start, space } = await searchParams;

  const spaces = await prisma.space.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  const activeSpace = spaces.find((s) => s.slug === space);

  const monday = /^\d{4}-\d{2}-\d{2}$/.test(start ?? "")
    ? mondayKey(new Date(`${start}T12:00:00Z`))
    : mondayKey(new Date());
  const { days, rangeStart, rangeEnd } = weekDays(monday);
  const todayKey = officeDayKey(new Date());

  const appointments = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: rangeStart, lt: rangeEnd },
      ...(activeSpace ? { spaceId: activeSpace.id } : {}),
    },
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

  const spaceParam = space ? `&space=${space}` : "";
  const prev = addDaysKey(monday, -7);
  const next = addDaysKey(monday, 7);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Week of {formatOffice(rangeStart, "d MMM yyyy")}
        </h1>
        <div className="flex items-center gap-1 text-sm">
          <Link href={`/calendar?start=${prev}${spaceParam}`} className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            ← Prev
          </Link>
          <Link href={`/calendar${space ? `?space=${space}` : ""}`} className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Today
          </Link>
          <Link href={`/calendar?start=${next}${spaceParam}`} className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Next →
          </Link>
        </div>
      </div>

      <SpaceFilter spaces={spaces} active={space} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(d.key) ?? [];
          const isToday = d.key === todayKey;
          return (
            <div
              key={d.key}
              className={
                "rounded-lg border p-2 " +
                (isToday
                  ? "border-neutral-900 dark:border-neutral-200"
                  : "border-neutral-200 dark:border-neutral-800")
              }
            >
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {formatOffice(d.utcStart, "EEE d")}
              </div>
              <div className="space-y-1.5">
                {items.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-neutral-400">—</p>
                ) : (
                  items.map((a) => (
                    <div
                      key={a.id}
                      className={
                        "rounded border-l-4 px-2 py-1.5 text-xs " +
                        (SPACE_COLORS[a.space.slug] ?? DEFAULT_COLOR)
                      }
                    >
                      <div className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                        {officeTime(a.startsAt)}–{officeTime(a.endsAt)}
                      </div>
                      <div className="font-medium">{a.title}</div>
                      <div className="text-neutral-500">
                        {a.space.name} · {a.user.name}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
