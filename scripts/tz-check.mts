/**
 * Offline sanity check for the timezone layer. Run with:
 *   npx tsx scripts/tz-check.mts
 * Assumes OFFICE_TZ=America/Argentina/Buenos_Aires (UTC-3, no DST).
 */
import {
  officeLocalToUtc,
  officeLocalInputValue,
  officeTime,
  officeDayKey,
} from "../lib/tz";
import { mondayKey } from "../lib/week";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${label}\n      got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

check(
  "officeLocalToUtc 10:00 -> 13:00Z",
  officeLocalToUtc("2026-09-10T10:00").toISOString(),
  "2026-09-10T13:00:00.000Z",
);
check(
  "round trip local input value",
  officeLocalInputValue(officeLocalToUtc("2026-09-10T10:00")),
  "2026-09-10T10:00",
);
check("officeTime", officeTime(officeLocalToUtc("2026-09-10T10:00")), "10:00");
check(
  "officeDayKey at 23:30 local (02:30Z next day)",
  officeDayKey(officeLocalToUtc("2026-09-10T23:30")),
  "2026-09-10",
);
check(
  "mondayKey for Sunday 23:30 local stays in same week",
  mondayKey(officeLocalToUtc("2026-09-13T23:30")),
  "2026-09-07",
);

console.log(failures === 0 ? "\n✓ TZ layer OK" : `\n✗ ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
