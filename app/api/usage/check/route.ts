import { NextResponse } from "next/server";
import {
  ensureProfile,
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  requireSupabaseUser,
  supabaseServerConfigResponse,
} from "@/lib/supabase/admin";

type Plan = "free" | "personal" | "teacher";

const limits: Record<Plan, { period: "day" | "month"; maxGenerations: number; maxWords: number }> = {
  free: { period: "day", maxGenerations: 3, maxWords: 50 },
  personal: { period: "month", maxGenerations: 300, maxWords: 300 },
  teacher: { period: "month", maxGenerations: 5000, maxWords: 1900 },
};

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function periodStart(period: "day" | "month") {
  const date = new Date();
  if (period === "day") date.setDate(date.getDate() - 1);
  if (period === "month") date.setMonth(date.getMonth() - 1);
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
    const profile = await ensureProfile(auth.user);
    const plan = normalizePlan(profile?.plan);
    const rule = limits[plan];

    if (wordCount > rule.maxWords) {
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
      remaining,
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
