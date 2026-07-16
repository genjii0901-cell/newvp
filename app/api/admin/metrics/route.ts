import { createHash } from "crypto";
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
  email?: string | null;
  plan: string | null;
  role: string | null;
  stripe_customer_id?: string | null;
  created_at?: string | null;
};

type SubscriptionRow = {
  user_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
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

type AppSettingRow = {
  key: string;
  value: string | null;
};

type AuthUserSummary = {
  id: string;
  email: string | null;
  created_at?: string | null;
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

function getObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hashVisitor(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function toPublicReferrerLabel(referrer: string) {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return referrer;
  }
}

function isActiveSubscription(subscription: SubscriptionRow | null | undefined) {
  return subscription?.status === "active" || subscription?.status === "trialing";
}

function normalizePlan(value: string | null | undefined) {
  if (value === "personal" || value === "teacher") return value;
  return "free";
}

async function listAuthUsers() {
  const supabase = getSupabaseAdmin();
  const users: AuthUserSummary[] = [];
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch =
      data?.users?.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
      })) ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
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

    const [authUsers, profilesResult, subscriptionsResult, pdfResult, wordbooksResult, settingsResult] = await Promise.all([
      listAuthUsers(),
      safeSelect<ProfileRow>(() =>
        supabase.from("profiles").select("id,email,plan,role,stripe_customer_id,created_at").limit(5000)
      ),
      safeSelect<SubscriptionRow>(() =>
        supabase
          .from("subscriptions")
          .select("user_id,stripe_customer_id,stripe_subscription_id,plan,status,created_at,current_period_end")
          .limit(5000)
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
      safeSelect<AppSettingRow>(() =>
        supabase
          .from("app_settings")
          .select("key,value")
          .or("key.like.visit_total::%,key.like.visit_unique_total::%,key.like.visit_path::%,key.like.visit_referrer::%,key.like.visit_unique::%")
          .limit(5000)
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
      settingsResult.warning,
    ].filter((value): value is string => Boolean(value));

    const settings = settingsResult.data;

    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const latestSubscriptionByUserId = new Map<string, SubscriptionRow>();
    const latestSubscriptionByCustomerId = new Map<string, SubscriptionRow>();
    for (const subscription of subscriptions) {
      const keys = [
        subscription.user_id ? `user:${subscription.user_id}` : "",
        subscription.stripe_customer_id ? `customer:${subscription.stripe_customer_id}` : "",
      ].filter(Boolean);
      for (const key of keys) {
        const [, id] = key.split(":");
        const targetMap = key.startsWith("user:")
          ? latestSubscriptionByUserId
          : latestSubscriptionByCustomerId;
        const current = targetMap.get(id);
        const currentTime = current?.created_at ? new Date(current.created_at).getTime() : 0;
        const nextTime = subscription.created_at ? new Date(subscription.created_at).getTime() : 0;
        if (!current || nextTime >= currentTime) {
          targetMap.set(id, subscription);
        }
      }
    }
    const subscriptionForAccount = (userId: string, profile: ProfileRow | null) => {
      return latestSubscriptionByUserId.get(userId) ??
        (profile?.stripe_customer_id ? latestSubscriptionByCustomerId.get(profile.stripe_customer_id) : undefined) ??
        null;
    };
    const missingProfileCount = authUsers.filter((user) => !profilesById.has(user.id)).length;
    const usersForCounts =
      authUsers.length > 0
        ? authUsers
        : profiles.map((profile) => ({
            id: profile.id,
            email: profile.email ?? null,
            created_at: profile.created_at ?? null,
          }));

    const effectiveAccountPlans = usersForCounts.map((user) => {
      const profile = profilesById.get(user.id) ?? null;
      const subscription = subscriptionForAccount(user.id, profile);
      const subscriptionPlan = normalizePlan(subscription?.plan);
      const profilePlan = normalizePlan(profile?.plan);
      const effectivePlan = isActiveSubscription(subscription) && subscriptionPlan !== "free"
        ? subscriptionPlan
        : profilePlan;
      return {
        userId: user.id,
        effectivePlan,
        profilePlan,
        subscription,
      };
    });

    const freeCount = effectiveAccountPlans.filter((account) => account.effectivePlan === "free").length;
    const personalCount = effectiveAccountPlans.filter((account) => account.effectivePlan === "personal").length;
    const teacherCount = effectiveAccountPlans.filter((account) => account.effectivePlan === "teacher").length;
    const profilePersonalCount = profiles.filter((profile) => profile.plan === "personal").length;
    const profileTeacherCount = profiles.filter((profile) => profile.plan === "teacher").length;
    const adminCount = profiles.filter((profile) => profile.role === "admin").length;
    const signup7d = usersForCounts.filter((user) => isRecent(user.created_at, 7)).length;
    const signup30d = usersForCounts.filter((user) => isRecent(user.created_at, 30)).length;

    const activeSubscriptions = subscriptions.filter(
      (subscription) => isActiveSubscription(subscription)
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

    const date30dThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const date7dThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let viewsToday = 0;
    let views7d = 0;
    let views30d = 0;
    let uniqueToday = 0;
    let unique7d = 0;
    let unique30d = 0;
    const pathCounts = new Map<string, number>();
    const referrerCounts = new Map<string, { url: string | null; views: number }>();
    const visitorGroups = new Map<
      string,
      {
        stableVisitorHash: string;
        visits: number;
        daysSeen: number;
        firstSeen: string;
        lastSeen: string;
        lastPath: string;
        referrer: string;
        ua: string;
      }
    >();
    const today = new Date().toISOString().slice(0, 10);
    const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
    const currentUa = request.headers.get("user-agent") ?? "";
    const currentStableVisitorHash = hashVisitor(`${ip}|${currentUa}`);

    for (const row of settings) {
      const key = row.key ?? "";
      const rawValue = Number(row.value ?? "0");
      const count = Number.isFinite(rawValue) ? rawValue : 0;

      if (key.startsWith("visit_total::")) {
        const dateText = key.slice("visit_total::".length, "visit_total::".length + 10);
        const time = new Date(`${dateText}T00:00:00Z`).getTime();
        if (!Number.isFinite(time)) continue;
        if (dateText === today) viewsToday += count;
        if (time >= date7dThreshold) views7d += count;
        if (time >= date30dThreshold) views30d += count;
      } else if (key.startsWith("visit_unique_total::")) {
        const dateText = key.slice("visit_unique_total::".length, "visit_unique_total::".length + 10);
        const time = new Date(`${dateText}T00:00:00Z`).getTime();
        if (!Number.isFinite(time)) continue;
        if (dateText === today) uniqueToday += count;
        if (time >= date7dThreshold) unique7d += count;
        if (time >= date30dThreshold) unique30d += count;
      } else if (key.startsWith("visit_path::")) {
        const match = key.match(/^visit_path::(\d{4}-\d{2}-\d{2})::(.+)$/);
        if (!match) continue;
        const [, dateText, encodedPath] = match;
        const time = new Date(`${dateText}T00:00:00Z`).getTime();
        if (!Number.isFinite(time) || time < date30dThreshold) continue;
        const path = decodeURIComponent(encodedPath);
        pathCounts.set(path, (pathCounts.get(path) ?? 0) + count);
      } else if (key.startsWith("visit_referrer::")) {
        const match = key.match(/^visit_referrer::(\d{4}-\d{2}-\d{2})::(.+)$/);
        if (!match) continue;
        const [, dateText, encodedReferrer] = match;
        const time = new Date(`${dateText}T00:00:00Z`).getTime();
        if (!Number.isFinite(time) || time < date30dThreshold) continue;
        const referrer = decodeURIComponent(encodedReferrer);
        const label = toPublicReferrerLabel(referrer === "direct" ? "" : referrer);
        const existing = referrerCounts.get(label);
        referrerCounts.set(label, {
          url: referrer && referrer !== "direct" ? referrer : null,
          views: (existing?.views ?? 0) + count,
        });
      } else if (key.startsWith("visit_unique::")) {
        const match = key.match(/^visit_unique::(\d{4}-\d{2}-\d{2})::([a-f0-9]+)$/i);
        if (!match) continue;
        const [, dateText] = match;
        const time = new Date(`${dateText}T00:00:00Z`).getTime();
        if (!Number.isFinite(time) || time < date30dThreshold) continue;
        const payload = getObject(
          (() => {
            try {
              return JSON.parse(row.value ?? "{}");
            } catch {
              return null;
            }
          })()
        );
        if (!payload) continue;
        const stableVisitorHash = getString(payload.stableVisitorHash) || getString(payload.visitorHash);
        if (!stableVisitorHash) continue;
        const createdAt = getString(payload.createdAt) || `${dateText}T00:00:00.000Z`;
        const existing = visitorGroups.get(stableVisitorHash);
        if (!existing) {
          visitorGroups.set(stableVisitorHash, {
            stableVisitorHash,
            visits: 1,
            daysSeen: 1,
            firstSeen: createdAt,
            lastSeen: createdAt,
            lastPath: getString(payload.path) || "/",
            referrer: getString(payload.referrer),
            ua: getString(payload.ua),
          });
        } else {
          existing.visits += 1;
          existing.daysSeen += 1;
          if (createdAt < existing.firstSeen) existing.firstSeen = createdAt;
          if (createdAt >= existing.lastSeen) {
            existing.lastSeen = createdAt;
            existing.lastPath = getString(payload.path) || existing.lastPath;
            existing.referrer = getString(payload.referrer) || existing.referrer;
            existing.ua = getString(payload.ua) || existing.ua;
          }
        }
      }
    }

    const topPaths = Array.from(pathCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, views]) => ({ path, views, href: path }));

    const topReferrers = Array.from(referrerCounts.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 5)
      .map(([label, value]) => ({ label, url: value.url, views: value.views }));

    const recentVisitors = Array.from(visitorGroups.values())
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, 8)
      .map((item) => ({
        stableVisitorHash: item.stableVisitorHash,
        visits: item.visits,
        daysSeen: item.daysSeen,
        firstSeen: item.firstSeen,
        lastSeen: item.lastSeen,
        lastPath: item.lastPath,
        referrer: item.referrer,
        referrerLabel: toPublicReferrerLabel(item.referrer),
        ua: item.ua,
        isCurrentBrowser: item.stableVisitorHash === currentStableVisitorHash,
      }));

    const currentBrowserSummary =
      recentVisitors.find((item) => item.stableVisitorHash === currentStableVisitorHash) ?? null;

    const accountList = usersForCounts
      .map((authUser) => {
        const profile = profilesById.get(authUser.id) ?? null;
        const subscription = subscriptionForAccount(authUser.id, profile);
        const subscriptionPlan = normalizePlan(subscription?.plan);
        const profilePlan = normalizePlan(profile?.plan);
        const effectivePlan = isActiveSubscription(subscription) && subscriptionPlan !== "free"
          ? subscriptionPlan
          : profilePlan;
        return {
          id: authUser.id,
          email: authUser.email ?? profile?.email ?? null,
          created_at: authUser.created_at ?? profile?.created_at ?? null,
          role: profile?.role ?? "user",
          plan: effectivePlan,
          profilePlan,
          subscriptionPlan,
          planSource: isActiveSubscription(subscription) && subscriptionPlan !== "free" ? "stripe" : "profile",
          stripeCustomerId: profile?.stripe_customer_id ?? subscription?.stripe_customer_id ?? null,
          hasProfile: Boolean(profile),
          subscriptionStatus: subscription?.status ?? null,
          currentPeriodEnd: subscription?.current_period_end ?? null,
        };
      })
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 100);

    return NextResponse.json(
      {
        ok: true,
        supabaseConfigured: true,
        visitorMetrics: {
          available: settings.length > 0,
          message:
            settings.length > 0
              ? "サイト表示時に自動で閲覧数を記録しています。"
              : "まだ閲覧データがありません。数回ページを表示するとここに集計が出ます。",
          viewsToday,
          views7d,
          views30d,
          uniqueToday,
          unique7d,
          unique30d,
          topReferrers,
          topPaths,
          recentVisitors,
          currentBrowserSummary: currentBrowserSummary
            ? {
                estimatedSelfVisits30d: currentBrowserSummary.visits,
                estimatedSelfDays30d: currentBrowserSummary.daysSeen,
                lastPath: currentBrowserSummary.lastPath,
              }
            : null,
        },
        warnings,
        overview: {
          totalUsers: usersForCounts.length,
          profileUsers: profiles.length,
          missingProfileCount,
          freeCount,
          personalCount,
          teacherCount,
          profilePersonalCount,
          profileTeacherCount,
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
        accounts: accountList,
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
