/**
 * A sample history for the README images: roughly a year of believable sessions
 * (busy weekdays, quiet weekends, a holiday gap, some sessions that were ended
 * early).
 */

import { mulberry32 } from "../src/random.ts";
import type { CompletedSession } from "../src/session.ts";

const DURATIONS = [25, 25, 25, 25, 50, 50, 15, 45, 30, 60, 90, 10];

export function sampleHistory(now: Date, days = 400, seed = 2026): CompletedSession[] {
  const rnd = mulberry32(seed);
  const out: CompletedSession[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // A couple of breaks where nothing was planted.
  const gaps = [
    { from: 40 + Math.floor(rnd() * 30), len: 6 + Math.floor(rnd() * 8) },
    { from: 180 + Math.floor(rnd() * 60), len: 10 + Math.floor(rnd() * 10) },
  ];
  for (let back = days; back >= 0; back--) {
    if (gaps.some((g) => back >= g.from && back < g.from + g.len)) continue;
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    // A slow build-up of the habit over the year.
    const habit = 0.6 + 0.8 * (1 - back / days);
    const mean = (weekend ? 0.7 : 2.3) * habit;
    let count = 0;
    let l = Math.exp(-mean);
    let p = rnd();
    while (p > l && count < 8) {
      count++;
      l += (Math.exp(-mean) * Math.pow(mean, count)) / factorial(count);
    }
    let hour = 8 + rnd() * 3;
    for (let i = 0; i < count; i++) {
      const minutes = DURATIONS[Math.floor(rnd() * DURATIONS.length)]!;
      const start = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(hour),
        Math.floor((hour % 1) * 60),
      );
      if (start.getTime() > now.getTime()) break;
      const abandoned = rnd() < 0.13;
      const progress = abandoned ? 0.08 + rnd() * 0.8 : 1;
      const end = new Date(start.getTime() + minutes * 60000 * progress);
      out.push({
        id: `sample-${back}-${i}`,
        startedAt: start.toISOString(),
        completedAt: end.toISOString(),
        durationMs: minutes * 60000,
        seed: 1 + Math.floor(rnd() * 999_999),
        status: abandoned ? "abandoned" : "completed",
        progress: abandoned ? Math.round(progress * 1000) / 1000 : 1,
      });
      hour += (minutes * progress) / 60 + 0.25 + rnd() * 1.5;
      if (hour > 22) break;
    }
  }
  return out;
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}
