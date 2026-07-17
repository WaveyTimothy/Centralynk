import { useState, useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Pencil, Moon, Sun, Check, X } from "lucide-react";
import { session } from "@/lib/geo-api";
import { useTheme } from "@/hooks/use-theme";

const NAME_KEY = "displayName";

function readDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NAME_KEY);
}

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    setEmail(session.getEmail());
    setDisplayName(readDisplayName());
  }, [pathname]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const shown = displayName || email;

  const startEdit = () => {
    setDraft(displayName ?? "");
    setEditing(true);
  };

  const save = () => {
    const v = draft.trim();
    if (v) {
      window.localStorage.setItem(NAME_KEY, v);
      setDisplayName(v);
    } else {
      window.localStorage.removeItem(NAME_KEY);
      setDisplayName(null);
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex size-1.5 rounded-full bg-success animate-pulse" />
          <span>Live</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="inline-flex items-center justify-center rounded-md border border-border size-8 hover:bg-muted transition-colors"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        {shown && (
          <div className="flex items-center gap-2 text-sm">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                    if (e.key === "Escape") cancel();
                  }}
                  placeholder={email ?? "Your name"}
                  className="h-8 w-44 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={save}
                  aria-label="Save name"
                  className="inline-flex items-center justify-center rounded-md border border-border size-8 hover:bg-muted transition-colors"
                >
                  <Check className="size-4" />
                </button>
                <button
                  onClick={cancel}
                  aria-label="Cancel"
                  className="inline-flex items-center justify-center rounded-md border border-border size-8 hover:bg-muted transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <span className="font-medium text-foreground">{shown}</span>
                <button
                  onClick={startEdit}
                  aria-label="Edit display name"
                  title="Edit display name"
                  className="inline-flex items-center justify-center rounded-md border border-border size-7 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
