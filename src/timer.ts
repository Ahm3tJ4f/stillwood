/**
 * Focus timer state machine.
 *
 * Elapsed time is always derived from a monotonic clock:
 *   elapsed = accumulated + (running ? now - segmentStart : 0)
 * so slow frames, missed ticks or a suspended process never distort it.
 * The clock is injected, which keeps the machine deterministic in tests.
 */

export type Clock = () => number;

export const monotonicClock: Clock = () => performance.now();

/** Wraps a clock so time passes `factor` times faster (demo mode). */
export function acceleratedClock(base: Clock, factor: number): Clock {
  const origin = base();
  return () => origin + (base() - origin) * factor;
}

export type TimerPhase = "idle" | "running" | "paused" | "completed" | "abandoned";

export interface TimerSnapshot {
  phase: TimerPhase;
  durationMs: number;
  elapsedMs: number;
  remainingMs: number;
  progress: number;
}

export class FocusTimer {
  private _phase: TimerPhase = "idle";
  private _durationMs: number;
  private accumulatedMs = 0;
  private segmentStart = 0;
  private readonly now: Clock;

  constructor(durationMs: number, now: Clock = monotonicClock) {
    if (!(durationMs > 0)) throw new Error("duration must be positive");
    this._durationMs = durationMs;
    this.now = now;
  }

  get phase(): TimerPhase {
    this.update();
    return this._phase;
  }

  get durationMs(): number {
    return this._durationMs;
  }

  /** Duration can only change before a session starts. */
  setDuration(ms: number): boolean {
    if (this._phase !== "idle" || !(ms > 0)) return false;
    this._durationMs = ms;
    return true;
  }

  start(): boolean {
    if (this._phase !== "idle") return false;
    this.accumulatedMs = 0;
    this.segmentStart = this.now();
    this._phase = "running";
    return true;
  }

  pause(): boolean {
    if (this.update() || this._phase !== "running") return false;
    this.accumulatedMs += this.now() - this.segmentStart;
    this._phase = "paused";
    return true;
  }

  resume(): boolean {
    if (this._phase !== "paused") return false;
    this.segmentStart = this.now();
    this._phase = "running";
    return true;
  }

  togglePause(): boolean {
    return this._phase === "paused" ? this.resume() : this.pause();
  }

  /** Give up on the current session. Never counts as completed. */
  abandon(): boolean {
    this.update();
    if (this._phase !== "running" && this._phase !== "paused") return false;
    this.accumulatedMs = this.rawElapsed();
    this._phase = "abandoned";
    return true;
  }

  /** Return to idle, ready for the next session. */
  reset(durationMs = this._durationMs): void {
    this._phase = "idle";
    this.accumulatedMs = 0;
    this._durationMs = durationMs > 0 ? durationMs : this._durationMs;
  }

  private rawElapsed(): number {
    const live = this._phase === "running" ? this.now() - this.segmentStart : 0;
    return Math.max(0, this.accumulatedMs + live);
  }

  /**
   * Advance the state machine. Returns true exactly once, on the call that
   * observes the session finishing.
   */
  update(): boolean {
    if (this._phase === "running" && this.rawElapsed() >= this._durationMs) {
      this.accumulatedMs = this._durationMs;
      this._phase = "completed";
      return true;
    }
    return false;
  }

  elapsedMs(): number {
    if (this._phase === "idle") return 0;
    if (this._phase === "completed") return this._durationMs;
    return Math.min(this._durationMs, this.rawElapsed());
  }

  remainingMs(): number {
    return Math.max(0, this._durationMs - this.elapsedMs());
  }

  progress(): number {
    return Math.min(1, this.elapsedMs() / this._durationMs);
  }

  snapshot(): TimerSnapshot {
    this.update();
    return {
      phase: this._phase,
      durationMs: this._durationMs,
      elapsedMs: this.elapsedMs(),
      remainingMs: this.remainingMs(),
      progress: this.progress(),
    };
  }
}

/** mm:ss, or h:mm:ss for long sessions. Rounds up so 0:00 only shows at the end. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

export const DURATION_PRESETS_MIN = [1, 5, 10, 15, 20, 25, 30, 45, 50, 60, 90] as const;
export const DEFAULT_DURATION_MIN = 25;
