/**
 * The forest: every session is a tree.
 *
 *   day                 a walk past the day's trees, drawn like the garden tree;
 *                       pick one to open it
 *   week, month, year   the forest seen from above, grown outward from a cabin;
 *                       an overview, with time running left to right
 *
 * On the map, a few trees are drawn as big crowns and many as single symbols,
 * so the map is full at every zoom. Every tree has its species' colours.
 */

import { BOLD, type Style } from "../canvas.ts";
import { formatTotal, plural, shortDate, shortTime } from "../format.ts";
import { hash2 } from "../random.ts";
import type { Range } from "../periods.ts";
import { focusedMs, isGrown, sessionProgress, type CompletedSession } from "../session.ts";
import { drawTree, treeFor, type Area } from "./bonsai.ts";
import { SPECIES, speciesOf, type Species } from "../species.ts";
import { isTiny, layoutFor, speciesSeg, tinyView, treeMark, viewTabs } from "./chrome.ts";
import {
  centerSegs,
  clip,
  hints,
  panel,
  segsWidth,
  writeSegs,
  type Seg,
  type Tab,
} from "./frame.ts";
import { glyphsFor, S, YELLOW, type Glyphs } from "./look.ts";
import type { ForestScene, Frame } from "./types.ts";

// -- the day: a walk past real trees ------------------------------------------

/** Rows a tree stands tall in the walk: longer sessions grow taller trees. */
function walkRows(t: CompletedSession, room: number): number {
  const m = t.durationMs / 60000;
  const share = m >= 60 ? 1 : m >= 45 ? 0.9 : m >= 25 ? 0.78 : m >= 15 ? 0.65 : 0.55;
  return Math.max(Math.min(7, room), Math.round(room * share));
}

function renderWalk(c: Frame, g: Glyphs, s: ForestScene, b: Area): void {
  const ground = b.y + b.h - 2;
  const room = ground - b.y;
  const trees = s.sessions.map((t) => {
    const rows = walkRows(t, room);
    const strokes = treeFor(t.seed, rows, rows * 2 + 5);
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    for (const k of strokes) {
      minX = Math.min(minX, k.x);
      maxX = Math.max(maxX, k.x + k.text.length - 1);
      minY = Math.min(minY, k.y);
    }
    return { t, strokes, minX, maxX, minY };
  });

  // One strip of trees. Neighbours overlap a little, the way trees in a grove do.
  const pos: number[] = [];
  let end = 0;
  trees.forEach((tr, k) => {
    const overlap = Math.round((tr.maxX - tr.minX) * 0.15);
    const x = k === 0 ? -tr.minX : Math.max(end - overlap - tr.minX, pos[k - 1]! + 7);
    pos.push(x);
    end = x + tr.maxX + 1;
  });
  const left = b.x + 1;
  const right = b.x + b.w - 2;
  const width = right - left + 1;
  // The whole day when it fits; otherwise the view follows the selected tree.
  const offset =
    end <= width
      ? left + Math.floor((width - end) / 2)
      : Math.min(left, Math.max(right + 1 - end, left + Math.floor(width / 2) - pos[s.selected]!));

  for (let x = left; x <= right; x++) {
    const tuft = hash2(x - offset, 1, 3) < 0.12;
    if (tuft) c.put(x, ground, hash2(x - offset, 2, 4) < 0.5 ? "," : "'", S.grow);
    else c.put(x, ground, "_", S.dim);
  }
  const view: Area = { x: left, y: b.y, w: width, h: ground - b.y };
  trees.forEach((tr, i) => {
    const cx = pos[i]! + offset;
    if (cx + tr.maxX < left || cx + tr.minX > right) return;
    const grown = isGrown(tr.t);
    drawTree(
      c,
      cx,
      ground - 1,
      tr.strokes,
      {
        seed: tr.t.seed,
        species: speciesOf(tr.t),
        progress: sessionProgress(tr.t),
        withered: !grown,
        bloom: grown ? 1 : 0,
      },
      view,
    );
    const x0 = Math.max(left, cx + tr.minX);
    const x1 = Math.min(right, cx + tr.maxX);
    for (let y = Math.max(b.y, ground - 1 + tr.minY); y <= ground; y++)
      c.hit(x0, y, x1 - x0 + 1, { tree: i });
  });

  // Start times under the trunks; the selected one is marked and always shown.
  let free = left;
  const label = (i: number, style: Style) => {
    const text = shortTime(trees[i]!.t.startedAt);
    const x = pos[i]! + offset - Math.floor(text.length / 2);
    if (x < left || x + text.length - 1 > right) return;
    c.text(x, ground + 1, text, style);
    c.hit(x, ground + 1, text.length, { tree: i });
    free = x + text.length + 1;
  };
  trees.forEach((tr, i) => {
    const x = pos[i]! + offset - 2;
    if (i !== s.selected && x >= free) label(i, S.dim);
  });
  label(s.selected, S.key);
  const mark = pos[s.selected]! + offset;
  if (mark >= left && mark <= right) c.put(mark, ground, "^", S.key);
  if (offset < left) c.put(left, ground - 1, g.prev, S.key);
  if (offset + end - 1 > right) c.put(right, ground - 1, g.next, S.key);
}

// -- week, month and year: the map ---------------------------------------------

interface Zoom {
  /** Crown size in cells, and the free cells kept around it. */
  w: number;
  h: number;
  gapX: number;
  gapY: number;
}

const ZOOMS: Zoom[] = [
  { w: 5, h: 3, gapX: 2, gapY: 1 },
  { w: 3, h: 2, gapX: 1, gapY: 1 },
  { w: 2, h: 1, gapX: 1, gapY: 0 },
  { w: 1, h: 1, gapX: 1, gapY: 0 },
  { w: 1, h: 1, gapX: 0, gapY: 0 },
];

/** The biggest crowns that still let every tree fit on the land. */
function zoomFor(count: number, land: number): Zoom {
  for (const z of ZOOMS) if (count * (z.w + z.gapX) * (z.h + z.gapY) <= land * 0.6) return z;
  return ZOOMS.at(-1)!;
}

const spots = new Map<string, { x: number; y: number }[]>();

/**
 * Where the trees stand: the free spot nearest the cabin goes to the first
 * tree, the next one to the second, and so on, so the forest grows outward.
 * A little noise keeps the edge ragged and leaves a few clearings.
 */
function placeTrees(field: Area, count: number, z: Zoom, seed: number) {
  const key = `${field.x},${field.y},${field.w},${field.h}|${count}|${z.w}x${z.h}+${z.gapX}|${seed}`;
  const cached = spots.get(key);
  if (cached) return cached;
  const cx = field.x + field.w / 2;
  const cy = field.y + field.h / 2;
  const used = new Uint8Array(field.w * field.h);
  const mark = (x: number, y: number) => {
    if (x >= field.x && y >= field.y && x < field.x + field.w && y < field.y + field.h)
      used[(y - field.y) * field.w + (x - field.x)] = 1;
  };
  // Keep the cabin's yard clear.
  for (let y = Math.floor(cy) - 1; y <= Math.floor(cy) + 1; y++)
    for (let x = Math.floor(cx) - 2; x <= Math.floor(cx) + 2; x++) mark(x, y);
  const busy = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(field.y, y0); y < Math.min(field.y + field.h, y1); y++)
      for (let x = Math.max(field.x, x0); x < Math.min(field.x + field.w, x1); x++)
        if (used[(y - field.y) * field.w + (x - field.x)]) return true;
    return false;
  };
  const candidates: { x: number; y: number; d: number }[] = [];
  const jitter = 1 + z.w * 0.4;
  for (let y = field.y; y <= field.y + field.h - z.h; y++)
    for (let x = field.x; x <= field.x + field.w - z.w; x++) {
      const d = Math.hypot((x + z.w / 2 - cx) / 2.1, y + z.h / 2 - cy);
      candidates.push({ x, y, d: d + hash2(x, y, seed) * jitter });
    }
  candidates.sort((a, b) => a.d - b.d);
  const dense = z === ZOOMS.at(-1);
  const out: { x: number; y: number }[] = [];
  for (const p of candidates) {
    if (out.length >= count) break;
    if (!dense && hash2(p.x, p.y, seed + 1) < 0.12) continue;
    if (busy(p.x - z.gapX, p.y - z.gapY, p.x + z.w + z.gapX, p.y + z.h + z.gapY)) continue;
    for (let y = p.y; y < p.y + z.h; y++) for (let x = p.x; x < p.x + z.w; x++) mark(x, y);
    out.push({ x: p.x, y: p.y });
  }
  if (spots.size > 32) spots.clear();
  spots.set(key, out);
  return out;
}

/** Crown shapes seen from above, by width: the cells of each row that carry leaves. */
const CROWNS: Record<number, string[][]> = {
  5: [
    [" &&& ", "&&&&&", " &&& "],
    [" &&  ", "&&&&&", " &&& "],
    [" &&& ", "&&&&&", "  && "],
  ],
  3: [
    [" &&", "&&&"],
    ["&& ", "&&&"],
    ["&&&", "&& "],
  ],
  2: [["&&"]],
};

/** Colour of a crown cell: the tree's own species colours, lit on its top and left. */
function leafStyle(sp: Species, seed: number, lit: boolean, k: number): Style {
  return { fg: lit ? sp.leaf[1] : sp.leaf[0], attr: hash2(seed, k, 7) < 0.2 ? BOLD : 0 };
}

function renderMap(c: Frame, g: Glyphs, s: ForestScene, b: Area): void {
  const field: Area = { x: b.x + 1, y: b.y, w: b.w - 2, h: b.h };
  const z = zoomFor(s.sessions.length, field.w * field.h);
  const seed = Math.floor(s.period.start.getTime() / 86_400_000);
  const placed = placeTrees(field, s.sessions.length, z, seed);

  for (let y = field.y; y < field.y + field.h; y++)
    for (let x = field.x; x < field.x + field.w; x++)
      if (hash2(x, y, 33) < 0.035) c.put(x, y, hash2(x, y, 34) < 0.5 ? "," : "'", S.dim);
  const cx = field.x + Math.floor(field.w / 2);
  const cy = field.y + Math.floor(field.h / 2);
  c.put(cx, cy, g.cabin, { fg: YELLOW, attr: BOLD });

  s.sessions.forEach((t, i) => {
    const p = placed[i];
    if (!p) return;
    const sp = speciesOf(t);
    if (!isGrown(t)) {
      // A sapling that never grew stays small, whatever the zoom.
      c.put(p.x + Math.floor(z.w / 2), p.y + Math.floor(z.h / 2), g.sapling, S.dim);
      return;
    }
    if (z.w === 1) {
      c.put(p.x, p.y, sp.conifer ? g.conifer : g.tree, leafStyle(sp, t.seed, true, 0));
      return;
    }
    const shapes = CROWNS[z.w]!;
    const shape = shapes[Math.floor(hash2(t.seed, 3, 5) * shapes.length)]!;
    shape.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        // A few gaps between the leaves, never at the heart of the crown.
        const heart = dy === Math.floor(z.h / 2) && dx === Math.floor(z.w / 2);
        if (row[dx] === " " || (!heart && z.w >= 5 && hash2(t.seed, dx, dy) < 0.12)) continue;
        const lit = dy === 0 || dx === 0;
        c.put(p.x + dx, p.y + dy, "&", leafStyle(sp, t.seed, lit, dx + dy * 7));
      }
    });
  });
  const missing = s.sessions.length - placed.length;
  if (missing > 0) {
    const text = `+${missing} more`;
    c.text(field.x + field.w - text.length, field.y + field.h - 1, text, S.dim);
  }
}

/** The species on the map and how many of each, most first; then what τ and ⌂ mean. */
function mapLegend(s: ForestScene, g: Glyphs, width: number): Seg[] {
  const counts = new Map<Species, number>();
  let unfinished = 0;
  for (const t of s.sessions) {
    if (!isGrown(t)) unfinished++;
    else counts.set(speciesOf(t), (counts.get(speciesOf(t)) ?? 0) + 1);
  }
  const items: Seg[][] = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([sp, n]) => [treeMark(g, sp, true), { text: ` ${sp.name} ${n}`, style: S.dim }]);
  if (unfinished) {
    items.push([
      treeMark(g, SPECIES[0]!, false),
      { text: ` unfinished ${unfinished}`, style: S.dim },
    ]);
  }
  items.push([
    { text: g.cabin, style: { fg: YELLOW, attr: BOLD } },
    { text: " cabin", style: S.dim },
  ]);
  // As many as fit, the commonest first.
  const legend: Seg[] = [];
  let used = 0;
  for (const item of items) {
    const w = segsWidth(item) + (legend.length ? 3 : 0);
    if (used + w > width) break;
    if (legend.length) legend.push({ text: "   " });
    legend.push(...item);
    used += w;
  }
  return legend;
}

// -- the frame ---------------------------------------------------------------

function rangeTabs(active: Range): Tab[] {
  return (["day", "week", "month", "year"] as const).map((r) => ({
    segs: [
      { text: r[0]!, style: S.key },
      { text: r.slice(1), style: r === active ? S.strong : S.dim },
    ],
    hit: { action: `range-${r}` as const },
  }));
}

function header(c: Frame, g: Glyphs, s: ForestScene, b: Area): void {
  centerSegs(
    c,
    b.y,
    [
      { text: g.prev, style: S.key, hit: { action: "period-prev" } },
      { text: `  ${s.period.label}  `, style: S.strong },
      {
        text: g.next,
        style: s.hasLater ? S.key : S.dim,
        hit: s.hasLater ? { action: "period-next" } : undefined,
      },
    ],
    b.x,
    b.w,
  );
}

function periodStats(s: ForestScene, g: Glyphs): Seg[] {
  const grown = s.sessions.filter(isGrown).length;
  const unfinished = s.sessions.length - grown;
  const total = s.sessions.reduce((n, t) => n + focusedMs(t), 0);
  const segs: Seg[] = [{ text: `${grown} grown`, style: S.grow }];
  if (unfinished) segs.push({ text: ` ${g.dot} ${unfinished} unfinished`, style: S.dim });
  if (total) segs.push({ text: ` ${g.dot} ${formatTotal(total)} of focus`, style: S.dim });
  return segs;
}

/** The map's first status line: what grew in the period, and the time it took. */
function periodTotals(s: ForestScene, g: Glyphs): [Seg[], Seg[]] {
  const grown = s.sessions.filter(isGrown).length;
  const unfinished = s.sessions.length - grown;
  const total = s.sessions.reduce((n, t) => n + focusedMs(t), 0);
  const left: Seg[] = [{ text: `${grown} grown`, style: S.grow }];
  if (unfinished) left.push({ text: ` ${g.dot} ${unfinished} unfinished`, style: S.dim });
  return [left, total ? [{ text: `${formatTotal(total)} of focus`, style: S.dim }] : []];
}

function selectedLine(s: ForestScene, g: Glyphs): [Seg[], Seg[]] {
  const t = s.sessions[s.selected];
  if (!t) return [[{ text: "no trees here yet", style: S.dim }], []];
  const grown = isGrown(t);
  const sp = speciesOf(t);
  return [
    [
      treeMark(g, sp, grown),
      { text: " " },
      speciesSeg(sp),
      { text: ` ${g.dot} `, style: S.dim },
      { text: `${shortDate(t.completedAt)} ${g.dot} ${shortTime(t.startedAt)}`, style: S.strong },
    ],
    [
      {
        text: grown
          ? `${formatTotal(t.durationMs)} of focus`
          : `unfinished at ${Math.round(sessionProgress(t) * 100)}%`,
        style: S.dim,
      },
    ],
  ];
}

function renderTiny(c: Frame, s: ForestScene, g: Glyphs): void {
  const grown = s.sessions.filter(isGrown).length;
  tinyView(c, g, s, [
    [{ text: s.period.label, style: S.strong }],
    [{ text: `${plural(grown, "tree")} grown`, style: S.dim }],
  ]);
}

export function renderForest(c: Frame, s: ForestScene): void {
  const g = glyphsFor(s.charset);
  if (isTiny(s)) return renderTiny(c, s, g);
  const L = layoutFor(s.height);

  panel(c, g, 0, 0, s.width, L.mainH, {
    left: viewTabs(g, "forest", { garden: "back" }),
    right: rangeTabs(s.range),
  });
  const area: Area = { x: 1, y: 1, w: s.width - 2, h: L.mainH - 2 };
  header(c, g, s, area);
  const body: Area = { x: area.x, y: area.y + 2, w: area.w, h: area.h - 2 };

  if (s.sessions.length === 0) {
    const mid = body.y + Math.floor(body.h / 2) - 1;
    const when = s.range === "day" ? `on ${s.period.label}` : `in ${s.period.label}`;
    centerSegs(c, mid, [{ text: `nothing planted ${when}` }], body.x, body.w);
    centerSegs(
      c,
      mid + 1,
      [
        { text: "[", style: S.strong },
        { text: " earlier   ", style: S.dim },
        { text: "d w m y", style: S.strong },
        { text: " zoom", style: S.dim },
      ],
      body.x,
      body.w,
    );
  } else if (s.range === "day") renderWalk(c, g, s, body);
  else renderMap(c, g, s, body);

  const day = s.range === "day";
  panel(c, g, 0, L.statusY, s.width, L.statusH, {
    left: [{ segs: [{ text: day ? "tree" : "summary", style: S.strong }] }],
    right:
      day && s.sessions.length
        ? [{ segs: [{ text: `${s.selected + 1} of ${s.sessions.length}`, style: S.dim }] }]
        : [],
    bottomLeft: s.notice
      ? [{ segs: [{ text: clip(s.notice, s.width - 24, g.ellipsis), style: S.warn }] }]
      : [],
    bottomRight: s.sample ? [{ segs: [{ text: "sample forest", style: S.wait }] }] : [],
  });
  const x0 = 2;
  const x1 = s.width - 2;
  const row = L.statusY + 1;
  const [left, right] = day ? selectedLine(s, g) : periodTotals(s, g);
  const second = day ? periodStats(s, g) : mapLegend(s, g, x1 - x0);
  const leftEnd = writeSegs(c, x0, row, left, x1);
  const rw = segsWidth(right);
  if (rw && x1 - rw >= leftEnd + 2) writeSegs(c, x1 - rw, row, right, x1);
  if (L.statusRows >= 2) writeSegs(c, x0, row + 1, second, x1);

  hints(c, g, L.helpY, s.help);
}
