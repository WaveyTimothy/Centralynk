import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  fetchUserMe,
  fetchApiKeys,
  saveApiKey,
  deleteApiKey,
  fetchPreferences,
  updatePreferences,
  session,
  getEngineStatus,
  type UserMe,
  type ApiKeyProvider,
  type ApiKeyStatus,
  type EngineStatusEntry,
  type UserPreferences,
} from "@/lib/geo-api";
import { useRequireAccess } from "@/hooks/use-require-access";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserAdminIcon, ChartClusterBarIcon, CodeSigningServiceIcon, LogoutIcon } from "@/components/custom-icons";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Account Settings, Centralynk" }] }),
  component: SettingsPage,
});

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatLastSeen(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SettingsPage() {
  useRequireAccess();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user-me"],
    queryFn: fetchUserMe,
  });

  const u: UserMe | null = user ?? null;
  const scansUsed = u?.scans_used ?? 0;
  const scansMax = u?.scans_max ?? 100;
  const scansRemaining = Math.max(0, scansMax - scansUsed);
  const usagePct = scansMax > 0 ? Math.min(100, Math.round((scansUsed / scansMax) * 100)) : 0;

  const qcRoot = useQueryClient();
  const handleLogout = async () => {
    await qcRoot.cancelQueries();
    qcRoot.clear();
    session.clear();
    if (typeof window !== "undefined") {
      window.location.href = "https://centralynk.com";
    } else {
      navigate({ to: "/" });
    }
  };

  return (
    <div className="space-y-6 w-full min-h-screen">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and monitor usage.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Profile Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserAdminIcon className="size-4 text-muted-foreground" />
                  <CardTitle>Profile</CardTitle>
                </div>
                <CardDescription>Your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{u?.email ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Organisation</span>
                  <span className="font-medium">{u?.organisation_name ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Role</span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {u?.role ?? "member"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary capitalize">
                    {u?.plan ?? "free"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">{u?.created_at ? formatDate(u.created_at) : "—"}</span>
                </div>
              </CardContent>
            </Card>

            {/* Usage Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ChartClusterBarIcon className="size-4 text-muted-foreground" />
                  <CardTitle>Usage</CardTitle>
                </div>
                <CardDescription>Your scan quota and activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Scans used</span>
                  <span className="font-medium">{scansUsed} / {scansMax}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Scans remaining</span>
                  <span className="font-medium">{scansRemaining}</span>
                </div>
                <div className="space-y-1.5">
                  <Progress value={usagePct} />
                  <p className="text-xs text-muted-foreground text-right">{usagePct}% used</p>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Scans today</span>
                  <span className="font-medium">{u?.scans_today ?? 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Last active</span>
                  <span className="font-medium">{formatLastSeen(u?.last_seen)}</span>
                </div>
              </CardContent>
            </Card>
          </div>


          <PreferencesCard />

          <ApiKeysCard />

          <div className="pt-2">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <LogoutIcon className="size-4" />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

type ProviderMeta = {
  id: ApiKeyProvider;
  name: string;
  description: string;
  link: string;
  placeholder: string;
  badge?: string;
};

const PROVIDERS: ProviderMeta[] = [
  { id: "groq", name: "Groq", description: "Free tier default · groq.com", link: "https://groq.com", placeholder: "gsk-..." },
  { id: "gemini", name: "Gemini", description: "Google AI · ai.google.dev", link: "https://ai.google.dev", placeholder: "AIza..." },
  { id: "openai", name: "OpenAI", description: "ChatGPT · platform.openai.com", link: "https://platform.openai.com", placeholder: "sk-..." },
  { id: "perplexity", name: "Perplexity", description: "perplexity.ai", link: "https://perplexity.ai", placeholder: "pplx-..." },
  { id: "anthropic", name: "Anthropic", description: "Claude models · console.anthropic.com", link: "https://console.anthropic.com", placeholder: "sk-ant-..." },
  { id: "mistral", name: "Mistral", description: "console.mistral.ai", link: "https://console.mistral.ai", placeholder: "..." },
  { id: "cohere", name: "Cohere", description: "dashboard.cohere.com", link: "https://dashboard.cohere.com", placeholder: "..." },
  { id: "xai", name: "xAI (Grok)", description: "Elon Musk's Grok · console.x.ai", link: "https://console.x.ai", placeholder: "xai-..." },
];

function ApiKeysCard() {
  const qc = useQueryClient();
  const { data: keys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: fetchApiKeys,
  });
  const status: ApiKeyStatus = keys ?? { groq: false, gemini: false, openai: false, perplexity: false, anthropic: false, mistral: false, cohere: false, xai: false };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CodeSigningServiceIcon className="size-4 text-muted-foreground" />
          <CardTitle>API Keys</CardTitle>
        </div>
        <CardDescription>Bring your own LLM provider keys</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PROVIDERS.map((p) => (
          <ApiKeyRow
            key={p.id}
            provider={p}
            connected={!!status[p.id]}
            engineStatus={getEngineStatus()[p.id]}
            onChanged={() => qc.invalidateQueries({ queryKey: ["api-keys"] })}
          />
        ))}
        <p className="pt-2 text-xs text-muted-foreground border-t border-border">
          Your API keys are stored securely and never exposed. Using your own keys means LLM costs are billed directly to your account.
        </p>
      </CardContent>
    </Card>
  );
}

function ApiKeyRow({
  provider,
  connected,
  engineStatus,
  onChanged,
}: {
  provider: ProviderMeta;
  connected: boolean;
  engineStatus?: EngineStatusEntry;
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) {
      toast.error("Enter a key first");
      return;
    }
    setSaving(true);
    const ok = await saveApiKey(provider.id, value.trim());
    setSaving(false);
    if (ok) {
      toast.success("Key saved.");
      setValue("");
      onChanged();
    } else {
      toast.error(`Failed to save ${provider.name} key`);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    const ok = await deleteApiKey(provider.id);
    setRemoving(false);
    if (ok) {
      toast.success(`${provider.name} key removed`);
      onChanged();
    } else {
      toast.error(`Failed to remove ${provider.name} key`);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{provider.name}</span>
            {provider.badge && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {provider.badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{provider.description}</p>
        </div>
        {connected ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Not set
          </span>
        )}
      </div>
      {connected && engineStatus && (
        engineStatus.ok ? (
          <div className="text-xs font-medium text-emerald-400">✅ Working , last scan succeeded</div>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            ⚠️ Issue detected , check your balance or API key
            {engineStatus.error && (
              <div className="mt-1 text-amber-800 dark:text-amber-200/80 break-words">{engineStatus.error}</div>
            )}
          </div>
        )
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="password"
          placeholder={provider.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 min-w-[180px]"
          autoComplete="off"
        />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {connected && (
          <Button size="sm" variant="outline" onClick={handleRemove} disabled={removing}>
            {removing ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PreferencesCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: fetchPreferences });
  const prefs: UserPreferences = data ?? { auto_scan: false, auto_analyze: false };

  const toggle = async (key: keyof UserPreferences, value: boolean) => {
    qc.setQueryData<UserPreferences>(["preferences"], { ...prefs, [key]: value });
    const ok = await updatePreferences({ [key]: value });
    if (!ok) {
      qc.setQueryData<UserPreferences>(["preferences"], prefs);
      toast.error("Failed to update preference");
    } else {
      toast.success("Preferences updated");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automation</CardTitle>
        <CardDescription>Opt in to automated agent activity for your brands.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">Auto-scan daily</div>
            <p className="text-xs text-muted-foreground mt-1">
              ⚠️ This uses your API key and may incur costs
            </p>
          </div>
          <Switch
            checked={prefs.auto_scan}
            onCheckedChange={(v) => toggle("auto_scan", v)}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">Auto-analyze daily</div>
            <p className="text-xs text-muted-foreground mt-1">
              ⚠️ This uses your API key and may incur costs
            </p>
          </div>
          <Switch
            checked={prefs.auto_analyze}
            onCheckedChange={(v) => toggle("auto_analyze", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
