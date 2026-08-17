import crypto from "crypto";
import { NextResponse } from "next/server";
import { japanDateKey } from "@/lib/analytics-date";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

function normalizePath(value: unknown) {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "/";
  return trimmed.slice(0, 200) || "/";
}

function hashVisitor(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function normalizeReferrer(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 300);
}

function normalizeAttribution(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const clean = (key: string, maxLength: number) =>
    typeof input[key] === "string" ? input[key].trim().slice(0, maxLength) : "";
  return {
    source: clean("source", 80),
    medium: clean("medium", 80),
    campaign: clean("campaign", 120),
    content: clean("content", 120),
  };
}

async function getSettingValue(key: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return typeof data?.value === "string" ? data.value : null;
}

async function setSettingValue(key: string, value: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

async function incrementSetting(key: string, delta = 1) {
  const current = Number((await getSettingValue(key)) ?? "0");
  const next = Number.isFinite(current) ? current + delta : delta;
  await setSettingValue(key, String(next));
  return next;
}

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, skipped: true, message: "Supabase is not configured." });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const path = normalizePath(body.path);
    const referrer = typeof body.referrer === "string" ? normalizeReferrer(body.referrer) : "";
    const attribution = normalizeAttribution(body.attribution);
    const ua = request.headers.get("user-agent") ?? "";
    const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
    const date = japanDateKey();
    const visitorHash = hashVisitor(`${ip}|${ua}|${date}`);
    const stableVisitorHash = hashVisitor(`${ip}|${ua}`);
    const encodedPath = encodeURIComponent(path);
    const encodedReferrer = encodeURIComponent(referrer || "direct");
    const uaLabel = ua.slice(0, 160);

    const viewsToday = await incrementSetting(`visit_total::${date}`);
    await incrementSetting(`visit_path::${date}::${encodedPath}`);
    await incrementSetting(`visit_referrer::${date}::${encodedReferrer}`);
    if (attribution.source || attribution.campaign) {
      const encodedAttribution = encodeURIComponent(JSON.stringify(attribution));
      await incrementSetting(`visit_campaign::${date}::${encodedAttribution}`);
    }

    const uniqueKey = `visit_unique::${date}::${visitorHash}`;
    const existingUnique = await getSettingValue(uniqueKey);
    if (!existingUnique) {
      await setSettingValue(
        uniqueKey,
        JSON.stringify({
          path,
          referrer,
          attribution,
          visitorHash,
          stableVisitorHash,
          ua: uaLabel,
          createdAt: new Date().toISOString(),
        })
      );
      await incrementSetting(`visit_unique_total::${date}`);
    }

    // This has no personal information. It makes production analytics failures
    // observable in Vercel without exposing counters through a public API.
    console.info("Analytics visit recorded", {
      date,
      path,
      viewsToday,
      isNewVisitor: !existingUnique,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to record visit.",
      },
      { status: 500 }
    );
  }
}
