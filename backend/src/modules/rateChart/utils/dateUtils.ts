/**
 * Date and Timezone Utilities for Smart Dairy (Asia/Kolkata - IST)
 *
 * IST is UTC+5:30 (no daylight saving time).
 * All rate chart effective dates operate on calendar-day semantics:
 * - effectiveFrom covers the entire starting day (from 00:00:00.000 IST)
 * - effectiveTo covers the entire ending day (until 23:59:59.999 IST)
 */

export const IST_TIMEZONE = "Asia/Kolkata";
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19,800,000 ms

export interface CalendarDateParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

/**
 * Extracts { year, month, day } in Asia/Kolkata from any Date or ISO string
 */
export function getIstDateParts(date: Date | string): CalendarDateParts {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    const [y, m, d] = date.trim().split("-").map(Number);
    return { year: y, month: m, day: d };
  }

  const d = typeof date === "string" ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(d);
  let year = 0;
  let month = 0;
  let day = 0;

  for (const p of parts) {
    if (p.type === "year") year = parseInt(p.value, 10);
    if (p.type === "month") month = parseInt(p.value, 10);
    if (p.type === "day") day = parseInt(p.value, 10);
  }

  return { year, month, day };
}

/**
 * Returns UTC timestamp corresponding to 00:00:00.000 IST on the given calendar date
 */
export function getIstStartOfDay(date: Date | string): Date {
  const { year, month, day } = getIstDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Returns UTC timestamp corresponding to 23:59:59.999 IST on the given calendar date
 */
export function getIstEndOfDay(date: Date | string): Date {
  const { year, month, day } = getIstDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - IST_OFFSET_MS);
}

/**
 * Returns UTC timestamp for 23:59:59.999 IST of the previous calendar day
 */
export function getIstDayBefore(date: Date | string): Date {
  const { year, month, day } = getIstDateParts(date);
  // Subtracting 1 day in UTC safely handles month/year rollbacks
  const prevDayUtc = new Date(Date.UTC(year, month - 1, day - 1, 23, 59, 59, 999));
  return new Date(prevDayUtc.getTime() - IST_OFFSET_MS);
}

/**
 * Formats a Date into standard "YYYY-MM-DD" representing the calendar day in Asia/Kolkata
 */
export function formatIstDate(date: Date | string): string {
  const { year, month, day } = getIstDateParts(date);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Checks if two calendar intervals overlap:
 * newFrom <= existingTo AND existingFrom <= newTo
 * A null end date is treated as open-ended (+infinity).
 */
export function checkIntervalOverlap(
  startA: Date | string,
  endA: Date | string | null,
  startB: Date | string,
  endB: Date | string | null
): boolean {
  const startA_ms = getIstStartOfDay(startA).getTime();
  const endA_ms = endA ? getIstEndOfDay(endA).getTime() : null;

  const startB_ms = getIstStartOfDay(startB).getTime();
  const endB_ms = endB ? getIstEndOfDay(endB).getTime() : null;

  const aBeforeOrDuringB = endB_ms === null || startA_ms <= endB_ms;
  const bBeforeOrDuringA = endA_ms === null || startB_ms <= endA_ms;

  return aBeforeOrDuringB && bBeforeOrDuringA;
}

/**
 * Checks if an entire calendar day (or interval) has completely expired relative to now in IST
 */
export function isPeriodExpired(end: Date | string | null, referenceNow?: number | Date): boolean {
  if (!end) return false; // Open-ended never expires
  const endOfDayMs = getIstEndOfDay(end).getTime();
  const nowMs = referenceNow
    ? (referenceNow instanceof Date ? referenceNow.getTime() : referenceNow)
    : Date.now();
  return endOfDayMs < nowMs;
}

