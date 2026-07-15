/** Panels, tabs, meters and the key help line: the chrome around the art. */

import type { Style } from "../canvas.ts";
import type { HelpItem } from "../input.ts";
import { S, type Glyphs } from "./look.ts";
import type { Frame, HitTarget } from "./types.ts";

/** A run of text in one style, optionally clickable. */
export interface Seg {
  text: string;
  style?: Style;
  hit?: HitTarget;
}

/** A title in a panel border, btop style: ┐title┌. */
export interface Tab {
  segs: Seg[];
  hit?: HitTarget;
}

/** Columns a string takes: one per code point, since every glyph used is one column wide. */
function columns(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/** Shorten text to `max` columns, ending it with an ellipsis when cut. */
export function clip(text: string, max: number, ellipsis: string): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, Math.max(0, max - columns(ellipsis))).join("") + ellipsis;
}

export function segsWidth(segs: Seg[]): number {
  return segs.reduce((n, s) => n + columns(s.text), 0);
}

/** Write segments from x, never past maxX. Returns the column after the text. */
export function writeSegs(c: Frame, x: number, y: number, segs: Seg[], maxX = c.width): number {
  for (const s of segs) {
    const start = x;
    for (const ch of s.text) {
      if (x >= maxX) break;
      c.put(x++, y, ch, s.style);
    }
    if (s.hit && x > start) c.hit(start, y, x - start, s.hit);
    if (x >= maxX) return x;
  }
  return x;
}

/** Write segments centred in [x0, x0 + w). Returns the start column. */
export function centerSegs(c: Frame, y: number, segs: Seg[], x0 = 0, w = c.width): number {
  const x = x0 + Math.max(0, Math.floor((w - segsWidth(segs)) / 2));
  writeSegs(c, x, y, segs, x0 + w);
  return x;
}

function tabsWidth(tabs: Tab[]): number {
  return tabs.reduce((n, t, i) => n + segsWidth(t.segs) + 2 + (i ? 1 : 0), 0);
}

function drawTabs(c: Frame, g: Glyphs, x: number, y: number, tabs: Tab[], down: boolean): void {
  const border = S.dim;
  tabs.forEach((tab, i) => {
    if (i) x++;
    c.put(x++, y, down ? g.tabLDown : g.tabL, border);
    const start = x;
    if (tab.hit) c.hit(start, y, segsWidth(tab.segs), tab.hit);
    x = writeSegs(c, x, y, tab.segs);
    c.put(x++, y, down ? g.tabRDown : g.tabR, border);
  });
}

export interface PanelTitles {
  left?: Tab[];
  right?: Tab[];
  bottomLeft?: Tab[];
  bottomRight?: Tab[];
}

/** A rounded box with btop-style titles set into its top and bottom borders. */
export function panel(
  c: Frame,
  g: Glyphs,
  x: number,
  y: number,
  w: number,
  h: number,
  titles: PanelTitles = {},
): void {
  if (w < 2 || h < 2) return;
  const border = S.dim;
  const bottom = y + h - 1;
  for (let i = 1; i < w - 1; i++) {
    c.put(x + i, y, g.h, border);
    c.put(x + i, bottom, g.h, border);
  }
  for (let j = 1; j < h - 1; j++) {
    c.put(x, y + j, g.v, border);
    c.put(x + w - 1, y + j, g.v, border);
  }
  c.put(x, y, g.tl, border);
  c.put(x + w - 1, y, g.tr, border);
  c.put(x, bottom, g.bl, border);
  c.put(x + w - 1, bottom, g.br, border);

  // Titles drop from the end until they fit; the left ones win over the right ones.
  const room = w - 4;
  const place = (left: Tab[] = [], right: Tab[] = [], row: number, down: boolean) => {
    while (left.length && tabsWidth(left) > room) left = left.slice(0, -1);
    const lw = left.length ? tabsWidth(left) + 1 : 0;
    while (right.length && tabsWidth(right) + lw > room) right = right.slice(0, -1);
    if (left.length) drawTabs(c, g, x + 2, row, left, down);
    if (right.length) drawTabs(c, g, x + w - 2 - tabsWidth(right), row, right, down);
  };
  place(titles.left, titles.right, y, false);
  place(titles.bottomLeft, titles.bottomRight, bottom, true);
}

/** A btop-style meter: filled blocks in `style`, the rest dim. */
export function meter(
  c: Frame,
  g: Glyphs,
  x: number,
  y: number,
  w: number,
  value: number,
  style: Style,
): void {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * w);
  for (let i = 0; i < w; i++) {
    if (i < filled) c.put(x + i, y, g.meter, style);
    else c.put(x + i, y, g.meterEmpty, S.dim);
  }
}

const HELP_GAP = 3;

function helpWidth(items: HelpItem[]): number {
  return items.reduce(
    (n, it, i) => n + it.key.length + 1 + it.label.length + (i ? HELP_GAP : 0),
    0,
  );
}

/** Drop trailing items (never the first) until the line fits; first try labels cut to one word. */
export function fitHelp(items: HelpItem[], maxWidth: number): HelpItem[] {
  let list = items;
  while (list.length > 1 && helpWidth(list) > maxWidth) {
    const short = list.map((it) => ({ key: it.key, label: it.label.split(" ")[0]! }));
    if (helpWidth(short) <= maxWidth) return short;
    list = list.slice(0, -1);
  }
  return list;
}

/** The key help line: keys in bold, what they do dimmed. */
export function hints(c: Frame, g: Glyphs, y: number, items: HelpItem[], x = 1): void {
  const shown = items.map((it) => ({
    key: it.key === "<-/->" ? g.arrows : it.key,
    label: it.label,
  }));
  const segs: Seg[] = [];
  fitHelp(shown, c.width - x - 1).forEach((it, i) => {
    if (i) segs.push({ text: " ".repeat(HELP_GAP) });
    segs.push({ text: it.key, style: S.strong }, { text: ` ${it.label}`, style: S.dim });
  });
  writeSegs(c, x, y, segs);
}
