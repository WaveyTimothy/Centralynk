import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken");
      throw redirect({ to: token ? "/dashboard" : "/access" });
    }
    throw redirect({ to: "/access" });
  },
  component: () => null,
});
