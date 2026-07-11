/** Calendar periods for the forest views: today, this week, month or year, and earlier ones. */

export type Range = "day" | "week" | "month" | "year";

export interface Period {
  range: Range;
  /** 0 = the current period, -1 the one before, and so on. */
  offset: number;
  start: Date;
  end: Date;
  label: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The period containing `now`, shifted by `offset` periods. Weeks start on Monday. */
export function periodFor(range: Range, offset: number, now: Date): Period {
  let start: Date;
  let end: Date;
  let label: string;
  if (range === "day") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    label = `${DAYS[(start.getDay() + 6) % 7]} ${MONTHS[start.getMonth()]} ${start.getDate()}`;
    if (start.getFullYear() !== now.getFullYear()) label += `, ${start.getFullYear()}`;
  } else if (range === "week") {
    const today = startOfDay(now);
    const monday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - ((today.getDay() + 6) % 7) + offset * 7,
    );
    start = monday;
    end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    label =
      start.getMonth() === last.getMonth()
        ? `${MONTHS[start.getMonth()]} ${start.getDate()} - ${last.getDate()}`
        : `${MONTHS[start.getMonth()]} ${start.getDate()} - ${MONTHS[last.getMonth()]} ${last.getDate()}`;
    if (start.getFullYear() !== now.getFullYear()) label += `, ${start.getFullYear()}`;
  } else if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    label = `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`;
  } else {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear() + 1, 0, 1);
    label = `${start.getFullYear()}`;
  }
  return { range, offset, start, end, label };
}

function daysBetween(a: Date, b: Date): number {
  // Calendar days, so a daylight-saving change does not shift a day.
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** The offset of the `range` period that holds `date`, counted from the one that holds `now`. */
export function offsetFor(range: Range, date: Date, now: Date): number {
  switch (range) {
    case "day":
      return daysBetween(now, date);
    case "week":
      return Math.round(
        (daysBetween(now, date) + ((now.getDay() + 6) % 7) - ((date.getDay() + 6) % 7)) / 7,
      );
    case "month":
      return (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
    case "year":
      return date.getFullYear() - now.getFullYear();
  }
}

export function inPeriod(iso: string, p: Period): boolean {
  const t = Date.parse(iso);
  return t >= p.start.getTime() && t < p.end.getTime();
}

export const RANGES: Range[] = ["day", "week", "month", "year"];
