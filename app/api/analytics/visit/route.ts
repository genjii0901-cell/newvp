import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

function normalizePath(value: unknown) {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "/";
  return trimmed.slice(0, 200) || "/";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashVisitor(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
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
  await setSettingValue(key, String(Number.isFinite(current) ? current + delta : delta));
}

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, skipped: true, message: "Supabase is not configured." });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const path = normalizePath(body.path);
    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 300) : "";
    const ua = request.headers.get("user-agent") ?? "";
    const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
    const date = todayKey();
    const visitorHash = hashVisitor(`${ip}|${ua}|${date}`);
    const encodedPath = encodeURIComponent(path);

    await incrementSetting(`visit_total::${date}`);
    await incrementSetting(`visit_path::${date}::${encodedPath}`);

    const uniqueKey = `visit_unique::${date}::${visitorHash}`;
    const existingUnique = await getSettingValue(uniqueKey);
    if (!existingUnique) {
      await setSettingValue(
        uniqueKey,
        JSON.stringify({
          path,
          referrer,
          createdAt: new Date().toISOString(),
        })
      );
      await incrementSetting(`visit_unique_total::${date}`);
    }

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
