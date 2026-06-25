import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [value.message, value.error_description, value.details, value.hint].filter(
      (item): item is string => typeof item === "string" && item.length > 0
    );
    if (parts.length > 0) return parts.join(" ");
  }
  return "原因不明のエラーです。設定チェックとSupabaseのテーブル作成状況を確認してください。";
}

export function getMissingSupabaseServerEnv() {
  return [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function isSupabaseServerConfigured() {
  return getMissingSupabaseServerEnv().length === 0;
}

export function supabaseServerConfigResponse() {
  const missing = getMissingSupabaseServerEnv();
  return NextResponse.json(
    {
      ok: false,
      missing,
      message: `Supabaseのサーバー設定が未完了です。Vercelまたは.env.localに ${missing.join(
        " / "
      )} を設定してください。`,
    },
    { status: 503 }
  );
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireSupabaseUser(
  request: Request
): Promise<{ user: User; response: null } | { user: null; response: NextResponse }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!supabaseUrl || !anonKey) {
    return {
      user: null,
      response: NextResponse.json(
        {
          ok: false,
          error: "Supabase Auth is not configured.",
          message:
            "Supabase Authの設定が未完了です。NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。",
        },
        { status: 500 }
      ),
    };
  }

  if (!token) {
    return {
      user: null,
      response: NextResponse.json(
        { ok: false, error: "Login is required.", message: "ログインが必要です。" },
        { status: 401 }
      ),
    };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      user: null,
      response: NextResponse.json(
        {
          ok: false,
          error: "Login session is invalid.",
          message: "ログイン状態を確認できません。もう一度ログインしてください。",
        },
        { status: 401 }
      ),
    };
  }

  return { user: data.user, response: null };
}

export async function ensureProfile(user: User) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function tryEnsureProfile(user: User) {
  try {
    return await ensureProfile(user);
  } catch (error) {
    console.error("Failed to ensure profile", readableError(error));
    return null;
  }
}
