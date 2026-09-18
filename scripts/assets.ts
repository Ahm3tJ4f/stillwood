/**
 * Draws the README images with the app's own renderer.
 *
 *   assets/banner.svg   an animated banner: trees of six species grow and bloom
 *   assets/*.png        screenshots of the garden and the forest
 *
 * The screenshots need Google Chrome, Chromium or Brave.
 *
 *   bun run assets
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOLD, Canvas, DEFAULT, DIM } from "../src/canvas.ts";
import { generateDemoForest } from "../src/demo-history.ts";
import { helpFor, type Mode } from "../src/input.ts";
import { inPeriod, periodFor, type Range } from "../src/periods.ts";
import { drawBonsai } from "../src/scene/bonsai.ts";
import { speciesSeg } from "../src/scene/chrome.ts";
import { centerSegs, meter, panel, writeSegs, type Seg } from "../src/scene/frame.ts";
import { renderScene, type GardenScene, type HitTarget } from "../src/scene/index.ts";
import { glyphsFor, S } from "../src/scene/look.ts";
import { SPECIES, type Species } from "../src/species.ts";
import { formatClock } from "../src/timer.ts";
import { stageFor } from "../src/tree.ts";

const OUT = "assets";
/** Tango, a common terminal palette, on a dark background. */
const PALETTE = [
  "#2e3436",
  "#cc0000",
  "#4e9a06",
  "#c4a000",
  "#3465a4",
  "#75507b",
  "#06989a",
  "#d3d7cf",
  "#555753",
  "#ef2929",
  "#8ae234",
  "#fce94f",
  "#729fcf",
  "#ad7fa8",
  "#34e2e2",
  "#eeeeec",
];
const FG = "#d3d7cf";
const BG = "#16181a";
const NOW = new Date(2026, 8, 23, 18, 0);
const g = glyphsFor("unicode");

const byId = (id: string) => SPECIES.find((s) => s.id === id)!;
const color = (fg: number) => (fg === DEFAULT ? FG : PALETTE[fg]!);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// -- screenshots ---------------------------------------------------------------

function html(c: Canvas<unknown>): string {
  let body = "";
  for (let y = 0; y < c.height; y++) {
    let row = "";
    for (let x = 0; x < c.width; x++) {
      const i = y * c.width + x;
      const a = c.attr[i]!;
      const css = [`color:${color(c.fg[i]!)}`];
      if (a & BOLD) css.push("font-weight:bold");
      if (a & DIM) css.push("opacity:0.55");
      row += `<span style="${css.join(";")}">${escape(c.ch[i]!)}</span>`;
    }
    body += `<div>${row}</div>`;
  }
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:${BG}}
.t{font:16px/20px Menlo,"JetBrains Mono","DejaVu Sans Mono",monospace;white-space:pre;padding:12px 14px}
.t span{display:inline-block;width:1ch;height:20px;overflow:hidden;vertical-align:top}
</style><div class="t">${body}</div>`;
}

function browser(): string {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("screenshots need Google Chrome, Chromium or Brave");
  return found;
}

async function screenshot(name: string, c: Canvas<unknown>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "stillwood-assets-"));
  const page = join(dir, "page.html");
  writeFileSync(page, html(c));
  // One column of 16px Menlo is 9.63px; the page adds 14px and 12px of padding.
  const width = Math.ceil(c.width * 9.63 + 28);
  const height = c.height * 20 + 24;
  const proc = Bun.spawn(
    [
      browser(),
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${width},${height}`,
      `--screenshot=${join(process.cwd(), OUT, `${name}.png`)}`,
      `file://${page}`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  await proc.exited;
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ${OUT}/${name}.png`);
}

function garden(extra: Partial<GardenScene>): GardenScene {
  return {
    view: "garden",
    width: 80,
    height: 24,
    time: 2,
    charset: "unicode",
    help: helpFor("running"),
    progress: 0.6,
    seed: 11,
    species: byId("maple"),
    phase: "running",
    durationMs: 25 * 60000,
    remainingMs: 10 * 60000,
    prompt: null,
    celebrate: 0,
    treeCount: 41,
    todayCount: 2,
    ...extra,
  };
}

function forest(range: Range, width = 80, height = 24) {
  const period = periodFor(range, 0, NOW);
  const sessions = generateDemoForest(NOW)
    .filter((s) => inPeriod(s.completedAt, period))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const mode: Mode = range === "day" ? "forest" : "map";
  return renderScene({
    view: "forest",
    width,
    height,
    time: 2,
    charset: "unicode",
    help: helpFor(mode),
    sessions,
    selected: sessions.length - 1,
    range,
    period,
    hasLater: false,
    today: NOW,
  });
}

/** All seven species side by side, grown, each with its name under its pot. */
function lineup(): Canvas<HitTarget> {
  const each = 20;
  const c = new Canvas<HitTarget>(SPECIES.length * each + 4, 19);
  panel(c, g, 0, 0, c.width, c.height, {
    left: [{ segs: [{ text: "species", style: S.strong }] }],
  });
  SPECIES.forEach((sp, i) => {
    const x = 2 + i * each;
    drawBonsai(
      c,
      { x, y: 1, w: each, h: 15 },
      {
        seed: 101 + i * 7,
        species: sp,
        progress: 1,
        durationMs: 50 * 60000,
        bloom: 1,
      },
    );
    centerSegs(c, 16, [speciesSeg(sp)], x, each);
  });
  return c;
}

// -- the animated banner --------------------------------------------------------

const WORDMARK = [
  "     _   _ _ _                         _",
  " ___| |_(_) | |_      _____   ___   __| |",
  "/ __| __| | | \\ \\ /\\ / / _ \\ / _ \\ / _` |",
  "\\__ \\ |_| | | |\\ V  V / (_) | (_) | (_| |",
  "|___/\\__|_|_|_| \\_/\\_/ \\___/ \\___/ \\__,_|",
];

const SHOWCASE: [string, number][] = [
  ["maple", 11],
  ["cherry", 23],
  ["oak", 7],
  ["spruce", 31],
  ["birch", 5],
  ["jacaranda", 19],
];

function bannerFrame(sp: Species, seed: number, progress: number, bloom: number, tick: number) {
  const c = new Canvas<HitTarget>(96, 18);
  panel(c, g, 0, 0, c.width, c.height, {
    left: [{ segs: [{ text: "stillwood", style: S.strong }] }],
    right: [{ segs: [{ text: "a quiet focus timer", style: S.dim }] }],
  });
  WORDMARK.forEach((row, i) => c.text(4, 3 + i, row, S.strong));
  c.text(4, 9, "plant a seed and work. an ascii bonsai grows", S.dim);
  c.text(4, 10, "while you focus, in your own terminal.", S.dim);
  const grown = progress >= 1;
  const status: Seg[] = grown
    ? [{ text: `${g.grown} `, style: S.growBright }, speciesSeg(sp, `${sp.article} ${sp.name}`)]
    : [
        { text: `${g.spinner[tick % g.spinner.length]} `, style: S.grow },
        { text: "growing  " },
        { text: formatClock(25 * 60000 * (1 - progress)), style: S.strong },
        { text: " left", style: S.dim },
      ];
  if (grown) status.push({ text: " has grown", style: S.strong });
  writeSegs(c, 4, 12, status);
  writeSegs(c, 4, 13, [
    speciesSeg(sp),
    { text: ` ${g.dot} ${stageFor(progress)} ${g.dot} `, style: S.dim },
    { text: `${Math.floor(progress * 100)}%`, style: S.dim },
  ]);
  meter(c, g, 4, 14, 44, progress, S.grow);
  drawBonsai(
    c,
    { x: 54, y: 1, w: 40, h: 16 },
    {
      seed,
      species: sp,
      progress,
      durationMs: 50 * 60000,
      bloom,
    },
  );
  return c;
}

/**
 * An animated SVG from frames. Each glyph is written once, with the time window
 * in which it shows, so the file stays small. Runs of glyphs are stretched to
 * their exact cell width, so the art lines up in any monospace font.
 */
function animatedSvg(frames: { c: Canvas<unknown>; ms: number }[]): string {
  const first = frames[0]!.c;
  const W = first.width;
  const H = first.height;
  const cw = 8.4;
  const rh = 17;
  const pad = 14;
  const total = frames.reduce((n, f) => n + f.ms, 0);
  const starts: number[] = [];
  frames.reduce((t, f) => (starts.push(t), t + f.ms), 0);
  const at = (frame: number) => (frame >= frames.length ? total : starts[frame]!);

  // Spans of frames in which a cell keeps the same glyph and style.
  type Span = { x: number; y: number; ch: string; key: string; from: number; to: number };
  const spans: Span[] = [];
  for (let i = 0; i < W * H; i++) {
    let open: Span | null = null;
    frames.forEach(({ c }, f) => {
      const ch = c.ch[i]!;
      const key = `${c.fg[i]}|${c.attr[i]}`;
      if (open && (open.ch !== ch || open.key !== key)) {
        open.to = f;
        open = null;
      }
      if (!open && ch !== " ") {
        open = { x: i % W, y: Math.floor(i / W), ch, key, from: f, to: frames.length };
        spans.push(open);
      }
    });
  }

  const windows = new Map<string, Span[]>();
  for (const s of spans) {
    const k = `${s.from}-${s.to}`;
    if (!windows.has(k)) windows.set(k, []);
    windows.get(k)!.push(s);
  }
  const pct = (ms: number) => `${((ms / total) * 100).toFixed(3)}%`;
  let css = "";
  let body = "";
  let id = 0;
  for (const [k, list] of windows) {
    const [from, to] = k.split("-").map(Number) as [number, number];
    const always = from === 0 && to === frames.length;
    let cls = "";
    if (!always) {
      cls = ` class="w${id}"`;
      const steps = [from === 0 ? "0%{opacity:1}" : `0%{opacity:0}${pct(at(from))}{opacity:1}`];
      if (to < frames.length) steps.push(`${pct(at(to))}{opacity:0}`);
      css += `.w${id}{opacity:0;animation:k${id} ${total}ms step-end infinite}@keyframes k${id}{${steps.join("")}}`;
      id++;
    }
    // Contiguous glyphs of one row and style become one stretched run.
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    let runs = "";
    for (let j = 0; j < list.length;) {
      const s = list[j]!;
      let text = s.ch;
      let n = 1;
      while (
        j + n < list.length &&
        list[j + n]!.y === s.y &&
        list[j + n]!.x === s.x + n &&
        list[j + n]!.key === s.key
      ) {
        text += list[j + n]!.ch;
        n++;
      }
      const [fg, attr] = s.key.split("|").map(Number) as [number, number];
      const style = [`fill:${color(fg)}`];
      if (attr & BOLD) style.push("font-weight:700");
      if (attr & DIM) style.push("fill-opacity:.55");
      const x = (pad + s.x * cw).toFixed(1);
      const y = (pad + s.y * rh + rh * 0.78).toFixed(1);
      runs += `<text x="${x}" y="${y}" textLength="${(n * cw).toFixed(1)}" lengthAdjust="spacingAndGlyphs" style="${style.join(";")}">${escape(text)}</text>`;
      j += n;
    }
    body += `<g${cls}>${runs}</g>`;
  }
  const width = Math.ceil(W * cw + pad * 2);
  const height = Math.ceil(H * rh + pad * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="stillwood: trees grow in a terminal">
<style>text{font-family:"SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;font-size:14px;white-space:pre}${css}</style>
<rect width="${width}" height="${height}" rx="10" fill="${BG}"/>${body}</svg>
`;
}

function banner(): string {
  const frames: { c: Canvas<unknown>; ms: number }[] = [];
  let tick = 0;
  for (const [id, seed] of SHOWCASE) {
    const sp = byId(id);
    for (let k = 1; k <= 16; k++)
      frames.push({ c: bannerFrame(sp, seed, k / 17, 0, tick++), ms: 260 });
    frames.push({ c: bannerFrame(sp, seed, 1, 0.5, tick), ms: 260 });
    frames.push({ c: bannerFrame(sp, seed, 1, 1, tick), ms: 2400 });
  }
  return animatedSvg(frames);
}

// -- main ----------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "banner.svg"), banner());
console.log(`  ${OUT}/banner.svg`);
await screenshot("garden", renderScene(garden({})));
await screenshot(
  "grown",
  renderScene(
    garden({
      phase: "completed",
      progress: 1,
      celebrate: 1,
      species: byId("cherry"),
      seed: 23,
      help: helpFor("completed"),
    }),
  ),
);
await screenshot("species", lineup());
await screenshot("day", forest("day"));
await screenshot("week", forest("week"));
await screenshot("month", forest("month"));
await screenshot("year", forest("year"));
