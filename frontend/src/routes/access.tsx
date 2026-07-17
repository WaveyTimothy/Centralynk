import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { validateAccess, session } from "@/lib/geo-api";
import logoDark from "@/assets/centralynk-logo-dark.png.asset.json";

export const Route = createFileRoute("/access")({
  head: () => ({ meta: [{ title: "Access, Centralynk" }] }),
  component: AccessPage,
});

function AccessPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await validateAccess(email, code);
      if (!result.ok || !result.token) {
        setError("Invalid email or access code");
        return;
      }
      // Wipe any prior user's cached data before signing in.
      await qc.cancelQueries();
      qc.clear();
      session.clear();
      session.setToken(result.token);
      session.setEmail(email);
      await qc.invalidateQueries();
      navigate({ to: "/dashboard" });
    } catch {
      setError("Invalid email or access code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <a href="https://centralynk.com" className="inline-block mb-4">
            <img
              src={logoDark.url}
              alt="Centralynk"
              className="h-10 w-auto mx-auto"
            />
          </a>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to Centralynk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and access code to continue.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="email"
          />
          <input
            type="text"
            required
            placeholder="Access code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="one-time-code"
          />
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button
            type="submit"
            disabled={loading || !email || !code}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
