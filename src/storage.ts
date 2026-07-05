import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseHistory,
  serializeHistory,
  type CompletedSession,
  type HistoryBackend,
  type LoadResult,
} from "./session.ts";

export * from "./session.ts";

/** Platform-appropriate, user-writable data directory. */
export function defaultDataDir(env: Record<string, string | undefined> = process.env): string {
  if (env.STILLWOOD_DATA_DIR) return env.STILLWOOD_DATA_DIR;
  const home = os.homedir();
  if (process.platform === "darwin")
    return path.join(home, "Library", "Application Support", "stillwood");
  if (process.platform === "win32")
    return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "stillwood");
  return path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "stillwood");
}

export class HistoryStore implements HistoryBackend {
  readonly file: string;

  constructor(dir: string = defaultDataDir()) {
    this.file = path.join(dir, "forest.json");
  }

  load(): LoadResult {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { sessions: [] };
      return { sessions: [], warning: `could not read history (${(err as Error).message})` };
    }
    const parsed = parseHistory(raw);
    if (!parsed.ok) {
      const backup = this.quarantine();
      return {
        sessions: [],
        warning: `history ${parsed.problem}; saved a copy as ${path.basename(backup ?? "?")}`,
      };
    }
    return parsed.result;
  }

  /** Append a completed session and persist atomically. Returns the full list. */
  append(session: CompletedSession): CompletedSession[] {
    const { sessions } = this.load();
    if (!sessions.some((s) => s.id === session.id)) sessions.push(session);
    this.save(sessions);
    return sessions;
  }

  /** Write via temp file + fsync + rename so an interruption never leaves a half-written file. */
  save(sessions: CompletedSession[]): void {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now().toString(36)}.tmp`;
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeSync(fd, serializeHistory(sessions));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tmp, this.file);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
      throw err;
    }
    try {
      const dfd = fs.openSync(dir, "r");
      try {
        fs.fsyncSync(dfd);
      } finally {
        fs.closeSync(dfd);
      }
    } catch {
      // Directory fsync is best-effort (not supported everywhere).
    }
  }

  /** Move a corrupt file aside rather than silently overwriting the user's data. */
  private quarantine(): string | null {
    const backup = `${this.file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      fs.renameSync(this.file, backup);
      return backup;
    } catch {
      return null;
    }
  }
}
