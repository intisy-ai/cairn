// Session token aggregation. Discovery is registry-driven: each app declares the
// session-storage formats it writes (AppDescriptor.usage.formats), the engine
// resolves the app's home and runs the matching format reader, threading the set
// of already-seen session ids so a session claimed by an earlier reader is not
// double-counted, and stamps each session with the app's id as its source.
import { createReadStream, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { getApps, resolveHome } from "@intisy-ai/basekit";
import { openDB, readJSON } from "./db.js";
import type { DayUsage, ModelSummary, ModelUsage, Session, SessionData, TokenUsage } from "./types.js";

// A reader for one storage format, given the resolving app's home. Returns
// sessions minus their source (the engine stamps it), skipping any id already
// claimed by an earlier reader.
type FormatReader = (home: string, knownIds: Set<string>) => Promise<SessionData[]> | SessionData[];

function emptyTokens(): TokenUsage {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
}

function dayKeyFor(timestampMs: number): string {
  const date = new Date(timestampMs);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayEntry(costByDay: Record<string, DayUsage>, timestampMs: number): DayUsage | null {
  if (!timestampMs) return null;
  const key = dayKeyFor(timestampMs);
  return costByDay[key] ?? (costByDay[key] = { tokens: 0, tokensInput: 0, tokensOutput: 0, tokensReasoning: 0, messageCount: 0 });
}

function addToDay(costByDay: Record<string, DayUsage>, timestampMs: number, input: number, output: number, reasoning: number): void {
  const entry = dayEntry(costByDay, timestampMs);
  if (!entry) return;
  entry.tokens += input + output + reasoning;
  entry.tokensInput += input;
  entry.tokensOutput += output;
  entry.tokensReasoning += reasoning;
  entry.messageCount += 1;
}

function addModelUsage(
  modelUsage: Record<string, ModelUsage>,
  modelId: string,
  provider: string,
  input: number,
  output: number,
  reasoning: number,
): void {
  const entry = modelUsage[modelId] ?? (modelUsage[modelId] = { tokens: { input: 0, output: 0, reasoning: 0 }, provider, count: 0 });
  entry.tokens.input += input;
  entry.tokens.output += output;
  entry.tokens.reasoning += reasoning;
  entry.count += 1;
}

interface SessionRow {
  id: string;
  title: string | null;
  time_created: number | null;
  time_updated: number | null;
}

interface MessageRow {
  session_id: string;
  msg_time: number | null;
  modelID: string | null;
  providerID: string | null;
  tok_in: number | null;
  tok_out: number | null;
  tok_reason: number | null;
  tok_cr: number | null;
  tok_cw: number | null;
}

function buildDbSessions(): SessionData[] {
  const db = openDB();
  if (!db) return [];

  try {
    const sessions = db
      .query("SELECT id, title, time_created, time_updated FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC")
      .all() as SessionRow[];

    const messageRows = db
      .query(
        `SELECT m.session_id,
                m.time_created as msg_time,
                json_extract(m.data, '$.modelID') as modelID,
                json_extract(m.data, '$.providerID') as providerID,
                json_extract(m.data, '$.tokens.input') as tok_in,
                json_extract(m.data, '$.tokens.output') as tok_out,
                json_extract(m.data, '$.tokens.reasoning') as tok_reason,
                json_extract(m.data, '$.tokens.cache.read') as tok_cr,
                json_extract(m.data, '$.tokens.cache.write') as tok_cw
         FROM message m
         INNER JOIN session s ON m.session_id = s.id
         WHERE s.parent_id IS NULL AND json_extract(m.data, '$.role') = 'assistant'
               AND (COALESCE(json_extract(m.data, '$.tokens.input'), 0) + COALESCE(json_extract(m.data, '$.tokens.output'), 0)) > 0`,
      )
      .all() as MessageRow[];
    db.close();

    const messagesBySession = new Map<string, MessageRow[]>();
    for (const row of messageRows) {
      const bucket = messagesBySession.get(row.session_id);
      if (bucket) bucket.push(row);
      else messagesBySession.set(row.session_id, [row]);
    }

    return sessions.map((session): SessionData => {
      const messages = messagesBySession.get(session.id) ?? [];
      const tokens = emptyTokens();
      const modelUsage: Record<string, ModelUsage> = {};
      const costByDay: Record<string, DayUsage> = {};

      for (const message of messages) {
        const input = message.tok_in ?? 0;
        const output = message.tok_out ?? 0;
        const reasoning = message.tok_reason ?? 0;
        tokens.input += input;
        tokens.output += output;
        tokens.reasoning += reasoning;
        tokens.cacheRead += message.tok_cr ?? 0;
        tokens.cacheWrite += message.tok_cw ?? 0;

        addModelUsage(modelUsage, message.modelID || "unknown", message.providerID || "", input, output, reasoning);
        addToDay(costByDay, message.msg_time || session.time_updated || 0, input, output, reasoning);
      }

      return {
        id: session.id,
        title: session.title || "Untitled",
        created: session.time_created || 0,
        updated: session.time_updated || 0,
        tokens,
        modelUsage,
        costByDay,
        messageCount: messages.length,
      };
    });
  } catch {
    try {
      db.close();
    } catch {
      // already closed
    }
    return [];
  }
}

interface LegacySessionFile {
  id?: string;
  parentID?: string;
  title?: string;
  time?: { created?: number; updated?: number };
  messageCount?: number;
}

interface LegacyMessageFile {
  id?: string;
  role?: string;
  modelID?: string;
  providerID?: string;
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
  time?: { created?: number };
}

function buildLegacyFileSessions(home: string, knownIds: Set<string>): SessionData[] {
  const storageDir = join(home, "data", "storage");
  const sessionDir = join(storageDir, "session");
  const messageDirBase = join(storageDir, "message");
  if (!existsSync(sessionDir)) return [];

  const result: SessionData[] = [];
  try {
    for (const projectDir of readdirSync(sessionDir)) {
      const fullDir = join(sessionDir, projectDir);
      let files: string[];
      try {
        files = readdirSync(fullDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const sessionFile = readJSON<LegacySessionFile>(join(fullDir, file));
        if (!sessionFile?.id || sessionFile.parentID) continue;
        if (knownIds.has(sessionFile.id) || result.some((s) => s.id === sessionFile.id)) continue;

        const messages: LegacyMessageFile[] = [];
        const messageDir = join(messageDirBase, sessionFile.id);
        if (existsSync(messageDir)) {
          try {
            for (const messageFile of readdirSync(messageDir)) {
              if (!messageFile.endsWith(".json")) continue;
              const message = readJSON<LegacyMessageFile>(join(messageDir, messageFile));
              if (message?.id && message.role === "assistant" && ((message.tokens?.input ?? 0) + (message.tokens?.output ?? 0)) > 0) {
                messages.push(message);
              }
            }
          } catch {
            // no readable messages for this session
          }
        }

        const tokens = emptyTokens();
        const modelUsage: Record<string, ModelUsage> = {};
        const costByDay: Record<string, DayUsage> = {};

        for (const message of messages) {
          const input = message.tokens?.input ?? 0;
          const output = message.tokens?.output ?? 0;
          const reasoning = message.tokens?.reasoning ?? 0;
          tokens.input += input;
          tokens.output += output;
          tokens.reasoning += reasoning;
          tokens.cacheRead += message.tokens?.cache?.read ?? 0;
          tokens.cacheWrite += message.tokens?.cache?.write ?? 0;

          addModelUsage(modelUsage, message.modelID || "unknown", message.providerID || "", input, output, reasoning);
          addToDay(costByDay, message.time?.created || sessionFile.time?.updated || 0, input, output, reasoning);
        }

        result.push({
          id: sessionFile.id,
          title: sessionFile.title || "Untitled",
          created: sessionFile.time?.created || 0,
          updated: sessionFile.time?.updated || 0,
          tokens,
          modelUsage,
          costByDay,
          messageCount: messages.length || sessionFile.messageCount || 0,
        });
      }
    }
  } catch {
    // no readable legacy storage
  }
  return result;
}

interface ClaudeJsonlUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface ClaudeJsonlEntry {
  type?: string;
  timestamp?: string;
  message?: { model?: string; usage?: ClaudeJsonlUsage; content?: unknown };
}

const TITLE_MAX = 80;

// The text of a user turn, which arrives either as a plain string or as content blocks.
function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && (part as { type?: string }).type === "text" ? String((part as { text?: string }).text ?? "") : ""))
    .join(" ");
}

// A session's own first real prompt. Tool output, command wrappers and the injected caveat
// all arrive as user turns too, and every one of them starts with a tag or that fixed
// prefix, so they are skipped rather than becoming the title.
function promptTitle(content: unknown): string | null {
  const text = userText(content).trim();
  if (!text || text.startsWith("<") || text.startsWith("Caveat:")) return null;
  const line = text.split(/\s+/).join(" ");
  return line.length > TITLE_MAX ? line.slice(0, TITLE_MAX - 1).trimEnd() + "…" : line;
}

// Derives a friendly title from the transcript project directory name (e.g.
// "C--Users-jane-myapp" -> "Users jane myapp"). Falls back to a generic title
// when the derived name is empty.
function projectTitle(projectDir: string): string {
  const cleaned = projectDir.replace(/^[A-Z]--/, "").replace(/-/g, " ").trim();
  return cleaned || "Claude Code Session";
}

// Transcripts are streamed line-by-line, never read whole: files can exceed
// V8's maximum string length (real ones reach 1GB+), and in Electron's
// utility process that allocation is a native crash, not a catchable error.
// Per-file aggregates are cached on (mtime, size) because a full scan of a
// large history costs many seconds and transcripts are append-only.
const transcriptCache = new Map<string, { mtimeMs: number; size: number; session: SessionData | null }>();

async function readTranscriptSession(path: string, sessionId: string, projectDir: string): Promise<SessionData | null> {
  const tokens = emptyTokens();
  const modelUsage: Record<string, ModelUsage> = {};
  const costByDay: Record<string, DayUsage> = {};
  let messageCount = 0;
  let firstTimestamp = 0;
  let lastTimestamp = 0;
  let title: string | null = null;

  const stream = createReadStream(path, { encoding: "utf-8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line) continue;
      let entry: ClaudeJsonlEntry;
      try {
        entry = JSON.parse(line) as ClaudeJsonlEntry;
      } catch {
        continue;
      }
      if (entry.type === "user" && title === null) title = promptTitle(entry.message?.content);
      if (entry.type !== "assistant" || !entry.message?.usage) continue;

      // Anthropic-wire usage names, mapped onto the neutral internal tokens
      // shape. This is the only place that reads these wire field names.
      const usage = entry.message.usage;
      const input = usage.input_tokens ?? 0;
      const output = usage.output_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;

      tokens.input += input;
      tokens.output += output;
      tokens.cacheRead += cacheRead;
      tokens.cacheWrite += cacheWrite;
      messageCount++;

      addModelUsage(modelUsage, entry.message.model || "unknown", "anthropic", input, output, 0);

      if (entry.timestamp) {
        const timestampMs = new Date(entry.timestamp).getTime();
        if (!firstTimestamp || timestampMs < firstTimestamp) firstTimestamp = timestampMs;
        if (timestampMs > lastTimestamp) lastTimestamp = timestampMs;
        addToDay(costByDay, timestampMs, input, output, 0);
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  if (messageCount === 0) return null;
  return {
    id: sessionId,
    // Every session in a project used to carry the project's name, so a project with
    // twenty sessions rendered as twenty identical rows.
    title: title ?? projectTitle(projectDir),
    project: projectTitle(projectDir),
    created: firstTimestamp,
    updated: lastTimestamp,
    tokens,
    modelUsage,
    costByDay,
    messageCount,
  };
}

async function buildTranscriptSessions(home: string, knownIds: Set<string>): Promise<SessionData[]> {
  const projectsDir = join(home, "projects");
  if (!existsSync(projectsDir)) return [];

  const result: SessionData[] = [];
  try {
    for (const projectDir of readdirSync(projectsDir)) {
      const fullProjectDir = join(projectsDir, projectDir);
      let files: string[];
      try {
        files = readdirSync(fullProjectDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const sessionId = file.replace(/\.jsonl$/, "");
        if (knownIds.has(sessionId) || result.some((s) => s.id === sessionId)) continue;

        const path = join(fullProjectDir, file);
        let session: SessionData | null;
        try {
          const stat = statSync(path);
          const cached = transcriptCache.get(path);
          if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
            session = cached.session;
          } else {
            session = await readTranscriptSession(path, sessionId, projectDir);
            transcriptCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, session });
          }
        } catch {
          continue;
        }

        if (session) result.push(session);
      }
    }
  } catch {
    // no readable transcript projects directory
  }
  return result;
}

// One parser per storage-format id. An app's descriptor lists which formats it
// writes; a format shared by several apps needs no new reader. When an app lists
// several formats they run in order, so the earlier one wins on a shared id (the
// sqlite db over its own legacy file storage). The sqlite reader ignores `home`:
// its db lives outside the app home (see db.ts).
const FORMAT_READERS: Record<string, FormatReader> = {
  "opencode-sqlite": () => buildDbSessions(),
  "opencode-legacy-files": (home, knownIds) => buildLegacyFileSessions(home, knownIds),
  "claude-jsonl": (home, knownIds) => buildTranscriptSessions(home, knownIds),
};

export async function buildSessionsWithCosts(): Promise<Session[]> {
  const knownIds = new Set<string>();
  const all: Session[] = [];
  for (const app of getApps()) {
    if (!app.usage) continue;
    const home = resolveHome(app);
    for (const format of app.usage.formats) {
      const reader = FORMAT_READERS[format];
      if (!reader) continue;
      const chunk = await reader(home, knownIds);
      for (const data of chunk) {
        const session: Session = { ...data, source: app.id };
        knownIds.add(session.id);
        all.push(session);
      }
    }
  }
  return all.sort((a, b) => b.updated - a.updated);
}

export function buildModelSummary(sessions: Session[]): ModelSummary {
  const models: ModelSummary = {};

  for (const session of sessions) {
    for (const [modelId, usage] of Object.entries(session.modelUsage)) {
      const entry = models[modelId] ?? (models[modelId] = { tokens: { input: 0, output: 0, reasoning: 0 }, provider: usage.provider, sessionCount: 0, messageCount: 0 });
      entry.tokens.input += usage.tokens.input;
      entry.tokens.output += usage.tokens.output;
      entry.tokens.reasoning += usage.tokens.reasoning;
      entry.sessionCount += 1;
      entry.messageCount += usage.count;
    }
  }
  return models;
}
