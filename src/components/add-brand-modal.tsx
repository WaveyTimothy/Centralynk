import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createBrand } from "@/lib/geo-api";
import { useQueryClient } from "@tanstack/react-query";
import { AddIcon } from "@/components/custom-icons";

export function AddBrandModal({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    const brand = await createBrand({
      name: name.trim(),
      domain: domain.trim(),
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!brand) {
      setErr("Could not create brand. Check the API and try again.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["brands"] });
    setName(""); setDomain(""); setKeywords("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition">
            <AddIcon className="size-4" /> Add Your Brand
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a brand</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Brand Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
          </Field>
          <Field label="Domain">
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          </Field>
          <Field label="Keywords (comma separated)">
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="crm, sales automation, b2b saas"
            />
          </Field>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add Brand"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
