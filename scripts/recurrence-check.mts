/**
 * Offline sanity check for the recurrence expander. Run with:
 *   npx tsx scripts/recurrence-check.mts
 */
import { expandOccurrences, MAX_OCCURRENCES } from "../lib/recurrence";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${label}` +
      (ok ? "" : `\n      got ${JSON.stringify(actual)}\n      want ${JSON.stringify(expected)}`),
  );
}

// Weekly: same weekday + clock time, every 7 days, inclusive of the end day.
check(
  "weekly, 3 weeks",
  expandOccurrences("2026-09-10T14:00", "2026-09-10T15:00", "WEEKLY", "2026-09-24").map(
    (s) => s.startLocal,
  ),
  ["2026-09-10T14:00", "2026-09-17T14:00", "2026-09-24T14:00"],
);

// Weekly rollover across a month boundary keeps the time.
check(
  "weekly across month end",
  expandOccurrences("2026-09-28T09:30", "2026-09-28T10:30", "WEEKLY", "2026-10-12").map(
    (s) => s.startLocal,
  ),
  ["2026-09-28T09:30", "2026-10-05T09:30", "2026-10-12T09:30"],
);

// Monthly on the 31st skips months without a 31st (Feb, Apr, Jun...).
check(
  "monthly on the 31st skips short months",
  expandOccurrences("2026-01-31T08:00", "2026-01-31T09:00", "MONTHLY", "2026-05-31").map(
    (s) => s.startLocal,
  ),
  ["2026-01-31T08:00", "2026-03-31T08:00", "2026-05-31T08:00"],
);

// End preserved with a duration that crosses into the next hour.
check(
  "monthly keeps the end time",
  expandOccurrences("2026-02-10T23:15", "2026-02-11T00:45", "MONTHLY", "2026-04-10").map(
    (s) => [s.startLocal, s.endLocal],
  ),
  [
    ["2026-02-10T23:15", "2026-02-11T00:45"],
    ["2026-03-10T23:15", "2026-03-11T00:45"],
    ["2026-04-10T23:15", "2026-04-11T00:45"],
  ],
);

// The hard cap wins over a far-future end date.
check(
  "weekly capped at MAX_OCCURRENCES",
  expandOccurrences("2026-01-01T10:00", "2026-01-01T11:00", "WEEKLY", "2030-01-01").length,
  MAX_OCCURRENCES,
);

console.log(failures === 0 ? "\n✓ recurrence OK" : `\n✗ ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
