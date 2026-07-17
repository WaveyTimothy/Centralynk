import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Copy, LogOut, Moon, Sun, Trash2 } from "lucide-react";
import type { FeedbackStats, AgentStat } from "@/lib/geo-api";
import { fetchFeedbackStats } from "@/lib/geo-api";
import { useTheme } from "@/hooks/use-theme";
import logoDark from "@/assets/centralynk-logo-dark.png.asset.json";
import logoLight from "@/assets/centralynk-logo-light.png.asset.json";

const API_BASE = "https://api.centralynk.com";
const TOKEN_KEY = "adminToken";

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function setAdminToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearAdminToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin, Centralynk" }] }),
  component: AdminPage,
});

type User = {
  email: string;
  access_code?: string | null;
  code?: string | null;
  scans_used?: number;
  max_scans?: number;
  scans_today?: number;
  active?: boolean;
  is_active?: boolean;
  last_seen?: string | null;
  created_at?: string | null;
};


type AccessCode = {
  code: string;
  email?: string | null;
  scans_used?: number;
  max_scans?: number;
  active?: boolean;
  created_at?: string | null;
  notes?: string | null;
};

type WaitlistEntry = {
  id?: string | number;
  email: string;
  name?: string | null;
  company?: string | null;
  reason?: string | null;
  created_at?: string | null;
  invited?: boolean;
};

type Stats = {
  total_users?: number;
  total_codes?: number;
  active_codes?: number;
  waitlist_size?: number;
  users?: User[];
  codes?: AccessCode[];
  waitlist?: WaitlistEntry[];
};


function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function AdminPage() {
  const [authed, setAuthed] = useState<boolean>(() => !!getAdminToken());

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {authed ? (
        <AdminDashboard onLogout={() => setAuthed(false)} />
      ) : (
        <AdminLogin onSuccess={() => setAuthed(true)} />
      )}
    </div>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Invalid password");
      const data = (await res.json()) as { token: string };
      if (!data.token) throw new Error("No token returned");
      setAdminToken(data.token);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-4">
          <div className="text-center">
            <h1 className="text-lg font-semibold">Admin, Centralynk</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter the admin password to continue.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminStats = async () => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) {
      onLogout()
      setIsLoading(false)
      return
    }
    try {
      console.log('Fetching admin stats with token:', adminToken?.substring(0, 20) + '...')
      const res = await fetch('https://api.centralynk.com/api/admin/stats/secure', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      })
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('adminToken')
        onLogout()
        setIsLoading(false)
        return
      }
      if (!res.ok) throw new Error('Failed to fetch admin stats')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Admin stats error:', err)
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAdminStats()
  }, [])

  const users = stats.users ?? [];
  const codes = stats.codes ?? [];
  const waitlistRaw = stats.waitlist ?? [];
  const waitlist = [...waitlistRaw]
    .filter((w) => !(w.email ?? "").toLowerCase().includes("placeholder"))
    .sort((a, b) => {
      const ai = a.invited ? 1 : 0;
      const bi = b.invited ? 1 : 0;
      if (ai !== bi) return ai - bi;
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });

  const markInvited = (email: string) => {
    setStats((s) => ({
      ...s,
      waitlist: (s.waitlist ?? []).map((w) =>
        w.email === email ? { ...w, invited: true } : w,
      ),
    }));
  };

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  const { theme, toggle } = useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <img src={logoDark.url} alt="Centralynk" data-no-invert className="h-7 w-auto dark:hidden" />
          <img src={logoLight.url} alt="Centralynk" data-no-invert className="h-7 w-auto hidden dark:block" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Centralynk</div>
            <div className="text-[11px] text-muted-foreground">Admin</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAdminStats} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="inline-flex items-center justify-center rounded-md border border-border size-8 hover:bg-muted transition-colors"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </header>
      <main className="flex-1 px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total users" value={stats.total_users ?? users.length} />
        <StatCard label="Total access codes" value={stats.total_codes ?? codes.length} />
        <StatCard
          label="Active codes"
          value={stats.active_codes ?? codes.filter((c) => c.active).length}
        />
        <StatCard label="Waitlist size" value={stats.waitlist_size ?? waitlist.length} />
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="codes">Access Codes</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
          <TabsTrigger value="agents">Agent Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Total Scans</TableHead>
                    <TableHead>Scans Today</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <EmptyRow cols={6} text="Loading..." />
                  ) : users.length === 0 ? (
                    <EmptyRow cols={6} text="No users." />
                  ) : (
                    users.map((u, i) => {
                      const isActive = u.is_active ?? u.active ?? false;
                      return (
                        <TableRow key={`${u.email}-${i}`}>
                          <TableCell className="font-medium">{u.email}</TableCell>
                          <TableCell>{u.scans_used ?? 0}</TableCell>
                          <TableCell>{u.scans_today ?? 0}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={`inline-block size-2.5 rounded-full ${
                                  isActive ? "bg-emerald-500" : "bg-red-500"
                                }`}
                                aria-label={isActive ? "Active" : "Inactive"}
                              />
                              <span className="text-xs text-muted-foreground">
                                {isActive ? "Active" : "Inactive"}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtDate(u.last_seen)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtDate(u.created_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codes">
          <div className="flex justify-end mb-3">
            <GenerateCodeDialog onGenerated={fetchAdminStats} />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Used / Max</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <EmptyRow cols={5} text="Loading..." />
                  ) : codes.length === 0 ? (
                    <EmptyRow cols={5} text="No access codes." />
                  ) : (
                    codes.map((c, i) => (
                      <TableRow key={`${c.code}-${i}`}>
                        <TableCell>{c.email ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-xs">{c.code}</code>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => navigator.clipboard.writeText(c.code)}
                              title="Copy code"
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(c.scans_used ?? 0)} / {c.max_scans ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.active ? "default" : "secondary"}>
                            {c.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(c.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waitlist">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <EmptyRow cols={6} text="Loading..." />
                  ) : waitlist.length === 0 ? (
                    <EmptyRow cols={6} text="No waitlist entries." />
                  ) : (
                    waitlist.map((w, i) => (
                      <TableRow key={`${w.email}-${i}`}>
                        <TableCell>{w.name ?? "—"}</TableCell>
                        <TableCell className="font-medium">{w.email}</TableCell>
                        <TableCell>{w.company ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[320px] truncate">
                          {w.reason ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(w.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <WaitlistActions
                            email={w.email}
                            invited={!!w.invited}
                            onInvited={() => markInvited(w.email)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="agents">
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <div className="text-sm font-medium">Agent performance data coming soon.</div>
              <div className="text-sm text-muted-foreground">
                Zulma is learning from every interaction.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </main>
    </div>
  );
}

function WaitlistActions({
  email,
  invited,
  onInvited,
}: {
  email: string;
  invited: boolean;
  onInvited: () => void;
}) {
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  if (rejected) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-border">
        Rejected
      </Badge>
    );
  }

  const sendInvite = async () => {
    setLoadingInvite(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/waitlist/${encodeURIComponent(email)}/invite`,
        { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } },
      );
      if (res.ok) onInvited();
    } finally {
      setLoadingInvite(false);
    }
  };

  const generateCode = async () => {
    setCodeOpen(true);
    if (generatedCode) return;
    setGenLoading(true);
    setGenError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/generate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ email, max_scans: 100 }),
      });
      if (!res.ok) throw new Error("Failed to generate code");
      const data = (await res.json()) as { code: string };
      setGeneratedCode(data.code);
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {invited ? (
        <Badge variant="outline" className="text-emerald-500 border-emerald-500/40">
          Invited ✓
        </Badge>
      ) : (
        <Button
          size="sm"
          onClick={sendInvite}
          disabled={loadingInvite}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loadingInvite ? "..." : "Invite sent"}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={generateCode}>
        Generate code
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setRejected(true)}
      >
        Reject
      </Button>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Access code for {email}</DialogTitle>
            <DialogDescription>
              Share this code with the user to grant access.
            </DialogDescription>
          </DialogHeader>
          {genLoading && (
            <div className="text-sm text-muted-foreground">Generating…</div>
          )}
          {genError && <div className="text-sm text-destructive">{genError}</div>}
          {generatedCode && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
              <code className="flex-1 font-mono text-sm break-all">{generatedCode}</code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(generatedCode)}
                title="Copy"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center text-sm text-muted-foreground py-8">
        {text}
      </TableCell>
    </TableRow>
  );
}

function GenerateCodeDialog({ onGenerated }: { onGenerated?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [maxScans, setMaxScans] = useState(100);
  const [notes, setNotes] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/generate-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          email: email || undefined,
          max_scans: maxScans,
          note: notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate code");
      return res.json() as Promise<{ code: string }>;
    },
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      onGenerated?.();
    },
  });

  const reset = () => {
    setEmail("");
    setMaxScans(100);
    setNotes("");
    setGeneratedCode(null);
    mutation.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Generate Code</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {generatedCode ? (
          <>
            <DialogHeader>
              <DialogTitle>Code generated</DialogTitle>
              <DialogDescription>
                Copy the code and the email template below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Access code</div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
                  <Input
                    readOnly
                    value={generatedCode}
                    className="flex-1 font-mono text-sm bg-transparent border-0 focus-visible:ring-0"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => navigator.clipboard.writeText(generatedCode)}
                    title="Copy"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-muted-foreground">Email template</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `Subject: Your Centralynk early access is ready\n\nHi,\n\nYour early access to Centralynk is ready.\n\nLogin at: https://app.centralynk.com\nEmail: ${email}\nAccess code: ${generatedCode}\n\nTim`,
                      )
                    }
                  >
                    <Copy className="size-4" />
                    Copy
                  </Button>
                </div>
                <Textarea
                  readOnly
                  value={`Subject: Your Centralynk early access is ready\n\nHi,\n\nYour early access to Centralynk is ready.\n\nLogin at: https://app.centralynk.com\nEmail: ${email}\nAccess code: ${generatedCode}\n\nTim`}
                  className="font-mono text-xs h-56"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate access code</DialogTitle>
              <DialogDescription>
                Create a new access code for a user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max scans</label>
                <Input
                  type="number"
                  min={1}
                  value={maxScans}
                  onChange={(e) => setMaxScans(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Note (optional)</label>
                <Textarea
                  placeholder="Internal note..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {mutation.error && (
                <div className="text-sm text-destructive">
                  {(mutation.error as Error).message}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !email}
              >
                {mutation.isPending ? "Generating..." : "Generate"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ entry }: { entry: WaitlistEntry }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const start = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/generate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          email: entry.email,
          max_scans: 100,
          note: "Beta tester",
        }),
      });
      if (!res.ok) throw new Error("Failed to generate code");
      const data = (await res.json()) as { code: string };
      setCode(data.code);

      if (entry.id !== undefined && entry.id !== null) {
        try {
          await fetch(`${API_BASE}/api/admin/waitlist/${entry.id}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
          });
        } catch {
          // non-fatal
        }
      }
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const name = entry.name ?? entry.email.split("@")[0];
  const emailTemplate = `Subject: Your Centralynk early access is ready

Hi ${name},

Your early access to Centralynk is ready.

Login at: https://app.centralynk.com
Email: ${entry.email}
Access code: ${code ?? "[GENERATED_CODE]"}

Centralynk tracks your brand visibility in ChatGPT, Perplexity and Claude.
Run your first scan and see your GEO score in 2 minutes.

Tim`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !code && !loading) start();
        if (!o) {
          setCode(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Invite</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite {name}</DialogTitle>
          <DialogDescription>
            Generated access code and ready-to-send email.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="text-sm text-muted-foreground">Generating code...</div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}

        {code && (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Access code</div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
                <code className="flex-1 font-mono text-sm break-all">{code}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(code)}
                  title="Copy code"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted-foreground">Email template</div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(emailTemplate)}
                >
                  <Copy className="size-4" />
                  Copy
                </Button>
              </div>
              <Textarea
                readOnly
                value={emailTemplate}
                className="font-mono text-xs h-72"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function agentScoreBadgeClass(score: number) {
  if (score >= 4) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (score >= 3) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function agentScoreColor(name: string) {
  const colors: Record<string, string> = {
    analyst_agent: "#34d399",
    marketing_agent: "#f59e0b",
  };
  return colors[name] ?? "#60a5fa";
}

function formatAgentName(name: string) {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function AgentPerformanceTab() {
  const { data, isLoading, error } = useQuery<FeedbackStats>({
    queryKey: ["feedback-stats"],
    queryFn: fetchFeedbackStats,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">Loading agent performance...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.total_feedback === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">
            {error ? `Error: ${(error as Error).message}` : "No feedback data yet."}
          </div>
        </CardContent>
      </Card>
    );
  }

  const agents = data.by_agent ?? [];

  // Build chart data: two points per agent (Baseline and Now)
  const chartData = [
    { date: "Baseline", ...Object.fromEntries(agents.map((a) => [a.agent_name, 3.0])) },
    {
      date: "Now",
      ...Object.fromEntries(agents.map((a) => [a.agent_name, Number(a.avg_score.toFixed(1))])),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Self-Learning Loop Performance</h2>
          <p className="text-sm text-muted-foreground">
            Agent feedback scores and output quality trends.
          </p>
        </div>
        <Badge
          variant="outline"
          className={`text-sm px-3 py-1 ${agentScoreBadgeClass(data.avg_score)}`}
        >
          Overall: {data.avg_score.toFixed(1)} / 5
        </Badge>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.agent_name} agent={agent} />
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-medium mb-4">Agent Learning Progress</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis
                  domain={[1, 5]}
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#e2e8f0",
                  }}
                />
                <Legend
                  wrapperStyle={{ color: "#94a3b8" }}
                  formatter={(value: string) => formatAgentName(value)}
                />
                {agents.map((agent) => (
                  <Line
                    key={agent.agent_name}
                    type="monotone"
                    dataKey={agent.agent_name}
                    stroke={agentScoreColor(agent.agent_name)}
                    strokeWidth={2}
                    dot={{ r: 4, fill: agentScoreColor(agent.agent_name) }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentStat }) {
  return (
    <Card className="border border-border/50">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{formatAgentName(agent.agent_name)}</h3>
          <Badge variant="outline" className={`text-xs ${agentScoreBadgeClass(agent.avg_score)}`}>
            {agent.avg_score.toFixed(1)} / 5
          </Badge>
        </div>
        <div className="text-2xl font-semibold tabular-nums">{agent.count}</div>
        <div className="text-xs text-muted-foreground">Total outputs</div>
        <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
          Self-improving via feedback loop
        </div>
      </CardContent>
    </Card>
  );
}

function DeactivateUserButton({ email, active }: { email: string; active: boolean }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${API_BASE}/api/admin/users/${encodeURIComponent(email)}/deactivate`,
        { method: "POST", headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed to update user");
      return res.json().catch(() => ({}));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-stats"] }),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? "..." : active ? "Deactivate" : "Activate"}
    </Button>
  );
}

function DeleteWaitlistButton({ id, email }: { id: string | number; email: string }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/waitlist/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete entry");
      return res.json().catch(() => ({}));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-stats"] }),
  });

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        if (window.confirm(`Delete waitlist entry for ${email}?`)) mutation.mutate();
      }}
      disabled={mutation.isPending}
      title="Delete"
    >
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}
