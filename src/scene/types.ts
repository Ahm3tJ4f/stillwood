import type { Canvas } from "../canvas.ts";
import type { Action, HelpItem } from "../input.ts";
import type { Period, Range } from "../periods.ts";
import type { CompletedSession } from "../session.ts";
import type { Species } from "../species.ts";
import type { TimerPhase } from "../timer.ts";
import type { Charset } from "./look.ts";

export interface CommonScene {
  width: number;
  height: number;
  /** Seconds, drives the spinner only. */
  time: number;
  charset: Charset;
  help: HelpItem[];
  notice?: string;
}

export interface GardenScene extends CommonScene {
  view: "garden";
  /** Displayed (smoothed) growth progress 0..1. */
  progress: number;
  seed: number;
  species: Species;
  phase: TimerPhase;
  durationMs: number;
  remainingMs: number;
  prompt: null | "abandon" | "quit";
  /** 0..1 ramp after completion: the blossoms open. */
  celebrate: number;
  treeCount: number;
  todayCount: number;
  /** After abandoning: whether the sapling was kept (sessions under 5 seconds are not). */
  kept?: boolean;
  /** Set when previewing a tree from the forest instead of the live session. */
  specimen?: { session: CompletedSession; position: number; total: number; periodLabel: string };
}

export interface ForestScene extends CommonScene {
  view: "forest";
  /** Trees in the shown period, oldest first. */
  sessions: CompletedSession[];
  selected: number;
  range: Range;
  period: Period;
  /** False for the current period (the future has no trees yet). */
  hasLater: boolean;
  /** Today, to mark it and to leave future days empty. */
  today: Date;
}

export type Scene = GardenScene | ForestScene;

/** What a click on a screen cell does. */
export type HitTarget = { tree: number } | { action: Action };

export type Frame = Canvas<HitTarget>;
