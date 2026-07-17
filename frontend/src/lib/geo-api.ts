export const BASE_API_URL = import.meta.env.VITE_API_URL || "https://api.centralynk.com";


const TOKEN_KEY = "authToken";

function headers(): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export type Brand = {
  id: string;
  name: string;
  domain?: string;
  keywords?: string[];
  visibility_score?: number;
};

export type UserMe = {
  email: string;
  organisation_name?: string;
  role?: "admin" | "member";
  plan?: "free" | "pro" | "enterprise";
  created_at: string;
  scans_used?: number;
  scans_max?: number;
  scans_today?: number;
  last_seen?: string;
};

export type SentimentBreakdown = {
  positive: number;
  neutral: number;
  negative: number;
  score?: number;
};

export type DashboardData = {
  visibilityShare?: number;
  totalScans?: number;
  totalCitations?: number;
  sentimentScore?: string;
  sentimentBreakdown?: SentimentBreakdown;
  engines?: EngineRow[];
};

export type EngineRow = {
  engine: string;
  scans: number;
  mentions: number;
  avgRank: number;
  visibility: number;
};

export type ScanRow = {
  scan_id: string;
  engine: string;
  query: string;
  status: string;
  sentiment: string;
  timestamp: string;
  scanned_at?: string;
  brand_id?: string;
  mentioned?: boolean;
};

// --- Local session helpers ---
const EMAIL_KEY = "centralynk:email";
const BRAND_KEY = "centralynk:active_brand";

export const session = {
  getEmail: () => (typeof window === "undefined" ? null : localStorage.getItem(EMAIL_KEY)),
  setEmail: (e: string) => localStorage.setItem(EMAIL_KEY, e),
  getToken: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    if (typeof window === "undefined") return;
    // Wipe all known auth/session keys
    const keys = [
      EMAIL_KEY,
      BRAND_KEY,
      TOKEN_KEY,
      "centralynk:token",
      "displayName",
      "adminToken",
    ];
    keys.forEach((k) => localStorage.removeItem(k));
    // Wipe any other centralynk:* keys (cached state, preferences)
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("centralynk:")) localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  },
  getActiveBrand: () => (typeof window === "undefined" ? null : localStorage.getItem(BRAND_KEY)),
  setActiveBrand: (id: string) => localStorage.setItem(BRAND_KEY, id),
};

// --- Access endpoints ---
export async function joinWaitlist(email: string) {
  const res = await fetch(`${BASE_API_URL}/api/access/waitlist`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email }),
  });
  return res.ok;
}

export async function validateAccess(email: string, code: string): Promise<{ ok: boolean; token?: string }> {
  const res = await fetch(`${BASE_API_URL}/api/access/validate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) return { ok: false };
  let token: string | undefined;
  try {
    const json = await res.json();
    token = json?.token ?? json?.access_token ?? json?.data?.token;
  } catch {
    // ignore
  }
  return { ok: true, token };
}

// --- Brand endpoints ---
export async function fetchBrands(): Promise<Brand[]> {
  const res = await fetch(`${BASE_API_URL}/api/brands`, { headers: headers() });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? (json as Brand[]) : [];
}

export async function createBrand(input: { name: string; domain: string; keywords: string[] }): Promise<Brand | null> {
  const res = await fetch(`${BASE_API_URL}/api/brands`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  return (await res.json()) as Brand;
}

// --- Dashboard + Scans ---
type ApiDashboard = {
  overall_visibility?: number;
  total_scans?: number;
  total_mentions?: number;
  sentiment_score?: string;
  sentiment_breakdown?: SentimentBreakdown;
  by_engine?: Array<{
    engine: string;
    total_scans?: number;
    mentions?: number;
    avg_position?: number;
    visibility_pct?: number;
  }>;
};

export async function fetchDashboard(brandId: string): Promise<DashboardData | null> {
  if (!brandId) return null;
  const res = await fetch(`${BASE_API_URL}/api/dashboard/${brandId}`, { headers: headers() });
  if (!res.ok) return null;
  const json = (await res.json()) as ApiDashboard;
  return {
    visibilityShare: json.overall_visibility == null ? undefined : json.overall_visibility,
    totalScans: json.total_scans == null ? undefined : json.total_scans,
    totalCitations: json.total_mentions == null ? undefined : json.total_mentions,
    sentimentScore: json.sentiment_score == null ? undefined : json.sentiment_score,
    sentimentBreakdown: json.sentiment_breakdown,
    engines: (json.by_engine ?? []).map((e) => ({
      engine: e.engine,
      scans: e.total_scans ?? 0,
      mentions: e.mentions ?? 0,
      avgRank: e.avg_position ?? 0,
      visibility: e.visibility_pct ?? 0,
    })),
  };
}

export async function fetchScans(brandId: string, from?: string, to?: string): Promise<ScanRow[]> {
  if (!brandId) return [];
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const query = params.toString();
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/scans${query ? `?${query}` : ""}`, { headers: headers() });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? (json as ScanRow[]) : [];
}

export async function fetchScanResponse(brandId: string, scanId: string): Promise<string | null> {
  if (!brandId || !scanId) return null;
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/scans/${scanId}/response`, {
    headers: headers(),
  });
  if (!res.ok) return null;
  try {
    const json = await res.json();
    if (typeof json === "string") return json;
    return (
      json?.response ??
      json?.ai_response ??
      json?.text ??
      json?.content ??
      json?.message ??
      null
    );
  } catch {
    return null;
  }
}

export async function runScan(brandId: string, queries: string[]): Promise<{ ok: boolean; status?: string; detail?: string; engine_errors?: Record<string, string>; engines_used?: string[] }> {
  const res = await fetch(`${BASE_API_URL}/api/scan/sync`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ brand_id: brandId, queries }),
  });
  let status: string | undefined;
  let detail: string | undefined;
  let engine_errors: Record<string, string> | undefined;
  let engines_used: string[] | undefined;
  try {
    const json = await res.json();
    status = json?.status;
    detail = json?.detail;
    engine_errors = json?.engine_errors;
    engines_used = Array.isArray(json?.engines_used) ? json.engines_used : undefined;
  } catch {
    // ignore
  }
  // Treat empty engines_used (no engines available) as no_engines
  if (res.ok && engines_used && engines_used.length === 0) {
    return { ok: false, status: "no_engines", detail, engine_errors, engines_used };
  }
  return { ok: res.ok, status, detail, engine_errors, engines_used };
}

export async function fetchAllScans(_brandIds: string[], from?: string, to?: string): Promise<ScanRow[]> {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const query = params.toString();
  const res = await fetch(`${BASE_API_URL}/api/scans${query ? `?${query}` : ""}`, { headers: headers() });
  if (!res.ok) return [];
  const json = await res.json();
  const rows: ScanRow[] = Array.isArray(json) ? json : Array.isArray(json?.scans) ? json.scans : [];
  return rows.sort((a, b) => {
    const at = new Date(a.scanned_at ?? a.timestamp).getTime();
    const bt = new Date(b.scanned_at ?? b.timestamp).getTime();
    return bt - at;
  });
}

export async function deleteBrand(brandId: string): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}`, {
    method: "DELETE",
    headers: headers(),
  });
  return res.ok;
}

// --- Competitor Benchmark ---
export type BenchmarkEngineRow = { engine: string; visibility: number; mentions: number };
export type BenchmarkRow = {
  brand_name: string;
  is_self?: boolean;
  visibility_score: number;
  mentions: number;
  times_mentioned?: number;
  by_engine?: BenchmarkEngineRow[];
};

export async function runBenchmark(brandId: string): Promise<{ task_id: string } | null> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/competitors/benchmark/run`, {
    method: "POST",
    headers: headers(),
  });
  if (!res.ok) return null;
  try {
    const json = await res.json();
    return { task_id: json.task_id ?? json.taskId ?? json.id };
  } catch {
    return null;
  }
}

export async function fetchBenchmarkStatus(brandId: string, taskId: string): Promise<{ status: string } | null> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/competitors/benchmark/status/${taskId}`, { headers: headers() });
  if (!res.ok) return null;
  try {
    const json = await res.json();
    return { status: String(json.status ?? "") };
  } catch {
    return null;
  }
}

export async function fetchBenchmark(brandId: string): Promise<{ status: string; rows: BenchmarkRow[]; queries_used: string[] }> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/competitors/benchmark`, { headers: headers() });
  if (!res.ok) return { status: "", rows: [], queries_used: [] };
  const json = await res.json();
  const status = String(json?.status ?? "").toLowerCase();
  const queries_used: string[] = Array.isArray(json?.queries_used) ? json.queries_used : [];
  const normalizeEngines = (arr: any): BenchmarkEngineRow[] =>
    Array.isArray(arr)
      ? arr.map((e: any) => ({
          engine: e.engine ?? e.name ?? "",
          visibility: Number(e.visibility_pct ?? e.visibility ?? 0),
          mentions: Number(e.mentions ?? 0),
        }))
      : [];
  const normalizeRow = (r: any, is_self = false): BenchmarkRow => ({
    brand_name: r.brand_name ?? r.name ?? (is_self ? "Your brand" : "Competitor"),
    is_self,
    visibility_score: Number(r.visibility_score ?? r.visibility ?? 0),
    mentions: Number(r.times_mentioned ?? r.mentions ?? 0),
    times_mentioned: Number(r.times_mentioned ?? r.mentions ?? 0),
    by_engine: normalizeEngines(r.by_engine),
  });
  let rows: BenchmarkRow[] = [];
  if (Array.isArray(json)) rows = json.map((r: any) => normalizeRow(r, !!r.is_self));
  else if (Array.isArray(json?.results)) rows = json.results.map((r: any) => normalizeRow(r, !!r.is_self));
  else if (Array.isArray(json?.benchmark)) rows = json.benchmark.map((r: any) => normalizeRow(r, !!r.is_self));
  else if (Array.isArray(json?.competitors)) {
    const self = json.brand ? [normalizeRow(json.brand, true)] : [];
    const comps = (json.competitors as any[]).map((c) => normalizeRow(c, false));
    rows = [...self, ...comps];
  }
  return { status, rows, queries_used };
}

export type Recommendation = {
  id: string;
  recommendation: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "done";
  created_at: string;
};

export async function fetchRecommendations(brandId: string): Promise<Recommendation[]> {
  if (!brandId) return [];
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/recommendations`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = Array.isArray(json) ? json : Array.isArray(json?.recommendations) ? json.recommendations : [];
  return arr as Recommendation[];
}

export async function updateRecommendationStatus(
  brandId: string,
  recId: string,
  status: "pending" | "done",
): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/recommendations/${recId}/status`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

export async function deleteRecommendation(brandId: string, recId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/recommendations/${recId}`, {
      method: "DELETE",
      headers: headers(),
    });
    return res.ok;
  } catch {
    return false;
  }
}



export async function analyzeBrand(brandId: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/analyze`, {
    method: "POST",
    headers: headers(),
  });
  let detail: string | undefined;
  try {
    const json = await res.json();
    detail = json?.detail ?? json?.message;
  } catch {
    // ignore
  }
  return { ok: res.ok, status: res.status, detail };
}

export type TrendPoint = {
  date: string;
  visibility_score: number;
  total_scans: number;
  total_mentions: number;
};

export async function fetchTrend(brandId: string, days = 30): Promise<TrendPoint[]> {
  if (!brandId) return [];
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/trend?days=${days}`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? (json as TrendPoint[]) : [];
}

export async function saveSnapshot(brandId: string): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/snapshot`, {
    method: "POST",
    headers: headers(),
  });
  return res.ok;
}

export async function fetchUserMe(): Promise<UserMe | null> {
  const res = await fetch(`${BASE_API_URL}/api/users/me`, { headers: headers() });
  if (!res.ok) return null;
  return (await res.json()) as UserMe;
}

// --- GEO Optimization ---
export type Competitor = {
  id: string;
  name: string;
  domain: string;
};

export async function fetchCompetitors(brandId: string): Promise<Competitor[]> {
  if (!brandId) return [];
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/competitors`, { headers: headers() });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = Array.isArray(json) ? json : Array.isArray(json?.competitors) ? json.competitors : [];
  return arr as Competitor[];
}

export async function addCompetitor(brandId: string, input: { name: string; domain: string }): Promise<Competitor | null> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/competitors`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  return (await res.json()) as Competitor;
}

export async function deleteCompetitor(brandId: string, id: string): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/competitors/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  return res.ok;
}

export async function fetchLlmsTxt(brandId: string): Promise<{ llms_txt: string; domain?: string } | null> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/llms-txt`, { headers: headers() });
  if (!res.ok) return null;
  return (await res.json()) as { llms_txt: string; domain?: string };
}

export async function fetchSchemaJson(brandId: string): Promise<{ script_tag: string } | null> {
  const res = await fetch(`${BASE_API_URL}/api/brands/${brandId}/schema-json`, { headers: headers() });
  if (!res.ok) return null;
  return (await res.json()) as { script_tag: string };
}

// --- API Keys ---
export type ApiKeyProvider = "groq" | "gemini" | "openai" | "perplexity" | "anthropic" | "mistral" | "cohere" | "xai";
export type ApiKeyStatus = Record<ApiKeyProvider, boolean>;

export type EngineStatusEntry = { ok: boolean; error?: string; at: string };
export type EngineStatusMap = Partial<Record<ApiKeyProvider, EngineStatusEntry>>;
const ENGINE_STATUS_KEY = "centralynk:engine-status";

export function getEngineStatus(): EngineStatusMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ENGINE_STATUS_KEY) ?? "{}") as EngineStatusMap;
  } catch {
    return {};
  }
}

export function recordEngineStatus(connected: ApiKeyProvider[], engineErrors: Record<string, string> | undefined): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  const next: EngineStatusMap = { ...getEngineStatus() };
  const errMap: Record<string, string> = {};
  if (engineErrors) {
    for (const [k, v] of Object.entries(engineErrors)) {
      errMap[k.toLowerCase()] = v;
    }
  }
  for (const p of connected) {
    const err = errMap[p];
    next[p] = err ? { ok: false, error: err, at: now } : { ok: true, at: now };
  }
  try {
    window.localStorage.setItem(ENGINE_STATUS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function fetchApiKeys(): Promise<ApiKeyStatus> {
  const res = await fetch(`${BASE_API_URL}/api/settings/api-keys`, { headers: headers() });
  if (!res.ok) return { groq: false, gemini: false, openai: false, perplexity: false, anthropic: false, mistral: false, cohere: false, xai: false };
  return (await res.json()) as ApiKeyStatus;
}

export async function saveApiKey(provider: ApiKeyProvider, value: string): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/settings/api-keys`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ [provider]: value }),
  });
  return res.ok;
}

export async function deleteApiKey(provider: ApiKeyProvider): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/settings/api-keys/${provider}`, {
    method: "DELETE",
    headers: headers(),
  });
  return res.ok;
}

export type UserPreferences = { auto_scan: boolean; auto_analyze: boolean };

export async function fetchPreferences(): Promise<UserPreferences> {
  const res = await fetch(`${BASE_API_URL}/api/settings/preferences`, { headers: headers() });
  if (!res.ok) return { auto_scan: false, auto_analyze: false };
  const j = await res.json();
  return { auto_scan: !!j.auto_scan, auto_analyze: !!j.auto_analyze };
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<boolean> {
  const res = await fetch(`${BASE_API_URL}/api/settings/preferences`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export type AgentStat = { agent_name: string; count: number; avg_score: number };
export type FeedbackStats = {
  total_feedback: number;
  avg_score: number;
  by_agent: AgentStat[];
};

async function fetchFeedbackStatsWithToken(token: string | null): Promise<FeedbackStats> {
  const res = await fetch(`${BASE_API_URL}/api/admin/feedback/stats`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error("Failed to fetch feedback stats");
  return res.json();
}

export async function fetchFeedbackStats(): Promise<FeedbackStats> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("adminToken") : null;
  return fetchFeedbackStatsWithToken(token);
}

export async function fetchUserFeedbackStats(): Promise<FeedbackStats | null> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return null;
  try {
    return await fetchFeedbackStatsWithToken(token);
  } catch {
    return null;
  }
}

// --- Site Auditor ---
export type AuditCheck = {
  name: string;
  passed: boolean;
  detail?: string;
  fix?: string;
};

export type AuditResult = {
  score: number;
  grade: string;
  summary?: string;
  checks: AuditCheck[];
};

export async function auditSite(url: string): Promise<AuditResult> {
  const res = await fetch(`${BASE_API_URL}/api/audit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Audit failed (${res.status})`);
  const json = await res.json();
  // Normalize shape defensively
  const score = Number(json.score ?? json.overall_score ?? 0);
  const grade =
    json.grade ??
    (score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F");
  const checks: AuditCheck[] = Array.isArray(json.checks)
    ? json.checks.map((c: any) => ({
        name: c.name ?? c.check ?? "Check",
        passed: Boolean(c.passed ?? c.ok ?? c.success),
        detail: c.detail ?? c.score_detail ?? c.message,
        fix: c.fix ?? c.recommendation,
      }))
    : [];
  return {
    score,
    grade,
    summary: json.summary ?? json.ai_summary,
    checks,
  };
}
