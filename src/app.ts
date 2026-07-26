/**
 * Application controller: owns the timer, views, prompts and history, and
 * turns them into a Scene for the renderer. Contains no terminal code, so
 * the whole interaction model can be driven from tests.
 */

import { generateDemoForest } from "./demo-history.ts";
import { helpFor, keyToAction, type Action, type KeyLike, type Mode } from "./input.ts";
import { sameDay } from "./format.ts";
import { inPeriod, offsetFor, periodFor, RANGES, type Range } from "./periods.ts";
import { easeInOut, smoothstep } from "./random.ts";
import { hitAt } from "./scene/index.ts";
import type { Charset } from "./scene/look.ts";
import type { ForestScene, Scene } from "./scene/types.ts";
import { pickSpecies, speciesOf } from "./species.ts";
import {
  isGrown,
  newSessionId,
  sessionProgress,
  type CompletedSession,
  type HistoryBackend,
} from "./session.ts";
import {
  DEFAULT_DURATION_MIN,
  DURATION_PRESETS_MIN,
  FocusTimer,
  monotonicClock,
  type Clock,
} from "./timer.ts";

export interface AppOptions {
  /** Clock the focus timer runs on (accelerated in demo mode). */
  timerClock?: Clock;
  /** Real monotonic clock for animation. */
  animClock?: Clock;
  wallClock?: () => Date;
  store?: HistoryBackend | null;
  /** Demo: time runs this many times faster, a sample forest is shown, and nothing is saved. */
  demoFactor?: number;
  charset?: Charset;
  durationMin?: number;
  random?: () => number;
}

const NOTICE_MS = 6000;
/** Abandoned sessions shorter than this leave no sapling behind. */
const MIN_UNFINISHED_MS = 5000;
const REPLAY_MS = 4500;

export class StillwoodApp {
  readonly timer: FocusTimer;
  view: "garden" | "forest" | "tree" = "garden";
  prompt: null | "abandon" | "quit" = null;
  /** All trees, grown and unfinished, oldest first. */
  sessions: CompletedSession[] = [];
  seed: number;
  /** The forest opens on today, so a finished session is right there. */
  forestRange: Range = "day";
  periodOffset = 0;
  /** Index into the current period's trees. */
  forestSelected = 0;
  quitRequested = false;
  suspendRequested = false;

  private readonly animClock: Clock;
  private readonly wallClock: () => Date;
  private readonly store: HistoryBackend | null;
  private readonly demoFactor: number | undefined;
  private readonly charset: Charset;
  private readonly random: () => number;
  private presets: number[];
  private presetIndex: number;
  private displayed = 0;
  private lastAnim: number;
  private readonly bornAt: number;
  private completedAnim: number | null = null;
  private sessionStartedAt: Date | null = null;
  private notice: { text: string; until: number } | null = null;
  private replayStart = 0;
  /** Whether the last abandoned session was long enough to keep as a sapling. */
  private kept = false;

  constructor(opts: AppOptions = {}) {
    this.animClock = opts.animClock ?? monotonicClock;
    this.wallClock = opts.wallClock ?? (() => new Date());
    this.store = opts.store ?? null;
    this.demoFactor = opts.demoFactor;
    this.charset = opts.charset ?? "unicode";
    this.random = opts.random ?? Math.random;

    const wanted =
      opts.durationMin && opts.durationMin > 0 ? opts.durationMin : DEFAULT_DURATION_MIN;
    this.presets = [...DURATION_PRESETS_MIN];
    if (!this.presets.includes(wanted))
      this.presets = [...this.presets, wanted].sort((a, b) => a - b);
    this.presetIndex = this.presets.indexOf(wanted);
    this.timer = new FocusTimer(wanted * 60000, opts.timerClock ?? monotonicClock);
    this.seed = this.newSeed();
    this.lastAnim = this.bornAt = this.animClock();

    if (this.demoFactor) {
      // A year of sample trees, in memory only.
      this.sessions = generateDemoForest(this.wallClock());
    } else if (this.store) {
      const loaded = this.store.load();
      this.sessions = loaded.sessions;
      if (loaded.warning) this.flash(loaded.warning);
    }
  }

  private newSeed(): number {
    return 1 + Math.floor(this.random() * 999_999);
  }

  private flash(text: string): void {
    this.notice = { text, until: this.animClock() + NOTICE_MS };
  }

  get durationMin(): number {
    return this.presets[this.presetIndex]!;
  }

  get grownCount(): number {
    return this.sessions.filter(isGrown).length;
  }

  /** Trees grown today, by the wall clock. */
  get todayCount(): number {
    const today = this.wallClock();
    return this.sessions.filter((s) => isGrown(s) && sameDay(new Date(s.completedAt), today))
      .length;
  }

  // -- forest periods --------------------------------------------------------

  period() {
    return periodFor(this.forestRange, this.periodOffset, this.wallClock());
  }

  /** Trees in the currently shown period, oldest first. */
  periodSessions(): CompletedSession[] {
    const p = this.period();
    return this.sessions
      .filter((s) => inPeriod(s.completedAt, p))
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  }

  private selectLatest(): void {
    this.forestSelected = Math.max(0, this.periodSessions().length - 1);
  }

  private setRange(r: Range): void {
    if (r === this.forestRange) return;
    // Keep your place in time when zooming: the selected tree's moment, or, when
    // the shown period has no trees, the period itself.
    const current = this.periodSessions()[this.forestSelected];
    const now = this.wallClock();
    const anchor = current
      ? new Date(current.completedAt)
      : this.periodOffset === 0
        ? now
        : this.period().start;
    this.forestRange = r;
    this.periodOffset = Math.min(0, offsetFor(r, anchor, now));
    const list = this.periodSessions();
    const idx = current ? list.findIndex((s) => s.id === current.id) : -1;
    this.forestSelected = idx >= 0 ? idx : Math.max(0, list.length - 1);
  }

  // -- input -----------------------------------------------------------------

  mode(): Mode {
    if (this.prompt === "abandon") return "confirm-abandon";
    if (this.prompt === "quit") return "confirm-quit";
    if (this.view === "forest") return this.forestRange === "day" ? "forest" : "map";
    if (this.view === "tree") return "tree";
    return this.timer.phase;
  }

  handleKey(key: KeyLike): Action | null {
    const action = keyToAction(this.mode(), key);
    if (!action) return null;
    this.dispatch(action);
    return action;
  }

  /** A mouse press at a screen cell: a tree in the forest opens it, a tab or key in a border acts. */
  handleClick(x: number, y: number, width: number, height: number): void {
    if (this.prompt) return;
    const hit = hitAt(this.scene(width, height), x, y);
    if (!hit) return;
    if ("tree" in hit) {
      this.forestSelected = hit.tree;
      this.openTree();
    } else this.dispatch(hit.action);
  }

  private openTree(): void {
    if (this.periodSessions().length === 0) return;
    this.view = "tree";
    this.replayStart = this.animClock();
  }

  dispatch(action: Action): void {
    const phase = this.timer.phase;
    const count = this.periodSessions().length;
    switch (action) {
      case "start":
        if (this.timer.start()) {
          this.sessionStartedAt = this.wallClock();
          this.displayed = 0;
        }
        break;
      case "toggle-pause":
        this.timer.togglePause();
        break;
      case "abandon":
        if (phase === "running" || phase === "paused") this.prompt = "abandon";
        break;
      case "confirm":
        if (this.prompt) {
          this.abandonSession();
          if (this.prompt === "quit") this.quitRequested = true;
          this.prompt = null;
        }
        break;
      case "cancel":
        this.prompt = null;
        break;
      case "longer":
      case "shorter": {
        if (phase !== "idle") break;
        this.presetIndex = Math.max(
          0,
          Math.min(this.presets.length - 1, this.presetIndex + (action === "longer" ? 1 : -1)),
        );
        this.timer.setDuration(this.durationMin * 60000);
        break;
      }
      case "forest":
        this.view = "forest";
        this.periodOffset = 0;
        this.selectLatest();
        break;
      case "back":
        this.view = this.view === "tree" ? "forest" : "garden";
        break;
      case "show-garden":
        this.view = "garden";
        break;
      case "prev":
        if (count) this.forestSelected = Math.max(0, this.forestSelected - 1);
        if (this.view === "tree") this.replayStart = this.animClock();
        break;
      case "next":
        if (count) this.forestSelected = Math.min(count - 1, this.forestSelected + 1);
        if (this.view === "tree") this.replayStart = this.animClock();
        break;
      case "open-tree":
        this.openTree();
        break;
      case "replay":
        this.replayStart = this.animClock();
        break;
      case "range-day":
      case "range-week":
      case "range-month":
      case "range-year":
        this.setRange(action.slice(6) as Range);
        break;
      case "range-cycle":
        this.setRange(RANGES[(RANGES.indexOf(this.forestRange) + 1) % RANGES.length]!);
        break;
      case "period-prev":
        this.periodOffset--;
        this.selectLatest();
        break;
      case "period-next":
        if (this.periodOffset < 0) {
          this.periodOffset++;
          // Walking the days forward starts at the day's first tree; a map just keeps its latest.
          if (this.forestRange === "day") this.forestSelected = 0;
          else this.selectLatest();
        }
        break;
      case "new-session":
        this.timer.reset(this.durationMin * 60000);
        this.seed = this.newSeed();
        this.displayed = 0;
        this.completedAnim = null;
        this.sessionStartedAt = null;
        this.kept = false;
        break;
      case "quit":
        if (phase === "running" || phase === "paused") {
          this.view = "garden";
          this.prompt = "quit";
        } else this.quitRequested = true;
        break;
      case "force-quit":
        // Ctrl+C always exits immediately; a growing tree is kept as unfinished.
        if (phase === "running" || phase === "paused") this.abandonSession();
        this.quitRequested = true;
        break;
      case "suspend":
        this.suspendRequested = true;
        break;
    }
  }

  /** Stop the session and keep what grew as an unfinished sapling. */
  private abandonSession(): void {
    const elapsed = this.timer.elapsedMs();
    const progress = this.timer.progress();
    if (!this.timer.abandon()) return;
    this.kept = elapsed >= MIN_UNFINISHED_MS;
    if (!this.kept) return;
    this.record({
      id: newSessionId(),
      startedAt: (this.sessionStartedAt ?? this.wallClock()).toISOString(),
      completedAt: this.wallClock().toISOString(),
      durationMs: this.timer.durationMs,
      seed: this.seed,
      species: pickSpecies(this.seed).id,
      status: "abandoned",
      progress: Math.round(progress * 1000) / 1000,
    });
  }

  /** Add a tree to the forest; persisted unless in demo mode. */
  private record(session: CompletedSession): void {
    if (this.demoFactor || !this.store) {
      this.sessions = [...this.sessions, session];
      return;
    }
    try {
      this.sessions = this.store.append(session);
    } catch (err) {
      this.sessions = [...this.sessions, session];
      this.flash(`could not save history: ${(err as Error).message}`);
    }
  }

  /** Advance time-dependent state. Call once per frame. */
  tick(): void {
    const now = this.animClock();
    const dt = Math.max(0, Math.min(1, (now - this.lastAnim) / 1000));
    this.lastAnim = now;

    if (this.timer.update()) this.onCompleted(now);

    // Ease the drawn tree toward the true progress so growth (and demo jumps) animate gently.
    const target = this.timer.progress();
    if (target < this.displayed - 0.02 && this.timer.phase !== "abandoned") this.displayed = target;
    else this.displayed += (target - this.displayed) * (1 - Math.exp(-dt / 0.7));
    if (Math.abs(target - this.displayed) < 0.0005) this.displayed = target;

    if (this.notice && now > this.notice.until) this.notice = null;
  }

  private onCompleted(now: number): void {
    this.completedAnim = now;
    this.prompt = null;
    this.view = "garden";
    this.record({
      id: newSessionId(),
      startedAt: (this.sessionStartedAt ?? this.wallClock()).toISOString(),
      completedAt: this.wallClock().toISOString(),
      durationMs: this.timer.durationMs,
      seed: this.seed,
      species: pickSpecies(this.seed).id,
      status: "completed",
      progress: 1,
    });
  }

  /** Progress as currently drawn (smoothed). */
  get displayedProgress(): number {
    return this.displayed;
  }

  scene(width: number, height: number): Scene {
    const now = this.animClock();
    const time = (now - this.bornAt) / 1000;
    const base = {
      width,
      height,
      time,
      charset: this.charset,
      help: helpFor(this.mode()),
      notice: this.notice?.text,
      demoFactor: this.demoFactor,
    };
    const list = this.periodSessions();
    const selected = Math.max(0, Math.min(list.length - 1, this.forestSelected));
    const period = this.period();

    if (this.view === "tree" && !this.prompt && list[selected]) {
      // Preview one tree, replaying its growth up to where that session reached.
      const t = list[selected]!;
      const final = sessionProgress(t);
      const replay = easeInOut(Math.min(1, (now - this.replayStart) / REPLAY_MS));
      return {
        ...base,
        view: "garden",
        progress: final * replay,
        seed: t.seed,
        species: speciesOf(t),
        phase: isGrown(t) ? "completed" : "abandoned",
        durationMs: t.durationMs,
        remainingMs: 0,
        prompt: null,
        celebrate: 0,
        treeCount: this.grownCount,
        todayCount: this.todayCount,
        specimen: {
          session: t,
          position: selected + 1,
          total: list.length,
          periodLabel: period.label,
        },
      };
    }
    if ((this.view === "forest" || this.view === "tree") && !this.prompt) {
      const forest: ForestScene = {
        ...base,
        view: "forest",
        sessions: list,
        selected,
        range: this.forestRange,
        period,
        hasLater: this.periodOffset < 0,
        today: this.wallClock(),
        sample: Boolean(this.demoFactor),
      };
      return forest;
    }
    const snap = this.timer.snapshot();
    return {
      ...base,
      view: "garden",
      progress: this.displayed,
      seed: this.seed,
      species: pickSpecies(this.seed),
      phase: snap.phase,
      durationMs: snap.durationMs,
      remainingMs: snap.remainingMs,
      prompt: this.prompt,
      celebrate: this.completedAnim === null ? 0 : smoothstep(0, 2500, now - this.completedAnim),
      treeCount: this.grownCount,
      todayCount: this.todayCount,
      kept: this.kept,
    };
  }
}
