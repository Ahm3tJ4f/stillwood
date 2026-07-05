/**
 * The session model.
 * Pure: no file system access.
 */

export type SessionStatus = "completed" | "abandoned";

/**
 * One tree in the forest. Completed sessions are grown trees; abandoned ones
 * are kept as unfinished saplings (at the progress they reached) and are never
 * counted as grown.
 */
export interface CompletedSession {
  id: string;
  /** ISO timestamp (wall clock) when the session began. */
  startedAt: string;
  /** ISO timestamp (wall clock) when the session ended (finished or abandoned). */
  completedAt: string;
  /** Planned focus length. */
  durationMs: number;
  /** Seed for the tree's procedural shape, so each tree in the forest is unique. */
  seed: number;
  /** Missing in older files, which only ever held completed sessions. */
  status?: SessionStatus;
  /** Growth reached, 0..1 (1 for completed). */
  progress?: number;
  /** Tree species id (see species.ts). Missing in older files: it then comes from the seed. */
  species?: string;
}

export function isGrown(s: CompletedSession): boolean {
  return (s.status ?? "completed") === "completed";
}

export function sessionProgress(s: CompletedSession): number {
  return isGrown(s) ? 1 : Math.max(0, Math.min(1, s.progress ?? 0));
}

/** Time actually spent focusing. */
export function focusedMs(s: CompletedSession): number {
  return s.durationMs * sessionProgress(s);
}

interface HistoryFile {
  version: 1;
  sessions: CompletedSession[];
}

export interface LoadResult {
  sessions: CompletedSession[];
  /** Human-readable note when the file needed recovery. */
  warning?: string;
}

/** Where the forest is kept (a JSON file in the terminal app). */
export interface HistoryBackend {
  load(): LoadResult;
  /** Append a session and persist it. Returns the full list. */
  append(session: CompletedSession): CompletedSession[];
}

export function isSession(v: unknown): v is CompletedSession {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.startedAt === "string" &&
    !Number.isNaN(Date.parse(s.startedAt)) &&
    typeof s.completedAt === "string" &&
    !Number.isNaN(Date.parse(s.completedAt)) &&
    typeof s.durationMs === "number" &&
    Number.isFinite(s.durationMs) &&
    s.durationMs > 0 &&
    typeof s.seed === "number" &&
    Number.isFinite(s.seed) &&
    (s.status === undefined || s.status === "completed" || s.status === "abandoned") &&
    (s.progress === undefined ||
      (typeof s.progress === "number" && s.progress >= 0 && s.progress <= 1)) &&
    (s.species === undefined || typeof s.species === "string")
  );
}

/**
 * Parse a stored history. `problem` is set when the whole payload is unusable
 * (the caller keeps a copy aside); individual damaged entries are skipped.
 */
export function parseHistory(
  raw: string,
): { ok: false; problem: string } | { ok: true; result: LoadResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "was unreadable" };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as HistoryFile).sessions)
      ? (parsed as HistoryFile).sessions
      : null;
  if (!list) return { ok: false, problem: "had an unknown format" };
  const sessions = list.filter(isSession);
  sessions.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const dropped = list.length - sessions.length;
  return {
    ok: true,
    result:
      dropped > 0
        ? { sessions, warning: `skipped ${dropped} damaged entr${dropped === 1 ? "y" : "ies"}` }
        : { sessions },
  };
}

export function serializeHistory(sessions: CompletedSession[]): string {
  const data: HistoryFile = { version: 1, sessions };
  return JSON.stringify(data, null, 2) + "\n";
}

export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}
