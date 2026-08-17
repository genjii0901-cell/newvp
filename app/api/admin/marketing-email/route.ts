import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin, resolveAdminUserFromBearerToken } from "@/lib/admin-auth";
import { buildMarketingEmailHtml, createUnsubscribeUrl } from "@/lib/marketing-email";
import { getSupabaseAdmin, isSupabaseServerConfigured, readableError } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Recipient = { id: string; email: string };

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com").replace(/\/$/, "");
  return { apiKey, from, appUrl, enabled: Boolean(apiKey && from) };
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim());
}

function stringValue(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function migrationMessage() {
  return "メール配信テーブルが未作成です。docs/migrations/add-marketing-email.sql をSupabase SQL Editorで実行してください。";
}

async function loadRecipients() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,plan,marketing_email_opt_in")
    .eq("plan", "free")
    .eq("marketing_email_opt_in", true)
    .limit(1000);
  if (error) throw error;

  const seen = new Set<string>();
  return ((data ?? []) as Array<{ id?: string; email?: string | null }>)
    .filter((row): row is { id: string; email: string } => Boolean(row.id) && validEmail(row.email))
    .filter((row) => {
      const email = row.email.toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

async function loadSummary() {
  const supabase = getSupabaseAdmin();
  const [freeResult, optedInResult, campaignsResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "free"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "free").eq("marketing_email_opt_in", true),
    supabase.from("marketing_email_campaigns").select("id,subject,recipient_count,status,created_at,sent_at").order("created_at", { ascending: false }).limit(5),
  ]);
  if (freeResult.error || optedInResult.error || campaignsResult.error) throw freeResult.error ?? optedInResult.error ?? campaignsResult.error;
  return {
    freeUsers: freeResult.count ?? 0,
    optedInUsers: optedInResult.count ?? 0,
    recentCampaigns: campaignsResult.data ?? [],
  };
}

async function sendWithResend(messages: Array<Record<string, unknown>>, idempotencyKey: string) {
  const config = emailConfig();
  if (!config.enabled) throw new Error("RESEND_API_KEY と RESEND_FROM_EMAIL をVercel環境変数に設定してください。");
  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(messages),
  });
  const result = (await response.json().catch(() => ({}))) as { data?: Array<{ id?: string }>; message?: string; name?: string };
  if (!response.ok) throw new Error(result.message ?? result.name ?? "Resendへの送信に失敗しました。");
  return result.data ?? [];
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabaseのサーバー設定が必要です。" }, { status: 503 });

  try {
    return NextResponse.json({ ok: true, ...await loadSummary(), emailReady: emailConfig().enabled });
  } catch (error) {
    return NextResponse.json({ ok: false, message: migrationMessage(), detail: readableError(error) }, { status: 409 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabaseのサーバー設定が必要です。" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const subject = stringValue(body.subject, 160);
  const content = stringValue(body.content, 8000);
  const action = stringValue(body.action, 20);
  if (!subject || !content) return NextResponse.json({ ok: false, message: "件名と本文を入力してください。" }, { status: 400 });

  const config = emailConfig();
  if (!config.enabled) return NextResponse.json({ ok: false, message: "RESEND_API_KEY と RESEND_FROM_EMAIL をVercel環境変数に設定してください。" }, { status: 503 });

  try {
    if (action === "test") {
      const testEmail = stringValue(body.testEmail, 320).toLowerCase();
      if (!validEmail(testEmail)) return NextResponse.json({ ok: false, message: "テスト送信先メールアドレスを確認してください。" }, { status: 400 });
      const unsubscribeUrl = createUnsubscribeUrl(config.appUrl, testEmail);
      if (!unsubscribeUrl) return NextResponse.json({ ok: false, message: "配信停止URL用の署名鍵を設定してください。" }, { status: 503 });
      await sendWithResend([{
        from: config.from,
        to: [testEmail],
        subject: `[テスト] ${subject}`,
        text: `${content}\n\n配信停止: ${unsubscribeUrl}`,
        html: buildMarketingEmailHtml(content, unsubscribeUrl),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "kind", value: "marketing-test" }],
      }], `marketing-test-${crypto.randomUUID()}`);
      return NextResponse.json({ ok: true, message: "テストメールを送信しました。受信箱と迷惑メールフォルダを確認してください。" });
    }

    if (action !== "send" || body.confirmation !== "SEND") {
      return NextResponse.json({ ok: false, message: "本送信は確認欄に SEND と入力してから実行してください。" }, { status: 400 });
    }

    // The signed admin session checked above is enough to send. A Supabase user
    // ID is retained when available, but password + TOTP administrators can
    // still use this screen during account recovery.
    const admin = await resolveAdminUserFromBearerToken(request);

    const recipients = await loadRecipients();
    if (recipients.length === 0) return NextResponse.json({ ok: false, message: "受信を許可したFree会員がまだいません。" }, { status: 400 });
    if (recipients.length > 500) return NextResponse.json({ ok: false, message: "一度に送信できるのは500件までです。配信対象を分けてください。" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_email_campaigns")
      .insert({ subject, body: content, audience: "free_opted_in", recipient_count: recipients.length, status: "sending", created_by: admin.ok ? admin.user.id : null })
      .select("id")
      .single();
    if (campaignError || !campaign) throw campaignError ?? new Error(migrationMessage());

    try {
      const deliveries: Array<Record<string, unknown>> = [];
      for (let index = 0; index < recipients.length; index += 100) {
        const chunk = recipients.slice(index, index + 100);
        const messages = chunk.map((recipient) => {
          const unsubscribeUrl = createUnsubscribeUrl(config.appUrl, recipient.email);
          if (!unsubscribeUrl) throw new Error("配信停止URL用の署名鍵を設定してください。");
          return {
            from: config.from,
            to: [recipient.email],
            subject,
            text: `${content}\n\n配信停止: ${unsubscribeUrl}`,
            html: buildMarketingEmailHtml(content, unsubscribeUrl),
            headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
            tags: [{ name: "kind", value: "marketing" }, { name: "campaign", value: campaign.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) }],
          };
        });
        const sent = await sendWithResend(messages, `marketing-${campaign.id}-${index}`);
        for (let itemIndex = 0; itemIndex < chunk.length; itemIndex += 1) {
          deliveries.push({ campaign_id: campaign.id, profile_id: chunk[itemIndex].id, email: chunk[itemIndex].email, resend_email_id: sent[itemIndex]?.id ?? null, status: "queued" });
        }
      }
      const { error: deliveryError } = await supabase.from("marketing_email_deliveries").insert(deliveries);
      if (deliveryError) throw deliveryError;
      await supabase.from("marketing_email_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);
      return NextResponse.json({ ok: true, message: `${recipients.length}名へ送信しました。ResendのEmails画面で配信状況を確認できます。`, recipientCount: recipients.length });
    } catch (error) {
      await supabase.from("marketing_email_campaigns").update({ status: "failed" }).eq("id", campaign.id);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}
