import { NextResponse } from "next/server";
import {
  ensureProfile,
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  requireSupabaseUser,
  supabaseServerConfigResponse,
} from "@/lib/supabase/admin";
import { getPageCount, planLimits, type Plan } from "@/lib/plan-limits";
import { getLicenseEntitlements, hasPersonalLicense, hasWordbookLicense, isLicenseSchemaError } from "@/lib/licenses";

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function periodStart(period: "day" | "month") {
  const date = new Date();
  if (period === "day") {
    date.setHours(0, 0, 0, 0);
  }
  if (period === "month") {
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  if (!isSupabaseServerConfigured()) {
    return supabaseServerConfigResponse();
  }

  try {
    const body = await request.json().catch(() => ({}));
    const wordCount = Number(body.wordCount ?? 0);
    const pageCount = Number(body.pageCount ?? getPageCount(wordCount));
    const wordbookId = body.wordbookId == null ? null : String(body.wordbookId);
    const profile = await ensureProfile(auth.user);
    let licenseKind: "personal" | "wordbook" | null = null;
    try {
      const entitlements = await getLicenseEntitlements(auth.user.id);
      if (hasPersonalLicense(entitlements)) licenseKind = "personal";
      else if (wordbookId && hasWordbookLicense(entitlements, wordbookId)) licenseKind = "wordbook";
    } catch (error) {
      // Existing installs remain usable until the optional Note license tables are created.
      if (!isLicenseSchemaError(error)) throw error;
    }
    const plan = licenseKind ? "personal" : normalizePlan(profile?.plan);
    if (licenseKind) {
      return NextResponse.json({
        ok: true,
        plan,
        licenseKind,
        remaining: null,
        maxPages: null,
        maxWords: null,
        maxGenerations: null,
        period: "license",
      });
    }
    const rule = planLimits[plan];

    if (typeof rule.maxPages === "number" && pageCount > rule.maxPages) {
      return NextResponse.json({
        ok: false,
        plan,
        maxPages: rule.maxPages,
        message: `${plan}プランでは1回に${rule.maxPages}ページまで作成できます。`,
      });
    }

    if (typeof rule.maxWords === "number" && wordCount > rule.maxWords) {
      return NextResponse.json({
        ok: false,
        plan,
        maxWords: rule.maxWords,
        message: `${plan}プランでは1回に${rule.maxWords}語まで作成できます。`,
      });
    }

    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("pdf_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .gte("created_at", periodStart(rule.period));

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const used = count ?? 0;
    const remaining = Math.max(rule.maxGenerations - used, 0);

    if (typeof rule.maxTotalGenerations === "number") {
      const { count: totalCount, error: totalError } = await supabase
        .from("pdf_generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id);

      if (totalError) {
        return NextResponse.json({ ok: false, message: totalError.message }, { status: 500 });
      }

      const totalUsed = totalCount ?? 0;
      if (totalUsed >= rule.maxTotalGenerations) {
        return NextResponse.json({
          ok: false,
          plan,
          remaining: 0,
          maxGenerations: rule.maxGenerations,
          maxTotalGenerations: rule.maxTotalGenerations,
          message: `${plan}プランの作成回数上限（累計${rule.maxTotalGenerations}回）に達しました。`,
        });
      }
    }

    if (remaining <= 0) {
      return NextResponse.json({
        ok: false,
        plan,
        remaining: 0,
        maxGenerations: rule.maxGenerations,
        message: `${plan}プランのPDF作成回数の上限に達しました。`,
      });
    }

    return NextResponse.json({
      ok: true,
      plan,
      licenseKind,
      remaining,
      maxPages: rule.maxPages ?? null,
      maxWords: rule.maxWords,
      maxGenerations: rule.maxGenerations,
      period: rule.period,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
