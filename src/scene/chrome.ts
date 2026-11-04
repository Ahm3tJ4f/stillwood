/** The parts every screen shares: the screen layout, the view tabs and the small-terminal view. */

import { BOLD } from "../canvas.ts";
import type { Action } from "../input.ts";
import type { Species } from "../species.ts";
import { centerSegs, hints, type Seg, type Tab } from "./frame.ts";
import { MIN_HEIGHT, MIN_WIDTH, S, type Glyphs } from "./look.ts";
import type { CommonScene, Frame } from "./types.ts";

export interface Layout {
  /** Height of the main panel, from row 0. */
  mainH: number;
  statusY: number;
  statusH: number;
  /** Content rows inside the status panel. */
  statusRows: number;
  helpY: number;
}

export function layoutFor(height: number): Layout {
  const statusRows = height >= 18 ? 2 : 1;
  const statusH = statusRows + 2;
  const mainH = height - statusH - 1;
  return { mainH, statusY: mainH, statusH, statusRows, helpY: height - 1 };
}

export function isTiny(s: CommonScene): boolean {
  return s.width < MIN_WIDTH || s.height < MIN_HEIGHT;
}

/** ¹garden ²forest, btop style. A tab without an action is the one shown. */
export function viewTabs(
  g: Glyphs,
  active: "garden" | "forest",
  actions: { garden?: Action; forest?: Action },
): Tab[] {
  const sep = g.digits[1] === "1" ? " " : "";
  const tab = (n: number, name: "garden" | "forest", action?: Action): Tab => ({
    segs: [
      { text: g.digits[n]! + sep, style: S.key },
      { text: name, style: name === active ? S.strong : S.dim },
    ],
    hit: action ? { action } : undefined,
  });
  return [tab(1, "garden", actions.garden), tab(2, "forest", actions.forest)];
}

/** The app name, for the right end of the top border. */
export function brandTabs(): Tab[] {
  return [{ segs: [{ text: "stillwood", style: S.dim }] }];
}

/** A species' name, in its own leaf colour. */
export function speciesSeg(sp: Species, text = sp.name): Seg {
  return { text, style: { fg: sp.leaf[1], attr: BOLD } };
}

/** A tree's mark: ♣, or ♠ for a conifer, in its colours; a grey τ while unfinished. */
export function treeMark(g: Glyphs, sp: Species, grown: boolean): Seg {
  if (!grown) return { text: g.sapling, style: S.dim };
  return { text: sp.conifer ? g.conifer : g.tree, style: { fg: sp.leaf[1] } };
}

/** Below the minimum size: a few centred lines and the key help. */
export function tinyView(c: Frame, g: Glyphs, s: CommonScene, lines: Seg[][]): void {
  const rows: Seg[][] = [
    [{ text: "stillwood", style: S.dim }],
    [],
    ...lines,
    [],
    [{ text: `enlarge to ${MIN_WIDTH}x${MIN_HEIGHT}`, style: S.dim }],
  ];
  const top = Math.max(0, Math.floor((s.height - 1 - rows.length) / 2));
  rows.forEach((segs, i) => {
    if (top + i < s.height - 1) centerSegs(c, top + i, segs);
  });
  hints(c, g, s.height - 1, s.help, 0);
}
