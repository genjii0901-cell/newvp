"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function VisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api")) return;

    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    const dedupeKey = `vpp-visit:${todayKey()}:${path}`;

    try {
      if (sessionStorage.getItem(dedupeKey) === "1") return;
      sessionStorage.setItem(dedupeKey, "1");
    } catch {
      // Ignore sessionStorage restrictions and continue best-effort.
    }

    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        referrer:
          typeof document !== "undefined" ? document.referrer.slice(0, 300) : "",
      }),
      keepalive: true,
    }).catch(() => {
      // Analytics should never block the UI.
    });
  }, [pathname, searchParams]);

  return null;
}
