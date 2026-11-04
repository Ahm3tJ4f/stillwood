#!/usr/bin/env bun
/**
 * Stillwood terminal entry point: wires the app controller to OpenTUI.
 *
 * The scene is drawn into a headless Canvas and copied into OpenTUI's frame
 * buffer by a single full-screen Renderable. Colours are the terminal's own
 * palette and its default background, so the app follows the user's theme.
 * OpenTUI diffs frames natively, uses the alternate screen (no scrollback spam)
 * and restores the terminal on every exit path we route through renderer.destroy().
 */

import {
  createCliRenderer,
  Renderable,
  RGBA,
  TextAttributes,
  type OptimizedBuffer,
  type RenderContext,
} from "@opentui/core";
import pkg from "../package.json" with { type: "json" };
import { StillwoodApp } from "./app.ts";
import { BOLD, DEFAULT, DIM, type Canvas } from "./canvas.ts";
import type { Charset } from "./scene/look.ts";
import { renderScene } from "./scene/index.ts";
import { SoundPlayer } from "./sound.ts";
import { findSpecies, SPECIES, type Species } from "./species.ts";
import { HistoryStore, defaultDataDir } from "./storage.ts";
import { monotonicClock } from "./timer.ts";

const USAGE = `stillwood ${pkg.version} - a quiet focus timer where a bonsai grows while you work

usage: stillwood [options]

  --minutes <n>     initial focus length in minutes (default 25)
  --species <id>    always grow this tree type (${SPECIES.map((s) => s.id).join(", ")})
  --no-color        no colours, only bold and dim (also NO_COLOR)
  --ascii           ASCII-only glyphs: plain box lines, no unicode symbols
  --no-sound        no sound when a session ends (also STILLWOOD_NO_SOUND=1)
  --data-dir <dir>  where history is kept (also STILLWOOD_DATA_DIR)
  -v, --version     show the version
  -h, --help        show this help
`;

interface Cli {
  minutes?: number;
  species?: Species;
  color: boolean;
  ascii: boolean;
  sound: boolean;
  dataDir?: string;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = { ascii: false, color: true, sound: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "-h" || a === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a === "-v" || a === "--version") {
      process.stdout.write(`stillwood ${pkg.version}\n`);
      process.exit(0);
    } else if (a === "--minutes" && next) {
      cli.minutes = Number(next);
      i++;
    } else if (a === "--species" && next) {
      cli.species = findSpecies(next);
      if (!cli.species) {
        process.stderr.write(
          `unknown species: ${next} (use ${SPECIES.map((s) => s.id).join(", ")})\n`,
        );
        process.exit(2);
      }
      i++;
    } else if (a === "--no-color") cli.color = false;
    else if (a === "--ascii") cli.ascii = true;
    else if (a === "--no-sound") cli.sound = false;
    else if (a === "--data-dir" && next) {
      cli.dataDir = next;
      i++;
    } else {
      process.stderr.write(`unknown option: ${a}\n\n${USAGE}`);
      process.exit(2);
    }
  }
  if (cli.minutes !== undefined && !(cli.minutes > 0 && cli.minutes <= 600)) {
    process.stderr.write("--minutes must be between 1 and 600\n");
    process.exit(2);
  }
  return cli;
}

const ATTRS: [number, number][] = [
  [BOLD, TextAttributes.BOLD],
  [DIM, TextAttributes.DIM],
];

/** Copies a Canvas into OpenTUI's buffer as palette colours on the default background. */
class SceneView extends Renderable {
  private readonly draw: (w: number, h: number) => Canvas;
  private readonly color: boolean;
  /** On a light background the bright colours wash out, so the normal ones are used. */
  light = false;
  private readonly bg = RGBA.defaultBackground();
  private readonly fgs = new Map<number, RGBA>();

  constructor(
    ctx: RenderContext,
    draw: (w: number, h: number) => Canvas,
    onClick: (x: number, y: number, w: number, h: number) => void,
    color: boolean,
  ) {
    super(ctx, {
      id: "stillwood-scene",
      width: "100%",
      height: "100%",
      onMouseDown(event) {
        if (event.button === 0)
          onClick(event.x - this.x, event.y - this.y, this.width, this.height);
      },
    });
    this.draw = draw;
    this.color = color;
  }

  private fg(index: number): RGBA {
    let i = this.color ? index : DEFAULT;
    if (this.light && i >= 9 && i <= 14) i -= 8;
    let c = this.fgs.get(i);
    if (!c) {
      c = i === DEFAULT ? RGBA.defaultForeground() : RGBA.fromIndex(i);
      this.fgs.set(i, c);
    }
    return c;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const w = Math.min(this.width, buffer.width);
    const h = Math.min(this.height, buffer.height);
    if (w <= 0 || h <= 0) return;
    const canvas = this.draw(w, h);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = y * canvas.width + x;
        let attr = TextAttributes.NONE;
        for (const [ours, theirs] of ATTRS) if (canvas.attr[i]! & ours) attr |= theirs;
        buffer.setCell(
          this.x + x,
          this.y + y,
          canvas.ch[i]!,
          this.fg(canvas.fg[i]!),
          this.bg,
          attr,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const charset: Charset = cli.ascii || process.env.STILLWOOD_ASCII === "1" ? "ascii" : "unicode";
  const sounds = cli.sound && process.env.STILLWOOD_NO_SOUND !== "1" ? new SoundPlayer() : null;

  const app = new StillwoodApp({
    timerClock: monotonicClock,
    animClock: monotonicClock,
    store: new HistoryStore(cli.dataDir ?? defaultDataDir()),
    charset,
    durationMin: cli.minutes,
    species: cli.species,
    sound: (cue) => sounds?.play(cue),
  });

  let exitCode = 0;
  let pendingError = "";
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // Ctrl+C is routed through the app so shutdown is always the same path
    targetFps: 12,
    maxFps: 20,
    useMouse: true, // clicks only: pick a tree in the forest
    enableMouseMovement: false,
    autoFocus: false,
    backgroundColor: RGBA.defaultBackground(),
    consoleMode: "disabled",
    screenMode: "alternate-screen",
    onDestroy: () => {
      // The terminal is restored by now, so messages land on the normal screen.
      if (pendingError) process.stderr.write(pendingError);
      process.exit(exitCode);
    },
  });

  const color = cli.color && !process.env.NO_COLOR;
  const view = new SceneView(
    renderer,
    (w, h) => {
      app.tick();
      return renderScene(app.scene(w, h));
    },
    (x, y, w, h) => {
      app.handleClick(x, y, w, h);
      renderer.requestRender();
    },
    color,
  );
  view.light = renderer.themeMode === "light";
  renderer.on("theme_mode", (mode: string) => {
    view.light = mode === "light";
    renderer.requestRender();
  });
  renderer.root.add(view);

  let shuttingDown = false;
  const shutdown = (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    exitCode = code;
    renderer.destroy(); // restores cursor, input modes and the main screen, then calls onDestroy
  };

  const suspend = () => {
    // Ctrl+Z: hand the terminal back cleanly, stop, and redraw on resume.
    // The timer keeps using the monotonic clock, so the time spent stopped still counts.
    renderer.suspend();
    // While suspended nothing else keeps the event loop alive; without this the
    // process would exit as soon as the shell resumes it.
    const keepAlive = setInterval(() => {}, 60_000);
    process.once("SIGCONT", () => {
      clearInterval(keepAlive);
      renderer.resume();
      renderer.requestRender();
    });
    process.kill(process.pid, "SIGTSTP");
  };

  renderer.keyInput.on("keypress", (key) => {
    app.handleKey(key);
    if (app.suspendRequested) {
      app.suspendRequested = false;
      suspend();
    }
    if (app.quitRequested) shutdown(0);
    else renderer.requestRender();
  });

  const fail = (err: unknown) => {
    pendingError = `stillwood crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`;
    exitCode = 1;
    if (!shuttingDown) {
      shuttingDown = true;
      try {
        renderer.destroy();
      } catch {}
    }
    process.stderr.write(pendingError);
    process.exit(1);
  };
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);

  renderer.start();
}

main().catch((err) => {
  process.stderr.write(
    `stillwood failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
