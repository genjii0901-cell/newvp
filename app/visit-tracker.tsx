"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { japanDateKey } from "@/lib/analytics-date";

export default function VisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api")) return;

    const attribution = {
      source: searchParams?.get("utm_source")?.slice(0, 80) ?? "",
      medium: searchParams?.get("utm_medium")?.slice(0, 80) ?? "",
      campaign: searchParams?.get("utm_campaign")?.slice(0, 120) ?? "",
      content: searchParams?.get("utm_content")?.slice(0, 120) ?? "",
    };
    // Query parameters can contain temporary or sensitive values. Keep page
    // analytics to the pathname and record only explicit UTM attribution.
    const dedupeKey = `vpp-visit:${japanDateKey()}:${pathname}:${JSON.stringify(attribution)}`;

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
        path: pathname,
        attribution,
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
