/**
 * Plays the short sounds for the end of a session through the system's own
 * player: afplay on macOS, PipeWire, PulseAudio or ALSA on Linux, and
 * PowerShell on Windows. A missing player only means no sound; it never
 * stops the app.
 *
 * `bun build --compile` embeds the WAV files in the binary, where other
 * programs cannot read them, so each one is copied to the cache once.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import failWav from "./sounds/fail.wav" with { type: "file" };
import successWav from "./sounds/success.wav" with { type: "file" };

export type Cue = "success" | "fail";

const FILES: Record<Cue, string> = { success: successWav, fail: failWav };

/** A command that plays the WAV file given as its last argument. */
function findPlayer(): string[] | null {
  if (process.platform === "darwin") return Bun.which("afplay") ? ["afplay"] : null;
  if (process.platform === "win32") return Bun.which("powershell") ? ["powershell"] : null;
  for (const cmd of ["pw-play", "paplay", "aplay"]) {
    const bin = Bun.which(cmd);
    if (bin) return cmd === "aplay" ? [bin, "-q"] : [bin];
  }
  return null;
}

/** Platform-appropriate, user-writable cache directory. */
function cacheDir(env: Record<string, string | undefined> = process.env): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Caches", "stillwood");
  if (process.platform === "win32")
    return path.join(env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "stillwood");
  return path.join(env.XDG_CACHE_HOME ?? path.join(home, ".cache"), "stillwood");
}

/** A path that other programs can read. The name holds a hash, so a new sound never meets an old copy. */
async function readablePath(file: string): Promise<string> {
  if (!/\$bunfs|~BUN/.test(file)) return file;
  const bytes = await Bun.file(file).bytes();
  const name = `${path.basename(file, ".wav")}-${Bun.hash(bytes).toString(16)}.wav`;
  const out = path.join(cacheDir(), "sounds", name);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    // Write to a temporary name first, so a second instance never plays half a file.
    const tmp = `${out}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, out);
  }
  return out;
}

function command(player: string[], file: string): string[] {
  if (process.platform !== "win32") return [...player, file];
  const quoted = `'${file.replaceAll("'", "''")}'`;
  return [
    ...player,
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(New-Object Media.SoundPlayer ${quoted}).PlaySync()`,
  ];
}

export class SoundPlayer {
  private player: string[] | null | undefined;
  private readonly paths = new Map<Cue, Promise<string>>();

  /** Start the sound and return at once; errors are ignored. */
  play(cue: Cue): void {
    this.player ??= findPlayer();
    const player = this.player;
    if (!player) return;
    let file = this.paths.get(cue);
    if (!file) {
      file = readablePath(FILES[cue]);
      this.paths.set(cue, file);
    }
    file
      .then((p) => {
        Bun.spawn(command(player, p), {
          stdio: ["ignore", "ignore", "ignore"],
          windowsHide: true,
        }).unref();
      })
      .catch(() => {});
  }
}
