import crypto from "node:crypto";

const TOKEN_VERSION = "v1";

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function getSigningSecret() {
  return (
    process.env.MARKETING_EMAIL_UNSUBSCRIBE_SECRET ??
    process.env.ADMIN_SESSION_SECRET ??
    process.env.ADMIN_PASSWORD ??
    ""
  );
}

function sign(email: string) {
  const secret = getSigningSecret();
  if (!secret) return null;
  return crypto
    .createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}:marketing-unsubscribe:${email.toLowerCase()}`)
    .digest("base64url");
}

export function createUnsubscribeUrl(appUrl: string, email: string) {
  const signature = sign(email);
  if (!signature) return null;
  const url = new URL("/unsubscribe", appUrl);
  url.searchParams.set("e", base64Url(email.toLowerCase()));
  url.searchParams.set("s", signature);
  return url.toString();
}

export function verifyUnsubscribeRequest(encodedEmail: string | null, signature: string | null) {
  if (!encodedEmail || !signature) return null;
  let email = "";
  try {
    email = Buffer.from(encodedEmail, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return null;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;

  const expected = sign(email);
  if (!expected || expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  return email;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function buildMarketingEmailHtml(
  body: string,
  options: { kind: "marketing" | "service"; unsubscribeUrl?: string | null }
) {
  const content = escapeHtml(body).replace(/\r?\n/g, "<br />");
  const footer = options.kind === "marketing" && options.unsubscribeUrl
    ? `このメールは、Vocab Print Proのお知らせを受け取る設定をした方へお送りしています。<br /><a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#475569">お知らせメールの配信を停止する</a>`
    : "このメールは、Vocab Print Proの登録ユーザーへお送りする運営・アカウントに関するお知らせです。";
  return `<!doctype html><html lang="ja"><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><main style="max-width:600px;margin:0 auto;padding:32px 20px"><section style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><p style="margin:0 0 18px;font-weight:800;font-size:18px">Vocab Print Pro</p><div style="font-size:15px;line-height:1.8">${content}</div></section><p style="margin:18px 4px 0;color:#64748b;font-size:12px;line-height:1.7">${footer}</p></main></body></html>`;
}
