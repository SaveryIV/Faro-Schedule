import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Single office timezone. All booking form times are entered and displayed in
 * this zone; the database always stores UTC (`timestamptz`).
 */
export const OFFICE_TZ = process.env.OFFICE_TZ || "America/Argentina/Buenos_Aires";

/**
 * Convert a value from an `<input type="datetime-local">` (a zone-less string
 * like "2026-09-10T14:30") into a real UTC Date, interpreting it as office-local
 * time.
 */
export function officeLocalToUtc(localValue: string): Date {
  return fromZonedTime(localValue, OFFICE_TZ);
}

/** Format a stored UTC Date for display in office-local time. */
export function formatOffice(date: Date, fmt = "EEE d MMM yyyy, HH:mm"): string {
  return formatInTimeZone(date, OFFICE_TZ, fmt);
}

/** "HH:mm" in office-local time. */
export function officeTime(date: Date): string {
  return formatInTimeZone(date, OFFICE_TZ, "HH:mm");
}

/** "yyyy-MM-dd" day key in office-local time (used to group bookings). */
export function officeDayKey(date: Date): string {
  return formatInTimeZone(date, OFFICE_TZ, "yyyy-MM-dd");
}

/**
 * Value for a `datetime-local` input representing "now" (or the given date)
 * rounded to the next 30 minutes, in office-local time.
 */
export function officeLocalInputValue(date: Date): string {
  return formatInTimeZone(date, OFFICE_TZ, "yyyy-MM-dd'T'HH:mm");
}
