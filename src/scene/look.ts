/**
 * The look: terminal palette colours and glyph sets. Only the 16 standard
 * colours are used, the way cbonsai does it, so every terminal theme works.
 */

import { BOLD, DIM, type Style } from "../canvas.ts";

export type Charset = "unicode" | "ascii";

/** Palette indices. Bright variants are 8 higher. */
const RED = 1;
const GREEN = 2;
export const YELLOW = 3;
const BRIGHT_GREEN = 10;
export const BRIGHT_YELLOW = 11;

export const S = {
  text: {} as Style,
  strong: { attr: BOLD } as Style,
  dim: { attr: DIM } as Style,
  key: { fg: YELLOW, attr: BOLD } as Style,
  grow: { fg: GREEN } as Style,
  growBright: { fg: BRIGHT_GREEN, attr: BOLD } as Style,
  wait: { fg: YELLOW } as Style,
  warn: { fg: RED, attr: BOLD } as Style,
  soil: { fg: YELLOW } as Style,
};

export interface Glyphs {
  /** Box corners and lines. */
  tl: string;
  tr: string;
  bl: string;
  br: string;
  h: string;
  v: string;
  /** btop-style tab ends around titles in the top and bottom borders. */
  tabL: string;
  tabR: string;
  tabLDown: string;
  tabRDown: string;
  meter: string;
  meterEmpty: string;
  spinner: string[];
  idle: string;
  paused: string;
  grown: string;
  abandoned: string;
  ask: string;
  /** Trees on the forest map, seen from above. */
  tree: string;
  conifer: string;
  sapling: string;
  cabin: string;
  prev: string;
  next: string;
  dot: string;
  ellipsis: string;
  arrows: string;
  digits: string[];
}

export const UNICODE: Glyphs = {
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
  h: "─",
  v: "│",
  tabL: "┐",
  tabR: "┌",
  tabLDown: "┘",
  tabRDown: "└",
  meter: "■",
  meterEmpty: "■",
  spinner: ["·", "✢", "✶", "✻", "✽", "✻", "✶", "✢"],
  idle: "○",
  paused: "‖",
  grown: "✻",
  abandoned: "✗",
  ask: "?",
  tree: "♣",
  conifer: "♠",
  sapling: "τ",
  cabin: "⌂",
  prev: "‹",
  next: "›",
  dot: "·",
  ellipsis: "…",
  arrows: "←→",
  digits: ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"],
};

export const ASCII: Glyphs = {
  tl: "+",
  tr: "+",
  bl: "+",
  br: "+",
  h: "-",
  v: "|",
  tabL: "[",
  tabR: "]",
  tabLDown: "[",
  tabRDown: "]",
  meter: "#",
  meterEmpty: ".",
  spinner: ["|", "/", "-", "\\"],
  idle: "o",
  paused: "=",
  grown: "*",
  abandoned: "x",
  ask: "?",
  tree: "&",
  conifer: "^",
  sapling: "i",
  cabin: "#",
  prev: "<",
  next: ">",
  dot: "-",
  ellipsis: "...",
  arrows: "<>",
  digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
};

export function glyphsFor(charset: Charset): Glyphs {
  return charset === "ascii" ? ASCII : UNICODE;
}

/** Below this size only a compact text view is shown. */
export const MIN_WIDTH = 40;
export const MIN_HEIGHT = 12;
