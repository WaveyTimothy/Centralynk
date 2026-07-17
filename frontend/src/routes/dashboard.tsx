import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  fetchBrands,
  fetchDashboard,
  fetchRecommendations,
  deleteRecommendation,
  analyzeBrand,
  fetchTrend,
  fetchScans,
  saveSnapshot,
  fetchApiKeys,
  session,
  type DashboardData,
  type TrendPoint,
} from "@/lib/geo-api";
import { Activity, Quote, ScanLine, Lightbulb, CheckCircle2, Clock, Loader2, Sparkles, Camera, TrendingUp, Key, Info, AlertTriangle } from "lucide-react";
import { useRequireAccess } from "@/hooks/use-require-access";
import { AddBrandModal } from "@/components/add-brand-modal";
import { RunScanModal } from "@/components/run-scan-modal";
import { AgentInvocationIcon, ScanAltIcon, ModelContentDocIcon, AgentDetachedIcon, DataEnrichmentIcon, SlisorIcon, DropPhotoIcon, AnalyticsIcon } from "@/components/custom-icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Overview, Centralynk" }] }),
  component: Overview,
});

function Overview() {
  useRequireAccess();
  const [activeBrand, setActiveBrand] = useState<string | null>(session.getActiveBrand());

  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });

  useEffect(() => {
    if (!activeBrand && brands.length > 0) {
      session.setActiveBrand(brands[0].id);
      setActiveBrand(brands[0].id);
    }
  }, [brands, activeBrand]);

  const { data } = useQuery({
    queryKey: ["dashboard", activeBrand],
    queryFn: () => fetchDashboard(activeBrand ?? ""),
    enabled: !!activeBrand,
  });

  const d: DashboardData = data ?? {};
  const visibility = d.visibilityShare;
  const totalScans = d.totalScans ?? 0;
  const totalCitations = d.totalCitations ?? 0;
  const engines = d.engines ?? [];
  const hasData = d.visibilityShare != null;

  const activeBrandObj = brands.find((b) => b.id === activeBrand);

  return (
    <div className="space-y-6 w-full min-h-screen">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time visibility across generative AI search surfaces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {brands.length > 0 && (
            <select
              value={activeBrand ?? ""}
              onChange={(e) => {
                session.setActiveBrand(e.target.value);
                setActiveBrand(e.target.value);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          {activeBrand && <RunAnalysisButton brandId={activeBrand} />}
          {activeBrand && <SaveSnapshotButton brandId={activeBrand} />}
          <AddBrandModal />
          <RunScanModal />
        </div>
      </div>


      <NoApiKeysBanner />

      {brands.length === 0 ? (
        <EmptyState />
      ) : !hasData ? (
        <>
          <OnboardingCard />
          <VisibilityTrendChart brandId={activeBrand ?? ""} />
          <EngineMatrix rows={engines} />
          <Recommendations brandId={activeBrand ?? ""} />
          {activeBrandObj && (
            <div className="text-xs text-muted-foreground">
              Showing <span className="text-foreground font-medium">{activeBrandObj.name}</span>
              {activeBrandObj.domain ? ` · ${activeBrandObj.domain}` : ""}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <VisibilityCard value={visibility} />
            <NumberCard icon={ScanAltIcon} tone="info" label="Total AI Engine Scans" value={totalScans} />
            <NumberCard icon={ModelContentDocIcon} tone="primary" label="Total Citations & Mentions" value={totalCitations} />
            <SentimentCard score={d.sentimentBreakdown?.score} />
          </div>
          <VisibilityTrendChart brandId={activeBrand ?? ""} />
          <EngineMatrix rows={engines} />
          <Recommendations brandId={activeBrand ?? ""} />
          {activeBrandObj && (
            <div className="text-xs text-muted-foreground">
              Showing <span className="text-foreground font-medium">{activeBrandObj.name}</span>
              {activeBrandObj.domain ? ` · ${activeBrandObj.domain}` : ""}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NoApiKeysBanner() {
  const { data: keys } = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  if (!keys) return null;
  const anyConnected = Object.values(keys).some(Boolean);
  if (anyConnected) return null;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
      <AlertTriangle className="size-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">To start scanning, add your Groq API key in Settings.</div>
        <div className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
          Get a free key at{" "}
          <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            console.groq.com
          </a>
          .
        </div>
      </div>
      <Link
        to="/settings"
        className="inline-flex items-center h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
      >
        Go to Settings
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <AgentInvocationIcon className="size-8 mx-auto text-muted-foreground" />
      <div className="mt-3 text-base font-semibold">No brands yet</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first brand to start tracking AI visibility.
      </p>
      <div className="mt-5">
        <AddBrandModal />
      </div>
    </div>
  );
}

function OnboardingCard() {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            <h3 className="text-base font-semibold tracking-tight">Add your API keys to start scanning</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Centralynk requires your own API keys to scan AI engines.
            This ensures you get real, accurate data, not simulated results.
          </p>
          <div className="space-y-1 text-sm">
            <div className="font-medium">Recommended to start:</div>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Groq (free tier), <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.groq.com</a></li>
              <li>Perplexity, most accurate, web-aware results</li>
            </ul>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Settings →
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>{children}</div>;
}

function VisibilityCard({ value }: { value?: number | null }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <Card className="relative overflow-hidden">
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        Overall Visibility Share
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
              Your visibility score shows how often AI mentions
              your brand across all your tracked queries.
              More queries = more accurate picture.
              Score updates with every new scan.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <div className="relative size-28">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            <circle
              cx="50" cy="50" r={r} fill="none"
              stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${value == null ? 0 : dash} ${c}`} className="transition-all duration-700"
            />
          </svg>
        </div>
        <div>
          <div className="text-4xl font-semibold tracking-tight tabular-nums">
            {value == null ? "—" : <>{pct.toFixed(0)}<span className="text-xl text-muted-foreground">%</span></>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {value == null ? "Add API keys to see your score" : "across all engines"}
          </div>
        </div>
      </div>
    </Card>
  );
}

function NumberCard({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; tone: "info" | "primary";
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">
        {value.toLocaleString()}
      </div>
    </Card>
  );
}

function SentimentCard({ score }: { score?: number }) {
  const label =
    score == null
      ? "—"
      : score >= 70
        ? "Positive"
        : score >= 40
          ? "Neutral"
          : "Negative";
  const tone =
    score == null
      ? "bg-muted text-muted-foreground border-border"
      : score >= 70
        ? "bg-success/15 text-success border-success/30"
        : score >= 40
          ? "bg-warning/15 text-warning border-warning/30"
          : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Average AI Sentiment Score
        </div>
        <AgentDetachedIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-5">
        <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-base font-semibold ${tone}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {label}
        </span>
      </div>
    </Card>
  );
}

function EngineMatrix({ rows }: { rows: NonNullable<DashboardData["engines"]> }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight">Engine Breakdown</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Per-provider scans, mentions, ranks and visibility share.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Generative Engine</th>
              <th className="px-5 py-3 font-medium text-right">Scans Run</th>
              <th className="px-5 py-3 font-medium text-right">Brand Mentions</th>
              <th className="px-5 py-3 font-medium text-right">Avg Rank</th>
              <th className="px-5 py-3 font-medium w-[28%]">Visibility %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.engine} className="border-t border-border hover:bg-muted/40">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-info" />
                    <span className="font-medium">{r.engine}</span>
                  </span>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{r.scans.toLocaleString()}</td>
                <td className="px-5 py-3 text-right tabular-nums">{r.mentions.toLocaleString()}</td>
                <td className="px-5 py-3 text-right tabular-nums">{r.avgRank.toFixed(1)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                        style={{ width: `${Math.min(100, r.visibility)}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">
                      {r.visibility}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No scan data yet, run your first scan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RunAnalysisButton({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => analyzeBrand(brandId),
    onSuccess: (result) => {
      if (!result.ok) {
        const detail = result.detail ?? "";
        const isMissingKey = /no\s+\w+\s+api\s+key/i.test(detail) || /api key/i.test(detail);
        if (isMissingKey || [400, 404, 422].includes(result.status)) {
          const provider = /groq/i.test(detail) ? "Groq" : /perplexity/i.test(detail) ? "Perplexity" : /openai/i.test(detail) ? "OpenAI" : "Groq";
          const link = provider === "Groq" ? "console.groq.com" : provider === "Perplexity" ? "perplexity.ai/settings/api" : "platform.openai.com";
          toast.warning(`Add your ${provider} API key in Settings to use AI Analysis`, {
            description: `Get a free key at ${link}`,
            action: { label: "Open Settings", onClick: () => navigate({ to: "/settings" }) },
            duration: 8000,
          });
          return;
        }
        toast.error(detail || "Analysis failed");
        return;
      }
      qc.invalidateQueries({ queryKey: ["recommendations", brandId] });
      qc.invalidateQueries({ queryKey: ["dashboard", brandId] });
    },
  });
  const navigate = useNavigate();
  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="inline-flex items-center gap-2 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Analyzing…
        </>
      ) : (
        <>
          <SlisorIcon className="size-4" />
          Run Analysis
        </>
      )}
    </button>
  );
}

function priorityBadgeClass(p: string) {
  switch (p) {
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "high":
      return "bg-warning/15 text-warning border-warning/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}


function Recommendations({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { data: rawRecs = [], isLoading, isFetching } = useQuery({
    queryKey: ["recommendations", brandId],
    queryFn: () => fetchRecommendations(brandId),
    enabled: !!brandId,
  });

  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const markDone = async (recId: string) => {
    setRemoving((prev) => new Set(prev).add(recId));
    const ok = await deleteRecommendation(brandId, recId);
    if (ok) {
      qc.setQueryData<typeof rawRecs>(["recommendations", brandId], (old) =>
        (old ?? []).filter((r) => r.id !== recId),
      );
    } else {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(recId);
        return next;
      });
    }
  };

  const recs = rawRecs.filter((r) => !removing.has(r.id));

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <DataEnrichmentIcon className="size-4 text-muted-foreground" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold tracking-tight">Recommendations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recommendations stay here until you mark them done. Run Analysis to add more.
          </p>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading recommendations…
          </div>
        ) : recs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No recommendations yet. Click "Run Analysis" to generate some.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recs.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-background/40 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${priorityBadgeClass(r.priority)}`}>
                    {r.priority}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">
                  {r.recommendation}
                </p>
                <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    <Clock className="size-3" /> Pending
                  </span>
                  <button
                    onClick={() => markDone(r.id)}
                    className="inline-flex items-center gap-1 h-7 rounded-md border border-success/40 bg-success/10 text-success hover:bg-success/20 px-2.5 text-xs font-medium transition-colors"
                  >
                    <CheckCircle2 className="size-3" />
                    Mark as done
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function SaveSnapshotButton({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => saveSnapshot(brandId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trend", brandId] });
    },
  });
  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="inline-flex items-center gap-2 h-9 rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {mutation.isPending ? (
        <><Loader2 className="size-4 animate-spin" />Saving…</>
      ) : (
        <><DropPhotoIcon className="size-4" />Save Snapshot</>
      )}
    </button>
  );
}

function formatShortDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreColor(score: number) {
  if (score > 70) return "hsl(142 71% 45%)";
  if (score >= 50) return "hsl(38 92% 50%)";
  return "hsl(0 84% 60%)";
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">{formatShortDate(p.date)}</div>
      <div className="text-muted-foreground mt-1">
        Score: <span className="text-foreground font-medium">{p.visibility_score.toFixed(0)}%</span>
      </div>
      <div className="text-muted-foreground">
        Scans: <span className="text-foreground font-medium">{p.total_scans}</span>
      </div>
    </div>
  );
}

function computeTrendFromScans(scans: Array<{ scanned_at?: string; timestamp?: string; mentioned?: boolean }>, days = 30): TrendPoint[] {
  if (!scans.length) return [];
  const byDay = new Map<string, { scans: number; mentions: number }>();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const s of scans) {
    const raw = s.scanned_at ?? s.timestamp;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    const day = new Date(raw).toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { scans: 0, mentions: 0 };
    entry.scans += 1;
    if (s.mentioned) entry.mentions += 1;
    byDay.set(day, entry);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      visibility_score: v.scans ? (v.mentions / v.scans) * 100 : 0,
      total_scans: v.scans,
      total_mentions: v.mentions,
    }));
}

function VisibilityTrendChart({ brandId }: { brandId: string }) {
  const { data: snapshots = [], isLoading: trendLoading } = useQuery({
    queryKey: ["trend", brandId],
    queryFn: () => fetchTrend(brandId, 30),
    enabled: !!brandId,
  });
  const { data: scans = [], isLoading: scansLoading } = useQuery({
    queryKey: ["scans-trend", brandId],
    queryFn: () => fetchScans(brandId),
    enabled: !!brandId,
  });

  const trend: TrendPoint[] = snapshots.length >= 2 ? snapshots : computeTrendFromScans(scans, 30);
  const isLoading = trendLoading || scansLoading;
  const hasAnyScans = scans.length > 0;

  const avgScore = trend.length
    ? trend.reduce((s, p) => s + p.visibility_score, 0) / trend.length
    : 0;
  const lineColor = scoreColor(avgScore);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <AnalyticsIcon className="size-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Visibility Trend</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
        </div>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading trend…
          </div>
        ) : trend.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
            {hasAnyScans
              ? "Not enough scan history yet, run more scans to build the trend line."
              : "No scan data yet, run your first scan to start tracking visibility."}
          </div>
        ) : trend.length === 1 ? (
          <div className="h-[260px] flex flex-col items-center justify-center gap-2">
            <div className="text-3xl font-semibold tabular-nums" style={{ color: scoreColor(trend[0].visibility_score) }}>
              {trend[0].visibility_score.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">First data point, more scans build the trend line over time.</div>
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  width={45}
                />
                <RTooltip content={<TrendTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Line
                  type="monotone"
                  dataKey="visibility_score"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: lineColor, strokeWidth: 0 }}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}



