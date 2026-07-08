/**
 * Keyboard bindings. One table drives both key handling and the help line,
 * so what the UI shows is exactly what the keys do.
 */

export type Mode =
  | "idle"
  | "running"
  | "paused"
  | "confirm-abandon"
  | "confirm-quit"
  | "completed"
  | "abandoned"
  | "forest"
  | "map"
  | "tree";

export type Action =
  | "start"
  | "toggle-pause"
  | "abandon"
  | "confirm"
  | "cancel"
  | "longer"
  | "shorter"
  | "forest"
  | "show-garden"
  | "back"
  | "prev"
  | "next"
  | "open-tree"
  | "replay"
  | "range-day"
  | "range-week"
  | "range-month"
  | "range-year"
  | "range-cycle"
  | "period-prev"
  | "period-next"
  | "new-session"
  | "quit"
  | "force-quit"
  | "suspend";

export interface Binding {
  keys: string[];
  action: Action;
  /** Label for the help line; omitted bindings are still active but not shown. */
  label?: string;
  /** Key caption shown in the help line. */
  caption?: string;
}

const QUIT: Binding = { keys: ["q"], action: "quit", caption: "q", label: "quit" };
const BACK: Binding = {
  keys: ["f", "escape", "backspace", "1"],
  action: "back",
  caption: "f",
  label: "back",
};
const RANGE_KEYS: Binding[] = [
  { keys: ["d"], action: "range-day", caption: "d/w/m/y", label: "range" },
  { keys: ["w"], action: "range-week" },
  { keys: ["m"], action: "range-month" },
  { keys: ["y"], action: "range-year" },
  { keys: ["tab"], action: "range-cycle" },
];

export const BINDINGS: Record<Mode, Binding[]> = {
  idle: [
    {
      keys: ["space", "return", "linefeed", "s"],
      action: "start",
      caption: "space",
      label: "plant & focus",
    },
    {
      keys: ["left", "h", "-", "down", "j"],
      action: "shorter",
      caption: "<-/->",
      label: "duration",
    },
    { keys: ["right", "l", "+", "=", "up", "k"], action: "longer" },
    { keys: ["f", "2"], action: "forest", caption: "f", label: "forest" },
    QUIT,
  ],
  running: [
    { keys: ["space", "p"], action: "toggle-pause", caption: "space", label: "pause" },
    { keys: ["a", "x"], action: "abandon", caption: "a", label: "abandon" },
    { keys: ["f", "2"], action: "forest", caption: "f", label: "forest" },
    QUIT,
  ],
  paused: [
    { keys: ["space", "p"], action: "toggle-pause", caption: "space", label: "resume" },
    { keys: ["a", "x"], action: "abandon", caption: "a", label: "abandon" },
    { keys: ["f", "2"], action: "forest", caption: "f", label: "forest" },
    QUIT,
  ],
  "confirm-abandon": [
    { keys: ["y"], action: "confirm", caption: "y", label: "abandon tree" },
    { keys: ["n", "escape", "space"], action: "cancel", caption: "n", label: "keep growing" },
  ],
  "confirm-quit": [
    { keys: ["y"], action: "confirm", caption: "y", label: "quit & abandon" },
    { keys: ["n", "escape"], action: "cancel", caption: "n", label: "stay" },
  ],
  completed: [
    {
      keys: ["space", "return", "linefeed"],
      action: "new-session",
      caption: "space",
      label: "new session",
    },
    { keys: ["f", "2"], action: "forest", caption: "f", label: "forest" },
    QUIT,
  ],
  abandoned: [
    {
      keys: ["space", "return", "linefeed"],
      action: "new-session",
      caption: "space",
      label: "new session",
    },
    { keys: ["f", "2"], action: "forest", caption: "f", label: "forest" },
    QUIT,
  ],
  forest: [
    { keys: ["left", "h"], action: "prev", caption: "<-/->", label: "tree" },
    { keys: ["right", "l"], action: "next" },
    {
      keys: ["return", "linefeed", "space"],
      action: "open-tree",
      caption: "enter",
      label: "open tree",
    },
    ...RANGE_KEYS,
    { keys: ["["], action: "period-prev", caption: "[ ]", label: "earlier/later" },
    { keys: ["]"], action: "period-next" },
    BACK,
    QUIT,
  ],
  // Week, month and year are maps: time runs left to right, there is no tree to pick.
  map: [
    { keys: ["left", "h", "["], action: "period-prev", caption: "<-/->", label: "earlier/later" },
    { keys: ["right", "l", "]"], action: "period-next" },
    ...RANGE_KEYS,
    BACK,
    QUIT,
  ],
  tree: [
    { keys: ["left", "h"], action: "prev", caption: "<-/->", label: "prev/next" },
    { keys: ["right", "l"], action: "next" },
    { keys: ["r", "space"], action: "replay", caption: "r", label: "replay growth" },
    {
      keys: ["escape", "return", "linefeed", "backspace", "f", "2"],
      action: "back",
      caption: "esc",
      label: "forest",
    },
    { keys: ["1"], action: "show-garden" },
    QUIT,
  ],
};

export interface KeyLike {
  name: string;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

function keyId(key: KeyLike): string {
  if (key.name) return key.name.toLowerCase();
  return (key.sequence ?? "").toLowerCase();
}

export function keyToAction(mode: Mode, key: KeyLike): Action | null {
  if (key.ctrl && (key.name === "c" || key.sequence === "\u0003")) return "force-quit";
  if (key.ctrl && (key.name === "z" || key.sequence === "\u001a")) return "suspend";
  if (key.ctrl || key.meta) return null;
  const id = keyId(key);
  const seq = key.sequence ?? "";
  for (const b of BINDINGS[mode]) {
    if (b.keys.includes(id) || (seq.length === 1 && b.keys.includes(seq))) return b.action;
  }
  return null;
}

export interface HelpItem {
  key: string;
  label: string;
}

export function helpFor(mode: Mode): HelpItem[] {
  return BINDINGS[mode]
    .filter((b) => b.label && b.caption)
    .map((b) => ({ key: b.caption!, label: b.label! }));
}
