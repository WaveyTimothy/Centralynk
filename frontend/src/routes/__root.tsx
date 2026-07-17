import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Centralynk | Generative Engine Optimization Platform" },
      { name: "description", content: "Centralynk, Generative Engine Optimization platform." },
      { name: "author", content: "Centralynk" },
      { property: "og:title", content: "Centralynk | Generative Engine Optimization Platform" },
      { property: "og:description", content: "Centralynk, Generative Engine Optimization platform." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://centralynk.com/centralynk-logo-dark.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Centralynk | Generative Engine Optimization Platform" },
      { name: "twitter:description", content: "Centralynk, Generative Engine Optimization platform." },
      { name: "twitter:image", content: "https://centralynk.com/centralynk-logo-dark.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/__l5e/assets-v1/c1f9f3c8-e0b4-4c70-a228-5328d63723e5/centralynk-logo-light.png",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { AppSidebar } from "../components/app-sidebar";
import { AppHeader } from "../components/app-header";
import { useRouterState, useNavigate } from "@tanstack/react-router";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isAppShell =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/brands") ||
    pathname.startsWith("/scans") ||
    pathname.startsWith("/geo") ||
    pathname.startsWith("/settings");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === "/") {
      const token = localStorage.getItem("authToken");
      navigate({ to: token ? "/dashboard" : "/access" });
    }
  }, [pathname, navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAppShell ? (
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 md:ml-16 peer-hover:md:ml-64 transition-[margin] duration-200 ease-out">
            <AppHeader />
            <main className="flex-1 px-6 py-6 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </QueryClientProvider>
  );
}
