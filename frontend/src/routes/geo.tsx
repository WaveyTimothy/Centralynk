import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Copy, Plus, Loader2, Check, X } from "lucide-react";
import { ScriptIcon, CodeIcon, AgentInvocationIcon, SearchLocateMirrorIcon } from "@/components/custom-icons";
import digitalTwinAsset from "@/assets/digital-twin.svg.asset.json";
import {
  fetchBrands,
  fetchCompetitors,
  addCompetitor,
  deleteCompetitor,
  fetchLlmsTxt,
  fetchSchemaJson,
  auditSite,
  runBenchmark,
  fetchBenchmarkStatus,
  fetchBenchmark,
  fetchDashboard,
  session,
  type Competitor,
  type AuditResult,
  type BenchmarkRow,
  type EngineRow,
} from "@/lib/geo-api";
import { useRequireAccess } from "@/hooks/use-require-access";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function DigitalTwinIcon({ className }: { className?: string }) {
  return <img src={digitalTwinAsset.url} alt="" className={`inline-block opacity-60 dark:invert ${className ?? ""}`} />;
}

export const Route = createFileRoute("/geo")({
  head: () => ({ meta: [{ title: "GEO Optimization, Centralynk" }] }),
  component: GeoPage,
});

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="relative">
      <pre className="rounded-md border border-border bg-zinc-950 text-zinc-100 text-xs p-4 overflow-x-auto max-h-[420px] whitespace-pre-wrap break-words">
        {text}
      </pre>
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-xs text-zinc-100"
      >
        <Copy className="size-3" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function GeoPage() {
  useRequireAccess();
  const qc = useQueryClient();
  const [activeBrand, setActiveBrand] = useState<string | null>(session.getActiveBrand());

  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });

  useEffect(() => {
    if (!activeBrand && brands.length > 0) {
      session.setActiveBrand(brands[0].id);
      setActiveBrand(brands[0].id);
    }
  }, [brands, activeBrand]);

  const brandId = activeBrand ?? "";
  const activeBrandObj = brands.find((b) => b.id === activeBrand);

  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors", brandId],
    queryFn: () => fetchCompetitors(brandId),
    enabled: !!brandId,
  });

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  const addMut = useMutation({
    mutationFn: () => addCompetitor(brandId, { name: name.trim(), domain: domain.trim() }),
    onSuccess: (res) => {
      if (!res) return toast.error("Failed to add competitor");
      toast.success("Competitor added");
      setName("");
      setDomain("");
      qc.invalidateQueries({ queryKey: ["competitors", brandId] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteCompetitor(brandId, id),
    onSuccess: (ok) => {
      if (!ok) return toast.error("Failed to delete");
      toast.success("Competitor removed");
      qc.invalidateQueries({ queryKey: ["competitors", brandId] });
    },
  });

  const [llmsTxt, setLlmsTxt] = useState<string | null>(null);
  const [llmsDomain, setLlmsDomain] = useState<string | undefined>(undefined);
  const llmsMut = useMutation({
    mutationFn: () => fetchLlmsTxt(brandId),
    onSuccess: (res) => {
      if (!res) return toast.error("Failed to generate llms.txt");
      setLlmsTxt(res.llms_txt);
      setLlmsDomain(res.domain ?? activeBrandObj?.domain);
    },
  });

  const [schemaTag, setSchemaTag] = useState<string | null>(null);
  const schemaMut = useMutation({
    mutationFn: () => fetchSchemaJson(brandId),
    onSuccess: (res) => {
      if (!res) return toast.error("Failed to generate schema");
      setSchemaTag(res.script_tag);
    },
  });

  const [auditUrl, setAuditUrl] = useState("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const auditMut = useMutation({
    mutationFn: (url: string) => auditSite(url),
    onSuccess: (res) => setAuditResult(res),
    onError: (e: Error) => toast.error(e.message || "Audit failed"),
  });

  return (
    <div className="space-y-6 w-full min-h-screen">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GEO Optimization</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track competitors and generate AI-ready discovery files.
          </p>
        </div>
        {brands.length > 0 && (
          <select
            value={activeBrand ?? ""}
            onChange={(e) => {
              session.setActiveBrand(e.target.value);
              setActiveBrand(e.target.value);
              setLlmsTxt(null);
              setSchemaTag(null);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Competitors */}
      <Card>
        <CardHeader>
          <CardTitle>Competitors</CardTitle>
          <CardDescription>Brands you want to benchmark against in AI search results.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !domain.trim() || !brandId) return;
              addMut.mutate();
            }}
          >
            <Input
              placeholder="Competitor name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="sm:max-w-[240px]"
            />
            <Input
              placeholder="domain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="sm:max-w-[280px]"
            />
            <Button type="submit" disabled={addMut.isPending || !name.trim() || !domain.trim()}>
              {addMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>

          {competitors.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
              No competitors yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {competitors.map((c: Competitor) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.domain}</div>
                  </div>
                  <button
                    onClick={() => delMut.mutate(c.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    aria-label="Delete competitor"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* llms.txt */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScriptIcon className="size-4 text-muted-foreground" />
                llms.txt Generator
              </CardTitle>
              <CardDescription>Help AI crawlers understand and index your brand.</CardDescription>
            </div>
            <Button onClick={() => llmsMut.mutate()} disabled={!brandId || llmsMut.isPending}>
              {llmsMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <AgentInvocationIcon className="size-4" />}
              Generate llms.txt
            </Button>
          </div>
        </CardHeader>
        {llmsTxt && (
          <CardContent className="space-y-3">
            <CopyBlock text={llmsTxt} />
            <p className="text-xs text-muted-foreground">
              Place this file at{" "}
              <code className="text-foreground">
                https://{llmsDomain ?? activeBrandObj?.domain ?? "yourdomain.com"}/llms.txt
              </code>
            </p>
          </CardContent>
        )}
      </Card>

      {/* Schema.org */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CodeIcon className="size-4 text-muted-foreground" />
                Schema.org Generator
              </CardTitle>
              <CardDescription>Structured data to boost AI and search understanding.</CardDescription>
            </div>
            <Button onClick={() => schemaMut.mutate()} disabled={!brandId || schemaMut.isPending}>
              {schemaMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <AgentInvocationIcon className="size-4" />}
              Generate Schema JSON-LD
            </Button>
          </div>
        </CardHeader>
        {schemaTag && (
          <CardContent className="space-y-3">
            <CopyBlock text={schemaTag} />
            <p className="text-xs text-muted-foreground">
              Paste this script tag inside the <code className="text-foreground">&lt;head&gt;</code> of your website.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Site Auditor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SearchLocateMirrorIcon className="size-4 text-muted-foreground" />
            Site Auditor
          </CardTitle>
          <CardDescription>
            Crawl any URL and get an AI-powered GEO readiness score with actionable fixes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const url = auditUrl.trim();
              if (!url) return;
              setAuditResult(null);
              auditMut.mutate(url);
            }}
          >
            <Input
              type="url"
              placeholder="https://yourdomain.com"
              value={auditUrl}
              onChange={(e) => setAuditUrl(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={auditMut.isPending || !auditUrl.trim()}>
              {auditMut.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Crawling and analyzing...
                </>
              ) : (
                <>
                  <AgentInvocationIcon className="size-4" />
                  Audit Site
                </>
              )}
            </Button>
          </form>

          {auditMut.isPending && (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-md">
              Crawling and analyzing... this can take 10–30 seconds.
            </div>
          )}

          {auditResult && <AuditResultView result={auditResult} />}
        </CardContent>
      </Card>

      {/* Competitor Benchmark */}
      <CompetitorBenchmark brandId={brandId} />
    </div>
  );
}

function CompetitorBenchmark({ brandId }: { brandId: string }) {
  const [, setTaskId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [results, setResults] = useState<BenchmarkRow[] | null>(null);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPolling(false);
  };

  useEffect(() => {
    let cancelled = false;
    if (brandId) {
      fetchBenchmark(brandId).then((data) => {
        if (cancelled) return;
        if (data.rows && data.rows.length > 0) {
          setResults(data.rows);
          setQueriesUsed(data.queries_used ?? []);
        }
      });
    }
    return () => {
      cancelled = true;
      stop();
    };
  }, [brandId]);

  const start = async () => {
    if (!brandId) return;
    setError(null);
    setResults(null);
    setQueriesUsed([]);
    setPolling(true);
    startedAtRef.current = Date.now();
    const res = await runBenchmark(brandId);
    if (!res?.task_id) {
      setError("Failed to start benchmark");
      setPolling(false);
      return;
    }
    setTaskId(res.task_id);
    timerRef.current = setInterval(async () => {
      if (Date.now() - startedAtRef.current > 3 * 60 * 1000) {
        stop();
        setError("Benchmark timed out. Try again.");
        return;
      }
      const s = await fetchBenchmarkStatus(brandId, res.task_id);
      const st = (s?.status ?? "").toLowerCase();
      if (st === "success" || st === "complete") {
        stop();
        const data = await fetchBenchmark(brandId);
        setResults(data.rows);
        setQueriesUsed(data.queries_used ?? []);
      } else if (st === "failed" || st === "error") {
        stop();
        setError("Benchmark failed. Try again.");
      }
    }, 5000);
  };

  const hasResults = results && results.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DigitalTwinIcon className="size-4" />
              Competitor Benchmark
            </CardTitle>
            <CardDescription>
              Compare your brand visibility against tracked competitors across AI engines.
            </CardDescription>
          </div>
          <Button onClick={start} disabled={!brandId || polling}>
            {polling ? <Loader2 className="size-4 animate-spin" /> : <AgentInvocationIcon className="size-4" />}
            {polling ? "Running…" : "Run Benchmark"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasResults && !polling && !error && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            💡 Benchmark uses your category scan queries. Run a scan first with industry queries like "best [your category] tool" for meaningful results.
          </div>
        )}
        {polling && (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
            Running benchmark… this takes ~2 minutes.
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {hasResults && <BenchmarkTable rows={results!} brandId={brandId} />}
        {hasResults && queriesUsed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Queries used:</span> {queriesUsed.join(", ")}
          </p>
        )}
        {results && results.length === 0 && !polling && (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
            No benchmark data returned.
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function BenchmarkTable({ rows, brandId }: { rows: BenchmarkRow[]; brandId: string }) {
  const dashQuery = useQuery({
    queryKey: ["dashboard-engines", brandId],
    queryFn: () => fetchDashboard(brandId),
    enabled: !!brandId,
    staleTime: 60_000,
  });
  const dashEngines: EngineRow[] = dashQuery.data?.engines ?? [];
  const engineKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const getSelfEngineVis = (engine: string): number | null => {
    const match = dashEngines.find((e) => engineKey(e.engine) === engineKey(engine));
    if (!match) return null;
    return match.visibility ?? null;
  };
  const engines = Array.from(
    new Set(rows.flatMap((r) => (r.by_engine ?? []).map((e) => e.engine))),
  );
  const sorted = [...rows].sort((a, b) => (b.visibility_score ?? 0) - (a.visibility_score ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="px-3 py-2 font-medium">Brand</th>
            <th className="px-3 py-2 font-medium text-right">Visibility</th>
            <th className="px-3 py-2 font-medium text-right">Mentions</th>
            {engines.map((e) => (
              <th key={e} className="px-3 py-2 font-medium text-right">{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={`${r.brand_name}-${i}`} className={`border-b border-border ${r.is_self ? "bg-primary/5" : ""}`}>
              <td className="px-3 py-2 font-medium">
                {r.brand_name}
                {r.is_self && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    You
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{(r.visibility_score ?? 0).toFixed(0)}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.times_mentioned ?? r.mentions ?? 0}</td>
              {engines.map((e) => {
                const cell = (r.by_engine ?? []).find((x) => x.engine === e);
                let display = cell ? `${(cell.visibility ?? 0).toFixed(0)}%` : "—";
                if (!cell && r.is_self) {
                  const fallback = getSelfEngineVis(e);
                  if (fallback != null) display = `${fallback.toFixed(0)}%`;
                }
                return (
                  <td key={e} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function scoreColors(score: number) {
  if (score >= 75) return { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" };
  if (score >= 50) return { text: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30" };
  return { text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30" };
}

function AuditResultView({ result }: { result: AuditResult }) {
  const c = scoreColors(result.score);
  const failed = result.checks.filter((x) => !x.passed);

  return (
    <div className="space-y-6">
      {/* Score card */}
      <div className={`rounded-lg border ${c.border} ${c.bg} p-6 flex flex-col sm:flex-row sm:items-center gap-6`}>
        <div className="flex items-baseline gap-3">
          <div className={`text-6xl font-bold tabular-nums ${c.text}`}>{result.score}</div>
          <div className={`text-3xl font-semibold ${c.text}`}>{result.grade}</div>
          <div className="text-sm text-muted-foreground">/ 100</div>
        </div>
        {result.summary && (
          <p className="text-sm text-foreground/90 sm:flex-1">{result.summary}</p>
        )}
      </div>

      {/* Checks */}
      {result.checks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Checks</h3>
          <div className="space-y-2">
            {result.checks.map((chk, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-card px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  {chk.passed ? (
                    <Check className="size-5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <X className="size-5 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{chk.name}</div>
                    {chk.detail && (
                      <div className="text-xs text-muted-foreground mt-0.5">{chk.detail}</div>
                    )}
                  </div>
                </div>
                {!chk.passed && chk.fix && (
                  <div className="mt-3 ml-8 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    <span className="font-semibold text-amber-900 dark:text-amber-300">Fix: </span>
                    {chk.fix}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick wins */}
      {failed.length > 0 && failed.some((f) => f.fix) && (
        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Quick Wins</h3>
          <ol className="space-y-2 list-decimal list-inside text-sm text-foreground/90">
            {failed.filter((f) => f.fix).map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}:</span>{" "}
                <span className="text-muted-foreground">{f.fix}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
