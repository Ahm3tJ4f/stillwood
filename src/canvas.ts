/**
 * A headless character grid. Colours are the terminal's own: -1 is its default
 * foreground and 0-15 are its palette, so the app follows the user's terminal
 * theme and the background is never painted. The OpenTUI adapter copies the
 * grid to the screen.
 * Every glyph written here must be exactly one column wide.
 */

export const DEFAULT = -1;

export const BOLD = 1;
export const DIM = 2;

export interface Style {
  /** -1 (the terminal's default) or a palette index 0-15. */
  fg?: number;
  attr?: number;
}

/** A clickable region, recorded while drawing. */
export interface Hit<T> {
  x: number;
  y: number;
  w: number;
  target: T;
}

export class Canvas<T = unknown> {
  readonly width: number;
  readonly height: number;
  readonly ch: string[];
  readonly fg: Int8Array;
  readonly attr: Uint8Array;
  readonly hits: Hit<T>[] = [];

  constructor(width: number, height: number) {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    const n = this.width * this.height;
    this.ch = Array.from({ length: n }, () => " ");
    this.fg = new Int8Array(n).fill(DEFAULT);
    this.attr = new Uint8Array(n);
  }

  put(x: number, y: number, char: string, style: Style = {}): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    this.ch[i] = char;
    this.fg[i] = style.fg ?? DEFAULT;
    this.attr[i] = style.attr ?? 0;
  }

  /** Write a string from (x, y). Returns the column after it. */
  text(x: number, y: number, s: string, style: Style = {}): number {
    for (const char of s) this.put(x++, y, char, style);
    return x;
  }

  hit(x: number, y: number, w: number, target: T): void {
    this.hits.push({ x, y, w, target });
  }

  /** The last region drawn at a cell wins, like the glyphs themselves. */
  hitAt(x: number, y: number): T | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!;
      if (y === h.y && x >= h.x && x < h.x + h.w) return h.target;
    }
    return null;
  }
}
