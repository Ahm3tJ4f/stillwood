/**
 * Draws the README images with the app's own renderer.
 *
 *   assets/banner.svg    an animated banner: trees of six species grow and bloom
 *   assets/*.gif         a walkthrough: the real app, keys pressed, time at high speed
 *   assets/species.png   the seven species
 *
 * Needs Google Chrome, Chromium or Brave for the pictures and ffmpeg for the GIFs.
 *
 *   bun run assets
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StillwoodApp } from "../src/app.ts";
import { BOLD, Canvas, DEFAULT, DIM } from "../src/canvas.ts";
import { mulberry32 } from "../src/random.ts";
import { drawBonsai } from "../src/scene/bonsai.ts";
import { speciesSeg } from "../src/scene/chrome.ts";
import { centerSegs, meter, panel, writeSegs, type Seg } from "../src/scene/frame.ts";
import { renderScene, type HitTarget } from "../src/scene/index.ts";
import { glyphsFor, S } from "../src/scene/look.ts";
import type { CompletedSession, HistoryBackend } from "../src/session.ts";
import { SPECIES, type Species } from "../src/species.ts";
import { formatClock } from "../src/timer.ts";
import { stageFor } from "../src/tree.ts";
import { sampleHistory } from "./sample-history.ts";

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

type Frame = { c: Canvas<unknown>; ms: number };

const byId = (id: string) => SPECIES.find((s) => s.id === id)!;
const color = (fg: number) => (fg === DEFAULT ? FG : PALETTE[fg]!);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// -- pictures --------------------------------------------------------------------

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
  if (!found) throw new Error("the pictures need Google Chrome, Chromium or Brave");
  return found;
}

/** Take a screenshot of one canvas. */
async function shoot(c: Canvas<unknown>, file: string, scale: number): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "stillwood-shot-"));
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
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      `--screenshot=${file}`,
      `file://${page}`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  await proc.exited;
  rmSync(dir, { recursive: true, force: true });
}

/**
 * An animated GIF from frames. Equal frames in a row become one longer frame,
 * and ffmpeg shares one palette and stores only what changes between frames.
 */
async function gif(name: string, frames: Frame[]): Promise<void> {
  const same = (a: Canvas<unknown>, b: Canvas<unknown>) =>
    a.ch.join("") === b.ch.join("") &&
    a.fg.join() === b.fg.join() &&
    a.attr.join() === b.attr.join();
  const merged: Frame[] = [];
  for (const f of frames) {
    const last = merged.at(-1);
    if (last && same(last.c, f.c)) last.ms += f.ms;
    else merged.push({ ...f });
  }
  const dir = mkdtempSync(join(tmpdir(), "stillwood-gif-"));
  const files = merged.map((_, i) => join(dir, `${String(i).padStart(3, "0")}.png`));
  // A few browsers at a time.
  for (let i = 0; i < merged.length; i += 6) {
    await Promise.all(merged.slice(i, i + 6).map((f, k) => shoot(f.c, files[i + k]!, 1.25)));
  }
  const list = merged.map((f, i) => `file '${files[i]}'\nduration ${(f.ms / 1000).toFixed(2)}`);
  writeFileSync(join(dir, "list.txt"), `${list.join("\n")}\nfile '${files.at(-1)}'\n`);
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-v",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(dir, "list.txt"),
      "-vf",
      "split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
      "-fps_mode",
      "vfr",
      "-loop",
      "0",
      join(OUT, `${name}.gif`),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await proc.exited) !== 0) throw new Error("ffmpeg could not make the GIF");
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ${OUT}/${name}.gif  (${merged.length} frames)`);
}

// -- the walkthrough ---------------------------------------------------------------

/** Drives the real app: presses keys and moves its clocks, one frame per step. */
class Take {
  focus = 0;
  anim = 0;
  frames: Frame[] = [];
  readonly app: StillwoodApp;

  constructor(history: CompletedSession[], seed: number) {
    const store: HistoryBackend = {
      load: () => ({ sessions: [...history] }),
      append: (s) => {
        history.push(s);
        return [...history];
      },
    };
    this.app = new StillwoodApp({
      timerClock: () => this.focus,
      animClock: () => this.anim,
      wallClock: () => new Date(NOW.getTime() + this.focus),
      store,
      random: mulberry32(seed),
    });
  }

  /** Show the screen for `ms`, while `focus` ms of the session go by. */
  hold(ms: number, focus = 0): void {
    this.focus += focus;
    this.anim += ms;
    this.app.tick();
    this.frames.push({ c: renderScene(this.app.scene(80, 24)), ms });
  }

  press(name: string, ms = 700): void {
    this.app.handleKey({ name, sequence: name.length === 1 ? name : undefined });
    this.hold(ms);
  }

  cut(): Frame[] {
    const out = this.frames;
    this.frames = [];
    return out;
  }
}

async function walkthrough(): Promise<void> {
  const take = new Take(sampleHistory(NOW), 66);

  // 1. Set the length and plant the seed.
  take.hold(1400);
  for (const key of ["left", "left", "right", "right", "right", "left"]) take.press(key, 650);
  take.press("space", 500);
  for (let i = 0; i < 5; i++) take.hold(260, 15_000);
  await gif("plant", take.cut());

  // 2. The tree grows while the timer counts down, then it blooms.
  for (let i = 0; i < 56; i++) take.hold(130, (25 * 60000) / 56);
  for (let i = 0; i < 8; i++) take.hold(320);
  take.hold(1800);
  await gif("grow", take.cut());

  // 3. Pause, then end a session early: that tree stays small and gray.
  take.press("space", 900);
  take.press("space", 300);
  for (let i = 0; i < 10; i++) take.hold(200, 45_000);
  take.press("space", 1500);
  take.press("space", 500);
  for (let i = 0; i < 4; i++) take.hold(200, 45_000);
  take.press("a", 1700);
  take.press("y", 2400);
  await gif("stop", take.cut());

  // 4. The forest opens on today. Pick a tree and watch it grow again.
  take.press("f", 1600);
  for (const key of ["left", "left", "left"]) take.press(key, 750);
  take.press("return", 150);
  for (let i = 0; i < 16; i++) take.hold(300);
  take.hold(1200);
  take.press("escape", 1400);
  await gif("forest", take.cut());

  // 5. Zoom out to the week, the month and the year, and move through time.
  take.press("w", 1700);
  take.press("left", 1300);
  take.press("right", 1000);
  take.press("m", 1700);
  take.press("y", 1900);
  take.press("left", 1300);
  take.press("right", 1000);
  take.press("d", 1300);
  await gif("maps", take.cut());
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

// -- the animated banner ------------------------------------------------------------

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
function animatedSvg(frames: Frame[]): string {
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
  const frames: Frame[] = [];
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
await shoot(lineup(), join(process.cwd(), OUT, "species.png"), 2);
console.log(`  ${OUT}/species.png`);
await walkthrough();
