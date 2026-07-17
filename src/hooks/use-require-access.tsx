import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { session } from "@/lib/geo-api";

export function useRequireAccess() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!session.getToken()) {
      navigate({ to: "/access" });
    }
  }, [navigate]);
}
