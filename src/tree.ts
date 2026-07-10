/**
 * ASCII bonsai grower in the spirit of cbonsai (https://gitlab.com/jallbrit/cbonsai).
 * This is an independent implementation, not a port: a trunk climbs from the
 * soil in a slow S-curve, limbs reach out to alternating sides, and every limb
 * ends in a ragged cluster of `&` leaves.
 *
 * Every stroke has a growth time `at` (0..1). Drawing the strokes with
 * `at < progress` draws the tree at that point of its growth. Limbs grow at the
 * same time as the trunk, so a half-grown tree looks like a small tree, not
 * half a tree.
 */

import { mulberry32 } from "./random.ts";

export type Ink = "wood" | "woodLight" | "leaf" | "leafLight";

export interface Stroke {
  /** Column offset from the trunk base. */
  x: number;
  /** Row offset from the row just above the soil; negative is up. */
  y: number;
  text: string;
  ink: Ink;
  bold: boolean;
  /** Growth time, 0..1. */
  at: number;
}

/** Room for the tree above the soil. */
export interface TreeSpace {
  rows: number;
  cols: number;
}

export const STAGES = [
  { from: 0, name: "seed" },
  { from: 0.04, name: "sprout" },
  { from: 0.15, name: "sapling" },
  { from: 0.35, name: "young tree" },
  { from: 0.55, name: "shaping" },
  { from: 0.8, name: "maturing" },
  { from: 1, name: "grown" },
] as const;

export type StageName = (typeof STAGES)[number]["name"];

export function stageFor(progress: number): StageName {
  let name: StageName = "seed";
  for (const s of STAGES) if (progress >= s.from) name = s.name;
  return name;
}

/** Longer sessions grow taller trees: 5 minutes uses 60% of the room, 30 minutes and more all of it. */
export function sizeForDuration(durationMs: number): number {
  const minutes = durationMs / 60000;
  return 0.6 + 0.4 * Math.max(0, Math.min(1, (minutes - 5) / 25));
}

interface Raw {
  t: number;
  order: number;
  x: number;
  y: number;
  text: string;
  ink: Ink;
  bold: boolean;
}

class Grower {
  readonly marks: Raw[] = [];
  private order = 0;
  private readonly rnd: () => number;

  constructor(seed: number) {
    this.rnd = mulberry32(Math.imul(seed | 0, 2654435761) >>> 0);
  }

  random(): number {
    return this.rnd();
  }

  chance(p: number): boolean {
    return this.rnd() < p;
  }

  int(lo: number, hi: number): number {
    return lo + Math.floor(this.rnd() * (hi - lo + 1));
  }

  mark(t: number, x: number, y: number, text: string, ink: Ink, bold: boolean): void {
    this.marks.push({ t, order: this.order++, x, y, text, ink, bold });
  }

  /** Bark alternates between plain and bright wood, like light catching it. */
  wood(t: number, x: number, y: number, text: string): void {
    const light = this.chance(0.5);
    this.mark(t, x, y, text, light ? "woodLight" : "wood", light);
  }

  leaf(t: number, x: number, y: number, lit: boolean): void {
    const light = this.chance(lit ? 0.7 : 0.25);
    this.mark(t, x, y, "&", light ? "leafLight" : "leaf", this.chance(0.2));
  }

  /**
   * A cluster of leaves around (cx, cy): a dense core with a flat underside,
   * like a bonsai foliage pad, and a ragged fringe from a few wandering sprigs.
   * Leaves appear from the centre outward, so the cluster grows in.
   */
  foliage(t: number, cx: number, cy: number, rx: number, ry: number): void {
    const down = Math.max(1, Math.round(ry * 0.5));
    for (let y = cy - ry; y <= cy + down; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const nx = (x - cx) / (rx + 0.5);
        const ny = (y - cy) / (y < cy ? ry + 0.5 : down + 0.5);
        const d = Math.hypot(nx, ny);
        if (d > 1 || !this.chance(d < 0.6 ? 0.92 : 1.3 - d)) continue;
        this.leaf(t + d * 2, x, y, y <= cy);
      }
    }
    const sprigs = Math.max(2, Math.round(rx * 0.8));
    for (let k = 0; k < sprigs; k++) {
      let x = cx;
      let y = cy;
      const steps = this.int(2, 2 + rx);
      for (let s = 1; s <= steps; s++) {
        x += this.int(-2, 2);
        y += this.int(-1, 1);
        // Stay near the cluster: wander back toward its centre when far out.
        if (Math.abs(x - cx) > rx * 1.4) x -= Math.sign(x - cx) * 2;
        if (y < cy - ry - 1 || y > cy + down) y = cy;
        this.leaf(t + 1.5 + s * 0.4, x, y, y <= cy);
      }
    }
  }

  /** A limb reaching out to one side, with a twig or two, ending in foliage. */
  limb(t: number, x: number, y: number, side: -1 | 1, reach: number, rx: number, ry: number): void {
    const rising = side > 0 ? "/" : "\\";
    for (let step = 0; step < reach; step++) {
      // Limbs grow a little faster than the trunk climbs.
      t += 0.7;
      const rise = step > 0 && this.chance(step < reach / 2 ? 0.25 : 0.5);
      if (rise) {
        y -= 1;
        x += side;
        this.wood(t, x, y, rising);
      } else {
        x += side;
        this.wood(t, x, y, this.chance(0.8) ? "_" : "~");
      }
      // Leaves come out along the limb as it grows, so a young tree is already green.
      if (step >= 1 && this.chance(0.35)) this.leaf(t + 0.5, x + this.int(-1, 1), y - 1, true);
      if (step >= 2 && step < reach - 2 && this.chance(0.2)) {
        this.wood(t + 1, x, y - 1, this.chance(0.5) ? "|" : rising);
        this.foliage(t + 2, x, y - 2, Math.max(1, rx - 2), 1);
      }
    }
    this.foliage(t + 1, x + side, y - 1, rx, ry);
  }
}

/**
 * Grow one tree. The same seed and space always give the same tree.
 * Strokes that would fall outside the space are dropped.
 */
export function growTree(seed: number, space: TreeSpace): Stroke[] {
  const rows = Math.max(3, Math.floor(space.rows));
  const cols = Math.max(9, Math.floor(space.cols));
  const half = Math.floor((cols - 1) / 2);
  const g = new Grower(seed);

  const crown = rows >= 16 ? 3 : rows >= 9 ? 2 : 1;
  const climb = Math.max(
    2,
    Math.min(rows - 2, rows - crown - 2 - g.int(0, Math.round(rows * 0.12))),
  );

  // The trunk follows a slow S-curve (the moyogi style), starting at the base.
  const amp = Math.max(1, Math.min(half * 0.22, climb * 0.3)) * (0.6 + 0.4 * g.random());
  const waves = 1 + g.random() * 0.7;
  const phase = (g.chance(0.5) ? 1 : -1) * (0.3 + g.random() * 0.4);
  const sway = (row: number) =>
    Math.round(amp * (Math.sin((row / climb) * Math.PI * waves + phase) - Math.sin(phase)));

  const thickRows = Math.max(1, Math.round(climb * 0.45));
  g.wood(0, -2, 0, "_/|\\_");

  const limbs: { t: number; x: number; y: number; side: -1 | 1; height: number }[] = [];
  let side: -1 | 1 = g.chance(0.5) ? -1 : 1;
  let nextLimb = Math.max(2, Math.round(climb * 0.3));
  let x = 0;
  let y = 0;
  let t = 0;

  for (let row = 1; row <= climb; row++) {
    const target = sway(row);
    const thick = row <= thickRows;
    // A big sideways step becomes a short horizontal run of bark.
    while (Math.abs(target - x) > 1) {
      t += 0.5;
      x += Math.sign(target - x);
      g.wood(t, x, y, thick ? "~~" : "~");
    }
    const dx = target - x;
    x = target;
    y -= 1;
    t += 1;
    const edge = dx < 0 ? "\\" : dx > 0 ? "/" : "|";
    if (thick) g.wood(t, x, y, g.chance(0.6) ? edge + "|" : edge + edge);
    else g.wood(t, x, y, edge);

    if (row === nextLimb && row < climb - 1) {
      limbs.push({ t, x: side > 0 ? x + (thick ? 1 : 0) : x, y, side, height: row / climb });
      side = side > 0 ? -1 : 1;
      nextLimb = row + g.int(2, 3);
    }
  }

  const ry = rows >= 14 ? 2 : 1;
  for (const l of limbs) {
    // Lower limbs reach further. Every limb and its foliage stay inside the space.
    const rx = Math.max(2, Math.min(7, Math.round(cols * 0.08 * (1.25 - l.height * 0.5))));
    const room = half - Math.abs(l.x) - rx - 2;
    const want = Math.round(cols * (0.2 - l.height * 0.1) * (0.7 + g.random() * 0.5));
    g.limb(l.t, l.x, l.y, l.side, Math.max(1, Math.min(room, want)), rx, ry);
  }

  const apexRx = Math.max(2, Math.min(9, Math.round(cols * 0.1)));
  g.foliage(t + 1, x, y - crown + 1, apexRx, crown);

  // Strokes come in growth order at a steady pace, so something grows every few seconds.
  const kept = g.marks
    .filter((m) => m.y <= 0 && m.y > -rows && m.x >= -half && m.x + m.text.length - 1 <= half)
    .sort((a, b) => a.t - b.t || a.order - b.order);
  return kept.map((m, i) => ({
    x: m.x,
    y: m.y,
    text: m.text,
    ink: m.ink,
    bold: m.bold,
    at: i / kept.length,
  }));
}
