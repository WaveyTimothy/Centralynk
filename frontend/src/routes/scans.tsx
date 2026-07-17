import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fetchBrands, fetchScans, fetchAllScans, fetchScanResponse, session, type ScanRow } from "@/lib/geo-api";
import { Check, X, Search, ChevronDown, Loader2 } from "lucide-react";
import { CalendarIcon } from "@/components/custom-icons";
import { useRequireAccess } from "@/hooks/use-require-access";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scans")({
  head: () => ({ meta: [{ title: "Scan History, Centralynk" }] }),
  component: ScansPage,
});

function ScansPage() {
  useRequireAccess();
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });

  const [brandId, setBrandId] = useState<string>(session.getActiveBrand() ?? "");
  const [engine, setEngine] = useState<string>("all");
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  // Only apply date filter when user clicks Apply
  const [appliedFrom, setAppliedFrom] = useState<Date | undefined>(undefined);
  const [appliedTo, setAppliedTo] = useState<Date | undefined>(undefined);

  const allBrandsMode = !brandId;
  const effectiveBrand = brandId || brands[0]?.id || "";

  const fromStr = appliedFrom ? format(appliedFrom, "yyyy-MM-dd") : undefined;
  const toStr = appliedTo ? format(appliedTo, "yyyy-MM-dd") : undefined;

  const { data: scans = [] } = useQuery({
    queryKey: ["scans", allBrandsMode ? "__all__" : effectiveBrand, fromStr, toStr, allBrandsMode ? brands.map((b) => b.id).join(",") : ""],
    queryFn: () =>
      allBrandsMode
        ? fetchAllScans(brands.map((b) => b.id), fromStr, toStr)
        : fetchScans(effectiveBrand, fromStr, toStr),
    enabled: allBrandsMode ? brands.length > 0 : !!effectiveBrand,
  });

  const engines = useMemo(() => {
    const set = new Set(scans.map((s) => s.engine));
    return Array.from(set);
  }, [scans]);

  const filtered = scans.filter((s) => {
    if (engine !== "all" && s.engine !== engine) return false;
    const ts = s.scanned_at ?? s.timestamp;
    if (appliedFrom || appliedTo) {
      const d = new Date(ts);
      if (isNaN(+d)) return false;
      if (appliedFrom) {
        const start = new Date(appliedFrom);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (appliedTo) {
        const end = new Date(appliedTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6 w-full min-h-screen">

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every query we've run against the AI engines for your brands.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-3">
        <Filter label="Brand">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[180px]"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Filter>
        <Filter label="Engine">
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[160px]"
          >
            <option value="all">All engines</option>
            {engines.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Filter>
        <Filter label="From">
          <DateField value={from} onChange={setFrom} placeholder="Start date" />
        </Filter>
        <Filter label="To">
          <DateField value={to} onChange={setTo} placeholder="End date" />
        </Filter>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setAppliedFrom(from);
              setAppliedTo(to);
            }}
            className="inline-flex items-center justify-center h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Engine</th>
                <th className="px-4 py-3 font-medium">Query</th>
                <th className="px-4 py-3 font-medium">Mentioned</th>
                <th className="px-4 py-3 font-medium">Sentiment</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: ScanRow) => <Row key={r.scan_id} row={r} brandId={r.brand_id ?? effectiveBrand} />)}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No scans match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function DateField({
  value,
  onChange,
  placeholder,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[170px] hover:bg-muted/50 transition-colors",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">
            {value ? format(value, "MMM d, yyyy") : placeholder}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function Row({ row, brandId }: { row: ScanRow; brandId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mentioned = row.mentioned ?? row.status === "Mentioned";
  const sentimentColor =
    row.sentiment === "Positive" ? "text-success"
      : row.sentiment === "Negative" ? "text-destructive"
        : "text-warning";

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && response == null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const txt = await fetchScanResponse(brandId, row.scan_id);
        if (txt == null) setError("No response available for this scan.");
        else setResponse(txt);
      } catch {
        setError("Failed to load AI response.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <>
      <tr className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={toggle}>
        <td className="px-4 py-3">
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-info/10 border border-info/20 px-2 py-0.5 text-xs font-medium text-info">
            {row.engine}
          </span>
        </td>
        <td className="px-4 py-3 max-w-md">
          <div className="flex items-start gap-2">
            <Search className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-sm text-foreground/90 truncate">{row.query}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          {mentioned ? (
            <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
              <Check className="size-3.5" /> Yes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-medium">
              <X className="size-3.5" /> No
            </span>
          )}
        </td>
        <td className={`px-4 py-3 text-xs font-medium ${sentimentColor}`}>{row.sentiment}</td>
        <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
          {formatTs(row.scanned_at ?? row.timestamp)}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={6} className="px-6 py-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">What AI said:</div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading response…
              </div>
            ) : error ? (
              <div className="text-sm text-muted-foreground italic">{error}</div>
            ) : (
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {response}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function formatTs(s: string) {
  const d = new Date(s);
  if (isNaN(+d)) return s;
  return format(d, "MMM d, yyyy 'at' HH:mm");
}
