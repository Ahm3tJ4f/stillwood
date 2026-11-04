/**
 * The garden: the tree in its pot, and a focus panel with the timer under it.
 * Also used to preview one tree from the forest (a "specimen").
 */

import type { Style } from "../canvas.ts";
import { formatTotal, plural, shortDate, shortTime } from "../format.ts";
import { isGrown, sessionProgress } from "../session.ts";
import { formatClock } from "../timer.ts";
import { stageFor } from "../tree.ts";
import { drawBonsai } from "./bonsai.ts";
import { withArticle } from "../species.ts";
import {
  brandTabs,
  isTiny,
  layoutFor,
  speciesSeg,
  tinyView,
  treeMark,
  viewTabs,
} from "./chrome.ts";
import { clip, hints, meter, panel, segsWidth, writeSegs, type Seg, type Tab } from "./frame.ts";
import { glyphsFor, S, type Glyphs } from "./look.ts";
import type { Frame, GardenScene } from "./types.ts";

function percent(p: number): string {
  if (p > 0 && p < 0.01) return "<1%";
  // Floor, so 100% only shows once the tree is really done.
  return `${Math.floor(Math.max(0, Math.min(1, p)) * 100 + 1e-9)}%`;
}

/** Left and right halves of the status line. */
function statusLine(s: GardenScene, g: Glyphs): [Seg[], Seg[]] {
  const sp = { text: " " };
  const dot = { text: ` ${g.dot} `, style: S.dim };
  const progress: Seg[] = [
    speciesSeg(s.species),
    dot,
    { text: stageFor(s.progress) },
    dot,
    { text: percent(s.progress), style: S.dim },
  ];
  if (s.specimen) {
    const t = s.specimen.session;
    const grown = isGrown(t);
    return [
      [
        treeMark(g, s.species, grown),
        sp,
        speciesSeg(s.species),
        dot,
        { text: `${shortDate(t.completedAt)} ${g.dot} ${shortTime(t.startedAt)}`, style: S.strong },
      ],
      [
        {
          text: grown
            ? `${formatTotal(t.durationMs)} of focus`
            : `unfinished at ${percent(sessionProgress(t))} of ${formatTotal(t.durationMs)}`,
          style: S.dim,
        },
      ],
    ];
  }
  if (s.prompt) {
    const [question, detail] =
      s.prompt === "abandon"
        ? ["abandon this tree?", "it won't count as grown"]
        : ["quit now?", "the growing tree stays unfinished"];
    return [
      [{ text: g.ask, style: S.warn }, sp, { text: question, style: S.strong }],
      [{ text: detail, style: S.dim }],
    ];
  }
  const clock = { text: formatClock(s.remainingMs), style: S.strong };
  switch (s.phase) {
    case "idle":
      return [
        [
          { text: g.idle, style: S.dim },
          sp,
          { text: `ready to plant ${s.species.article} ` },
          speciesSeg(s.species),
        ],
        s.todayCount ? [{ text: `${plural(s.todayCount, "tree")} today`, style: S.dim }] : [],
      ];
    case "running": {
      const spin = g.spinner[Math.floor(s.time * 5) % g.spinner.length]!;
      return [
        [
          { text: spin, style: S.grow },
          sp,
          { text: "growing  " },
          clock,
          { text: " left", style: S.dim },
        ],
        progress,
      ];
    }
    case "paused":
      return [
        [
          { text: g.paused, style: S.wait },
          sp,
          { text: "paused  ", style: S.wait },
          clock,
          { text: " left", style: S.dim },
        ],
        progress,
      ];
    case "completed":
      return [
        [
          { text: g.grown, style: S.growBright },
          sp,
          speciesSeg(s.species, withArticle(s.species)),
          { text: " has grown", style: S.strong },
        ],
        [{ text: `${formatTotal(s.durationMs)} of focus`, style: S.dim }],
      ];
    case "abandoned":
      return [
        [{ text: g.abandoned, style: S.dim }, sp, { text: `abandoned at ${percent(s.progress)}` }],
        [{ text: s.kept ? "kept as an unfinished sapling" : "too short to keep", style: S.dim }],
      ];
  }
}

function meterStyle(s: GardenScene): Style {
  if (s.specimen) return isGrown(s.specimen.session) ? S.grow : S.dim;
  if (s.phase === "paused") return S.wait;
  if (s.phase === "abandoned") return S.dim;
  return S.grow;
}

/** The line set into the bottom border of the focus panel. */
function notice(s: GardenScene, g: Glyphs): Seg | null {
  if (s.notice) return { text: clip(s.notice, s.width - 8, g.ellipsis), style: S.warn };
  if (s.specimen) return { text: s.specimen.periodLabel, style: S.dim };
  const forest = `${plural(s.treeCount, "tree")} in your forest`;
  if (s.phase === "completed") {
    return { text: forest, style: S.dim };
  }
  if (s.phase === "idle" && s.treeCount > 0) return { text: forest, style: S.dim };
  return null;
}

function durationTab(s: GardenScene): Tab {
  const min = `${Math.round(s.durationMs / 60000)} min`;
  if (s.specimen) {
    return { segs: [{ text: `${s.specimen.position} of ${s.specimen.total}`, style: S.dim }] };
  }
  if (s.phase !== "idle" || s.prompt) return { segs: [{ text: min, style: S.dim }] };
  return {
    segs: [
      { text: "-", style: S.key, hit: { action: "shorter" } },
      { text: ` ${min} `, style: S.strong },
      { text: "+", style: S.key, hit: { action: "longer" } },
    ],
  };
}

function renderTiny(c: Frame, s: GardenScene, g: Glyphs): void {
  const big = s.specimen
    ? shortDate(s.specimen.session.completedAt)
    : s.phase === "idle"
      ? `${Math.round(s.durationMs / 60000)} min`
      : s.phase === "completed"
        ? "grown"
        : formatClock(s.remainingMs);
  const small = s.prompt
    ? `${s.prompt}? y/n`
    : s.specimen || s.phase === "running"
      ? stageFor(s.progress)
      : s.phase;
  tinyView(c, g, s, [[{ text: big, style: S.strong }], [{ text: small, style: S.dim }]]);
}

export function renderGarden(c: Frame, s: GardenScene): void {
  const g = glyphsFor(s.charset);
  if (isTiny(s)) return renderTiny(c, s, g);
  const L = layoutFor(s.height);
  const specimen = s.specimen;

  panel(c, g, 0, 0, s.width, L.mainH, {
    left: specimen
      ? viewTabs(g, "forest", { garden: "show-garden", forest: "back" })
      : viewTabs(g, "garden", { forest: "forest" }),
    right: brandTabs(),
  });
  const grown = specimen ? isGrown(specimen.session) : s.phase === "completed";
  drawBonsai(
    c,
    { x: 1, y: 1, w: s.width - 2, h: L.mainH - 2 },
    {
      seed: s.seed,
      species: s.species,
      progress: s.progress,
      durationMs: s.durationMs,
      withered: specimen ? !grown : s.phase === "abandoned",
      bloom: !grown ? 0 : specimen ? (s.progress >= 1 ? 1 : 0) : s.celebrate,
    },
  );

  const note = notice(s, g);
  panel(c, g, 0, L.statusY, s.width, L.statusH, {
    left: [{ segs: [{ text: specimen ? "tree" : "focus", style: S.strong }] }],
    right: [durationTab(s)],
    bottomLeft: note ? [{ segs: [note] }] : [],
  });
  const x0 = 2;
  const x1 = s.width - 2;
  const row = L.statusY + 1;
  const [left, right] = statusLine(s, g);
  const leftEnd = writeSegs(c, x0, row, left, x1);
  const rw = segsWidth(right);
  if (rw && x1 - rw >= leftEnd + 2) writeSegs(c, x1 - rw, row, right, x1);
  const value = s.phase === "idle" && !specimen ? 0 : s.progress;
  if (L.statusRows >= 2) meter(c, g, x0, row + 1, x1 - x0, value, meterStyle(s));

  hints(c, g, L.helpY, s.help);
}
