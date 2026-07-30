export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelTokenUsage {
  input: number;
  output: number;
  reasoning: number;
}

export interface ModelUsage {
  tokens: ModelTokenUsage;
  provider: string;
  count: number;
}

// Cost is intentionally not tracked here: the OpenCode message cost is a raw
// passthrough and the Claude Code cost hook is known to be inflated (~100x), so
// only token totals are reported.
export interface DayUsage {
  tokens: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  messageCount: number;
}

// The app a session belongs to, as a free-form id. Never an enum of app names:
// readers tag their sessions and new apps are added without touching this type.
export type SessionSource = string;

export interface Session {
  id: string;
  title: string;
  created: number;
  updated: number;
  tokens: TokenUsage;
  modelUsage: Record<string, ModelUsage>;
  costByDay: Record<string, DayUsage>;
  messageCount: number;
  source: SessionSource;
}

// A parsed session before the engine stamps its source. Readers produce these;
// the engine tags each with the reader's source when assembling the final list.
export type SessionData = Omit<Session, "source">;

export interface ModelSummaryEntry {
  tokens: ModelTokenUsage;
  provider: string;
  sessionCount: number;
  messageCount: number;
}

export type ModelSummary = Record<string, ModelSummaryEntry>;

export interface QuotaInfo {
  remaining: number | null;
  resetTime: number | null;
  modelCount?: number;
}

export interface RateLimitInfo {
  resetTime: number;
  isLimited: boolean;
}

export interface AccountSummary {
  email: string;
  enabled: boolean;
  lastUsed: number;
  rateLimits: Record<string, RateLimitInfo>;
  quotas: Record<string, QuotaInfo>;
  quotaUpdatedAt: number;
  provider: string;
}

export interface UsageSnapshotData {
  updatedAt: number;
  accounts: AccountSummary[];
  sessions: Session[];
  models: ModelSummary;
  costByDay: Record<string, DayUsage>;
}
