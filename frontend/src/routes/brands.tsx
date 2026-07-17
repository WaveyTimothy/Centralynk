import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchBrands, fetchDashboard, deleteBrand, session } from "@/lib/geo-api";
import { Trash2 } from "lucide-react";
import { useRequireAccess } from "@/hooks/use-require-access";
import { AddBrandModal } from "@/components/add-brand-modal";
import { AgentInvocationIcon } from "@/components/custom-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/brands")({
  head: () => ({ meta: [{ title: "Tracked Brands, Centralynk" }] }),
  component: BrandsPage,
});

function BrandsPage() {
  useRequireAccess();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const dashboards = useQueries({
    queries: brands.map((b) => ({
      queryKey: ["dashboard", b.id],
      queryFn: () => fetchDashboard(b.id),
      enabled: !!b.id,
    })),
  });

  const open = (id: string) => {
    session.setActiveBrand(id);
    navigate({ to: "/dashboard" });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const ok = await deleteBrand(pendingDelete.id);
    setDeleting(false);
    if (ok) {
      toast.success(`Removed ${pendingDelete.name}`);
      qc.invalidateQueries({ queryKey: ["brands"] });
      setPendingDelete(null);
    } else {
      toast.error("Failed to delete brand");
    }
  };

  return (
    <div className="w-full min-h-screen space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tracked Brands</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brands you are actively monitoring across generative engines.
          </p>
        </div>
        <AddBrandModal />
      </div>

      {brands.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <AgentInvocationIcon className="size-8 mx-auto text-muted-foreground" />
          <div className="mt-3 text-base font-semibold">No brands yet</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first brand to start tracking.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((b, i) => {
            const vis = dashboards[i]?.data?.visibilityShare ?? b.visibility_score;
            return (
              <div
                key={b.id}
                className="relative group rounded-lg border border-border bg-card p-5 hover:border-foreground/20 hover:bg-muted/30 transition"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete({ id: b.id, name: b.name });
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition opacity-0 group-hover:opacity-100"
                  aria-label={`Delete ${b.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => open(b.id)}
                  className="text-left w-full"
                >
                  <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <AgentInvocationIcon className="size-4" />
                  </div>
                  <div className="mt-4 text-base font-semibold">{b.name}</div>
                  {b.domain && (
                    <div className="text-xs text-muted-foreground mt-0.5">{b.domain}</div>
                  )}
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">
                      {vis == null ? "—" : vis.toFixed(0)}
                      {vis != null && <span className="text-sm text-muted-foreground">%</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">visibility</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this brand?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  This will permanently remove <span className="font-semibold text-foreground">{pendingDelete.name}</span> and all of its scan history. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
