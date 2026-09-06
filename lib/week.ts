import { formatInTimeZone } from "date-fns-tz";

import { OFFICE_TZ, officeLocalToUtc } from "./tz";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "yyyy-MM-dd" for the Monday of the office-local week containing `date`. */
export function mondayKey(date: Date): string {
  const key = formatInTimeZone(date, OFFICE_TZ, "yyyy-MM-dd");
  // Anchor at midday UTC so ±hours of tz offset never cross a date boundary.
  const anchor = new Date(`${key}T12:00:00Z`);
  const dow = (anchor.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(anchor.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

/** Add `n` whole days to a "yyyy-MM-dd" key. */
export function addDaysKey(key: string, n: number): string {
  const anchor = new Date(`${key}T12:00:00Z`);
  return new Date(anchor.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export type WeekDay = { key: string; utcStart: Date };

/** The seven office-local days of a week, plus the UTC bounds for querying. */
export function weekDays(mondayKeyValue: string): {
  days: WeekDay[];
  rangeStart: Date;
  rangeEnd: Date;
} {
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(mondayKeyValue, i);
    days.push({ key, utcStart: officeLocalToUtc(`${key}T00:00`) });
  }
  return {
    days,
    rangeStart: days[0].utcStart,
    rangeEnd: officeLocalToUtc(`${addDaysKey(mondayKeyValue, 7)}T00:00`),
  };
}
