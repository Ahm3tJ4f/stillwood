/** Draws a grown (or growing) tree in its pot. */

import { BOLD, DIM, type Style } from "../canvas.ts";
import { hash2 } from "../random.ts";
import type { Species } from "../species.ts";
import { growTree, sizeForDuration, type Ink, type Stroke, type TreeForm } from "../tree.ts";
import { BRIGHT_YELLOW, S, YELLOW } from "./look.ts";
import type { Frame } from "./types.ts";

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreeLook {
  seed: number;
  species: Species;
  /** How much of the tree is drawn, 0..1. */
  progress: number;
  /** Unfinished trees are drawn grey. */
  withered?: boolean;
  /** 0..1: blossoms opening on a finished tree. */
  bloom?: number;
}

export interface BonsaiOptions extends TreeLook {
  /** Planned session length; longer sessions grow taller trees. */
  durationMs: number;
}

/** A stroke's colour: leaves in the species' own colours, bark brown or birch white. */
function inkStyle(sp: Species, ink: Ink, bold: boolean): Style {
  const attr = bold ? BOLD : 0;
  switch (ink) {
    case "leaf":
      return { fg: sp.leaf[0], attr };
    case "leafLight":
      return { fg: sp.leaf[1], attr };
    case "wood":
      return sp.bark === "white" ? { attr: DIM } : { fg: YELLOW, attr };
    case "woodLight":
      return sp.bark === "white" ? { attr: BOLD } : { fg: BRIGHT_YELLOW, attr };
  }
}

// Trees are pure functions of (seed, space); keep the few in use.
const trees = new Map<string, Stroke[]>();

export function treeFor(seed: number, rows: number, cols: number, form: TreeForm): Stroke[] {
  const key = `${seed}:${rows}:${cols}:${form}`;
  let t = trees.get(key);
  if (!t) {
    if (trees.size > 64) trees.clear();
    t = growTree(seed, { rows, cols }, form);
    trees.set(key, t);
  }
  return t;
}

/** Width of the pot for an area: about a third of it, always odd so it centres on the trunk. */
function potWidth(w: number): number {
  return Math.max(11, Math.min(33, Math.round(w * 0.36))) | 1;
}

function potRows(h: number): number {
  return h >= 12 ? 3 : h >= 7 ? 2 : 1;
}

function drawPot(c: Frame, cx: number, top: number, width: number, rows: number, seed: number) {
  const x0 = cx - Math.floor(width / 2);
  if (rows === 1) {
    c.put(x0, top, "\\", S.dim);
    for (let i = 1; i < width - 1; i++) c.put(x0 + i, top, "~", S.soil);
    c.put(x0 + width - 1, top, "/", S.dim);
    return;
  }
  c.put(x0, top, "(", S.dim);
  for (let i = 1; i < width - 1; i++) {
    // A little moss on the soil, away from the trunk.
    const moss = Math.abs(x0 + i - cx) > 3 && hash2(i, 7, seed) < 0.1;
    if (moss) c.put(x0 + i, top, hash2(i, 9, seed) < 0.5 ? "," : "'", S.grow);
    else c.put(x0 + i, top, "~", S.soil);
  }
  c.put(x0 + width - 1, top, ")", S.dim);
  c.text(x0 + 1, top + 1, "\\" + "_".repeat(width - 4) + "/", S.dim);
  if (rows >= 3) {
    c.text(x0 + 3, top + 2, "\\_/", S.dim);
    c.text(x0 + width - 6, top + 2, "\\_/", S.dim);
  }
}

/** The tree with its pot, centred at the bottom of `area`. */
export function drawBonsai(c: Frame, area: Area, o: BonsaiOptions): void {
  const rows = potRows(area.h);
  const margin = area.h >= 14 ? 1 : 0;
  const soil = area.y + area.h - rows - margin;
  const cx = area.x + Math.floor(area.w / 2);
  drawPot(c, cx, soil, potWidth(area.w), rows, o.seed);

  const room = soil - area.y - (area.h >= 10 ? 1 : 0);
  const treeRows = Math.max(3, Math.floor(room * sizeForDuration(o.durationMs)));
  const form = o.species.conifer ? "conifer" : "broad";
  drawTree(c, cx, soil - 1, treeFor(o.seed, treeRows, area.w - 2, form), o, area);
}

/** Draw tree strokes with the trunk base at (cx, baseY), clipped to `clip`. */
export function drawTree(
  c: Frame,
  cx: number,
  baseY: number,
  strokes: Stroke[],
  o: TreeLook,
  clip: Area,
): void {
  const bloom = o.withered || o.species.bloom === null ? 0 : (o.bloom ?? 0);
  const blossom: Style = { fg: o.species.bloom ?? undefined, attr: BOLD };
  for (const s of strokes) {
    if (!(s.at < o.progress || o.progress >= 1)) continue;
    const y = baseY + s.y;
    if (y < clip.y || y >= clip.y + clip.h) continue;
    let style: Style = o.withered ? S.dim : inkStyle(o.species, s.ink, s.bold);
    let text = s.text;
    if (bloom > 0 && s.text === "&" && hash2(s.x, s.y, o.seed) < 0.045 * bloom) {
      text = "*";
      style = blossom;
    }
    for (let i = 0; i < text.length; i++) {
      const x = cx + s.x + i;
      if (x >= clip.x && x < clip.x + clip.w) c.put(x, y, text[i]!, style);
    }
  }
}
