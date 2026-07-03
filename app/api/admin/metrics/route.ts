import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  readableError,
} from "@/lib/supabase/admin";

const PERSONAL_PRICE_JPY = 780;
const TEACHER_PRICE_JPY = 2980;

type ProfileRow = {
  id: string;
  plan: string | null;
  role: string | null;
  created_at?: string | null;
};

type SubscriptionRow = {
  plan: string | null;
  status: string | null;
  created_at?: string | null;
  current_period_end?: string | null;
};

type PdfGenerationRow = {
  id: string;
  type: string | null;
  word_count: number | null;
  user_id: string | null;
  wordbook_id: string | null;
  created_at?: string | null;
};

type WordbookRow = {
  id: string | number;
  title: string | null;
  visibility: string | null;
  is_official?: boolean | null;
};

function isRecent(value: string | null | undefined, days: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return time >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function topEntries<T extends string | number>(items: T[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = String(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function looksMissingTableOrColumn(message: string) {
  return /does not exist|schema cache|relation .* does not exist|Could not find/i.test(message);
}

async function safeSelect<T>(
  run: () => Promise<{ data: T[] | null; error: { message?: string } | null }>
) {
  const result = await run();
  if (!result.error) {
    return { data: (result.data ?? []) as T[], warning: null };
  }
  const message = result.error.message ?? "Unknown error";
  if (looksMissingTableOrColumn(message)) {
    return { data: [] as T[], warning: message };
  }
  throw result.error;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        supabaseConfigured: false,
        message:
          "Supabase server environment variables are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const [profilesResult, subscriptionsResult, pdfResult, wordbooksResult] = await Promise.all([
      safeSelect<ProfileRow>(() =>
        supabase.from("profiles").select("id,plan,role,created_at").limit(5000)
      ),
      safeSelect<SubscriptionRow>(() =>
        supabase.from("subscriptions").select("plan,status,created_at,current_period_end").limit(5000)
      ),
      safeSelect<PdfGenerationRow>(() =>
        supabase
          .from("pdf_generations")
          .select("id,type,word_count,user_id,wordbook_id,created_at")
          .order("created_at", { ascending: false })
          .limit(5000)
      ),
      safeSelect<WordbookRow>(() =>
        supabase.from("wordbooks").select("id,title,visibility,is_official").limit(5000)
      ),
    ]);

    const profiles = profilesResult.data;
    const subscriptions = subscriptionsResult.data;
    const pdfGenerations = pdfResult.data;
    const wordbooks = wordbooksResult.data;
    const warnings = [
      profilesResult.warning,
      subscriptionsResult.warning,
      pdfResult.warning,
      wordbooksResult.warning,
    ].filter((value): value is string => Boolean(value));

    const freeCount = profiles.filter((profile) => (profile.plan ?? "free") === "free").length;
    const personalCount = profiles.filter((profile) => profile.plan === "personal").length;
    const teacherCount = profiles.filter((profile) => profile.plan === "teacher").length;
    const adminCount = profiles.filter((profile) => profile.role === "admin").length;
    const signup7d = profiles.filter((profile) => isRecent(profile.created_at, 7)).length;
    const signup30d = profiles.filter((profile) => isRecent(profile.created_at, 30)).length;

    const activeSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === "active" || subscription.status === "trialing"
    ).length;
    const trialingSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === "trialing"
    ).length;
    const canceledSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === "canceled"
    ).length;

    const pdf7d = pdfGenerations.filter((item) => isRecent(item.created_at, 7));
    const pdf30d = pdfGenerations.filter((item) => isRecent(item.created_at, 30));
    const totalWordsGenerated = pdfGenerations.reduce(
      (sum, item) => sum + (item.word_count ?? 0),
      0
    );
    const totalWordsGenerated30d = pdf30d.reduce(
      (sum, item) => sum + (item.word_count ?? 0),
      0
    );

    const wordbookTitleById = new Map(
      wordbooks.map((book) => [String(book.id), book.title ?? `ID ${book.id}`])
    );
    const topWordbooks = topEntries(
      pdf30d
        .map((item) => item.wordbook_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    ).map(([wordbookId, uses]) => ({
      wordbookId,
      title: wordbookTitleById.get(wordbookId) ?? `ID ${wordbookId}`,
      uses,
    }));

    const topTypes = topEntries(
      pdf30d
        .map((item) => item.type ?? "unknown")
        .filter((value): value is string => value.length > 0)
    ).map(([type, count]) => ({ type, count }));

    const officialBooks = wordbooks.filter((book) => book.is_official !== false);
    const adminOnlyBooks = officialBooks.filter((book) => book.visibility === "admin").length;
    const teacherBooks = officialBooks.filter((book) => book.visibility === "teacher").length;
    const personalBooks = officialBooks.filter((book) => book.visibility === "personal").length;
    const publicBooks = officialBooks.filter(
      (book) => !book.visibility || book.visibility === "public"
    ).length;

    const recentPdfGenerations = pdfGenerations.slice(0, 10).map((item) => ({
      id: item.id,
      created_at: item.created_at ?? null,
      type: item.type ?? "unknown",
      word_count: item.word_count ?? 0,
      wordbook_id: item.wordbook_id,
      wordbook_title: item.wordbook_id
        ? wordbookTitleById.get(item.wordbook_id) ?? `ID ${item.wordbook_id}`
        : "未設定",
      user_id: item.user_id,
    }));

    const estimatedMonthlyRevenue =
      personalCount * PERSONAL_PRICE_JPY + teacherCount * TEACHER_PRICE_JPY;

    return NextResponse.json(
      {
        ok: true,
        supabaseConfigured: true,
        visitorMetrics: {
          available: false,
          message:
            "閲覧者数はまだ管理画面に連携していません。Vercel Analytics または Google Analytics をつなぐと、ここに訪問数や流入元を表示できます。",
        },
        warnings,
        overview: {
          totalUsers: profiles.length,
          freeCount,
          personalCount,
          teacherCount,
          adminCount,
          signup7d,
          signup30d,
          activeSubscriptions,
          trialingSubscriptions,
          canceledSubscriptions,
          estimatedMonthlyRevenue,
        },
        pdf: {
          totalGenerations: pdfGenerations.length,
          generations7d: pdf7d.length,
          generations30d: pdf30d.length,
          totalWordsGenerated,
          totalWordsGenerated30d,
          topTypes,
          recent: recentPdfGenerations,
        },
        wordbooks: {
          total: wordbooks.length,
          official: officialBooks.length,
          publicCount: publicBooks,
          personalCount: personalBooks,
          teacherCount: teacherBooks,
          adminOnlyCount: adminOnlyBooks,
          topWordbooks,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: readableError(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
