import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBrands, runScan, session, recordEngineStatus, type ApiKeyProvider, type ApiKeyStatus } from "@/lib/geo-api";
import { ICA2DIcon } from "@/components/custom-icons";
import { Key } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";


export function RunScanModal({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState<string>(session.getActiveBrand() ?? "");
  const [queries, setQueries] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isLimitError, setIsLimitError] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [engineErrors, setEngineErrors] = useState<Record<string, string> | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });

  const submit = async () => {
    const list = queries.split("\n").map((q) => q.trim()).filter(Boolean);
    if (!brandId || list.length === 0) return;
    setBusy(true);
    setErr(null);
    setIsLimitError(false);
    setEngineErrors(null);
    const result = await runScan(brandId, list);
    setBusy(false);
    if (!result.ok && result.status === "no_engines") {
      setShowOnboarding(true);
      return;
    }
    if (!result.ok) {
      const detail = result.detail?.toLowerCase?.() ?? "";
      if (detail.includes("limit") || detail.includes("daily")) {
        setIsLimitError(true);
        setErr("⚡ Daily scan limit reached\nYou've used all your scans for today.\nResets at midnight UTC.\nWant more? Self-host Centralynk for unlimited scans.");
        return;
      }
      setErr("Scan failed to start. Try again.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["scans"] });
    const keys = qc.getQueryData<ApiKeyStatus>(["api-keys"]);
    if (keys) {
      const connected = (Object.keys(keys) as ApiKeyProvider[]).filter((k) => keys[k]);
      recordEngineStatus(connected, result.engine_errors);
    }
    if (result.engine_errors && Object.keys(result.engine_errors).length > 0) {
      setEngineErrors(result.engine_errors);
      setQueries("");
      return;
    }
    setQueries("");
    setShowOnboarding(false);
    setOpen(false);
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowOnboarding(false); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition">
            <ICA2DIcon className="size-4" /> Run New Scan
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{showOnboarding ? "API Keys Required" : "Run a new scan"}</DialogTitle>
        </DialogHeader>
        {showOnboarding ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Key className="size-5 text-primary" />
              <h3 className="text-base font-semibold tracking-tight">Add your API keys to start scanning</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Centralynk requires your own API keys to scan AI engines.
              This ensures you get real, accurate data — not simulated results.
            </p>
            <div className="space-y-1 text-sm">
              <div className="font-medium">Recommended to start:</div>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Groq (free tier) — <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.groq.com</a></li>
                <li>Perplexity — most accurate, web-aware results</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowOnboarding(false); setOpen(false); }}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Close
              </button>
              <button
                onClick={() => navigate({ to: "/settings" })}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Go to Settings →
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select a brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Custom Queries (one per line)
              </label>
              <Textarea
                rows={6}
                value={queries}
                onChange={(e) => setQueries(e.target.value)}
                placeholder={"best crm for startups\ntop sales automation tools 2026"}
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                💡 Use category queries like "best CRM software" not your brand name — this gives more accurate AI visibility data and enables fair competitor benchmarking.
              </p>
            </div>
            {engineErrors && Object.keys(engineErrors).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(engineErrors).map(([engine, msg]) => (
                  <div key={engine} className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                    ⚠️ <span className="font-semibold">{engine}:</span> {msg}
                  </div>
                ))}
              </div>
            )}
            {err && (
              isLimitError ? (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 whitespace-pre-line">
                  {err}
                </div>
              ) : (
                <div className="text-xs text-destructive">{err}</div>
              )
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || !brandId || !queries.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Running…" : "Run Scan"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
