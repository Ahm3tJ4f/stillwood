/** Short date, time and duration labels. */

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** Monday first, like the forest's weeks. */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS[weekdayOf(d)]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatTotal(ms: number): string {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
