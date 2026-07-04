import { NextResponse } from "next/server";
import {
  ensureProfile,
  getSupabaseAdmin,
  readableError,
  requireSupabaseUser,
  supabaseServerConfigResponse,
  isSupabaseServerConfigured,
} from "@/lib/supabase/admin";

function isMissingTableError(error: unknown, tableName: string) {
  const message = readableError(error);
  return (
    message.includes(`Could not find the table 'public.${tableName}'`) ||
    message.includes(`relation "public.${tableName}" does not exist`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  if (!isSupabaseServerConfigured()) {
    return supabaseServerConfigResponse();
  }

  try {
    const supabase = getSupabaseAdmin();
    const profile = await ensureProfile(auth.user);

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", auth.user.id);

    if (subscriptionsError) {
      return NextResponse.json({ ok: false, error: readableError(subscriptionsError) }, { status: 500 });
    }

    const activeSubscription = (subscriptions ?? []).find(
      (subscription) => subscription.status === "active" || subscription.status === "trialing"
    );

    if (activeSubscription) {
      return NextResponse.json(
        {
          ok: false,
          error: "有料契約またはトライアルが残っています。先に請求ポータルで解約してから削除してください。",
          needsCancellation: true,
        },
        { status: 409 }
      );
    }

    const { data: ownedWordbooks, error: ownedWordbooksError } = await supabase
      .from("wordbooks")
      .select("id")
      .eq("owner_id", auth.user.id);

    if (ownedWordbooksError) {
      return NextResponse.json({ ok: false, error: readableError(ownedWordbooksError) }, { status: 500 });
    }

    const ownedWordbookIds = (ownedWordbooks ?? [])
      .map((book) => String((book as { id?: unknown }).id ?? ""))
      .filter(Boolean);

    if (ownedWordbookIds.length > 0) {
      const { error: wordsError } = await supabase.from("words").delete().in("wordbook_id", ownedWordbookIds);
      if (wordsError) {
        return NextResponse.json({ ok: false, error: readableError(wordsError) }, { status: 500 });
      }

      const { error: wordbooksError } = await supabase.from("wordbooks").delete().in("id", ownedWordbookIds);
      if (wordbooksError) {
        return NextResponse.json({ ok: false, error: readableError(wordbooksError) }, { status: 500 });
      }
    }

    const { error: pdfError } = await supabase.from("pdf_generations").delete().eq("user_id", auth.user.id);
    if (pdfError && !isMissingTableError(pdfError, "pdf_generations")) {
      return NextResponse.json({ ok: false, error: readableError(pdfError) }, { status: 500 });
    }

    const { error: subscriptionsDeleteError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", auth.user.id);
    if (subscriptionsDeleteError) {
      return NextResponse.json({ ok: false, error: readableError(subscriptionsDeleteError) }, { status: 500 });
    }

    const { error: profileError } = await supabase.from("profiles").delete().eq("id", auth.user.id);
    if (profileError) {
      return NextResponse.json({ ok: false, error: readableError(profileError) }, { status: 500 });
    }

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(auth.user.id);
    if (deleteUserError) {
      return NextResponse.json({ ok: false, error: readableError(deleteUserError) }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedUserId: auth.user.id,
      deletedEmail: profile.email ?? auth.user.email ?? null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}
