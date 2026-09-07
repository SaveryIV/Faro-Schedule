/**
 * Expansion of a recurring booking into its individual occurrences.
 *
 * The app materialises one real `Appointment` row per occurrence (so each one is
 * checked by the Postgres no-overlap constraint), so this only computes the
 * office-local wall-clock slots — the caller converts each with
 * `officeLocalToUtc` from `lib/tz.ts`.
 *
 * Arithmetic runs on UTC calendar parts (`Date.UTC` + `getUTC*`) so it never
 * depends on the host machine's timezone. Buenos Aires has no DST, but keeping
 * the wall-clock time literally means a future `OFFICE_TZ` with DST still books
 * "every Tuesday at 14:00" rather than drifting by an hour.
 */

export type Frequency = "WEEKLY" | "MONTHLY";

/** Hard cap on how many rows one series can create. */
export const MAX_OCCURRENCES = 52;

export type Slot = { startLocal: string; endLocal: string };

const pad = (n: number) => String(n).padStart(2, "0");

function parseLocal(value: string) {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return { y, mo, d, hh, mm };
}

function fmt(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/**
 * Expand a first occurrence (`startLocal`/`endLocal`, "yyyy-MM-ddTHH:mm") into
 * every occurrence up to and including `untilLocal` ("yyyy-MM-dd"), capped at
 * `MAX_OCCURRENCES`. The first slot returned is always the original one.
 *
 * MONTHLY skips any month that has no matching day — "monthly on the 31st" jumps
 * straight over February, matching how Google Calendar behaves.
 */
export function expandOccurrences(
  startLocal: string,
  endLocal: string,
  frequency: Frequency,
  untilLocal: string,
): Slot[] {
  const s = parseLocal(startLocal);
  const e = parseLocal(endLocal);

  const startUtcMs = Date.UTC(s.y, s.mo - 1, s.d, s.hh, s.mm);
  const durationMs = Date.UTC(e.y, e.mo - 1, e.d, e.hh, e.mm) - startUtcMs;
  if (durationMs <= 0) return [{ startLocal, endLocal }];

  const [uy, um, ud] = untilLocal.split("-").map(Number);
  const untilMs = Date.UTC(uy, um - 1, ud, 23, 59); // inclusive of the whole day

  const slots: Slot[] = [];
  for (let n = 0; slots.length < MAX_OCCURRENCES; n++) {
    const start =
      frequency === "WEEKLY"
        ? new Date(Date.UTC(s.y, s.mo - 1, s.d + 7 * n, s.hh, s.mm))
        : new Date(Date.UTC(s.y, s.mo - 1 + n, s.d, s.hh, s.mm));

    if (start.getTime() > untilMs) break;

    // MONTHLY overflow (e.g. Feb 31 -> Mar 3): skip this month entirely.
    if (frequency === "MONTHLY" && start.getUTCDate() !== s.d) continue;

    slots.push({
      startLocal: fmt(start),
      endLocal: fmt(new Date(start.getTime() + durationMs)),
    });
  }
  return slots;
}
