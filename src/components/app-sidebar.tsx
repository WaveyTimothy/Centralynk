import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ObservabilityIcon, ScanAltIcon, WorkspaceIcon, VisualInspectionIcon, SettingsIcon, LogoutIcon } from "@/components/custom-icons";
import logoDark from "@/assets/centralynk-logo-dark.png.asset.json";
import logoLight from "@/assets/centralynk-logo-light.png.asset.json";
import { session } from "@/lib/geo-api";

const nav = [
  { to: "/dashboard", label: "Overview Dashboard", icon: WorkspaceIcon },
  { to: "/brands", label: "Tracked Brands", icon: ObservabilityIcon },
  { to: "/scans", label: "Scan History", icon: ScanAltIcon },
  { to: "/geo", label: "GEO Optimization", icon: VisualInspectionIcon },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleLogout = async () => {
    await qc.cancelQueries();
    qc.clear();
    session.clear();
    if (typeof window !== "undefined") {
      window.location.href = "https://centralynk.com";
      return;
    }
    navigate({ to: "/" });
  };

  return (
    <aside
      className="group/sidebar peer hidden md:flex fixed left-0 top-0 z-30 h-screen w-16 hover:w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out overflow-hidden"
    >
      <div className="shrink-0 h-[68px] flex items-center px-5 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
          <img src={logoDark.url} alt="Centralynk" data-no-invert className="h-8 w-auto shrink-0 object-contain dark:hidden" />
          <img src={logoLight.url} alt="Centralynk" data-no-invert className="h-8 w-auto shrink-0 object-contain hidden dark:block" />
          <div className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 whitespace-nowrap">
            <div className="text-sm font-semibold tracking-tight">Centralynk</div>
            <div className="text-[11px] text-muted-foreground">Generative Engine Optimization</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-1">
        {nav.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={[
                "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              ].join(" ")}
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 px-3 py-2 pb-4 space-y-1 border-t border-sidebar-border">
        <Link
          to="/settings"
          title="Settings"
          className={[
            "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          ].join(" ")}
        >
          <SettingsIcon className="size-5 shrink-0" />
          <span className="truncate opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">Settings</span>
        </Link>

        <button
          onClick={handleLogout}
          title="Log out"
          className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogoutIcon className="size-5 shrink-0" />
          <span className="truncate opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">Log out</span>
        </button>
      </div>
    </aside>
  );
}
