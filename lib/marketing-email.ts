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

const emailFont = "-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Kaku Gothic ProN',Meiryo,sans-serif";
const personalPricingUrl = "https://www.vocabprint.com/pricing#personal";

function renderEmailButton(url: string, label: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px"><tr><td bgcolor="#2563eb" style="border-radius:8px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.4;text-decoration:none">${label}</a></td></tr></table>`;
}

function renderEmailLine(line: string) {
  const escaped = escapeHtml(line);
  if (!/^https?:\/\/[^\s<>"']+$/i.test(line) || !URL.canParse(line)) return escaped;

  const url = new URL(line);
  if (url.username || url.password) return escaped;
  return `<a href="${escapeHtml(url.href)}" style="color:#1d4ed8;text-decoration:underline;overflow-wrap:anywhere">${escaped}</a>`;
}

export function buildMarketingEmailHtml(
  body: string,
  options: { kind: "marketing" | "service"; unsubscribeUrl?: string | null; personalOfferUrl?: string | null; personalCampaign?: boolean }
) {
  const content = body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      const isOfferLink = trimmed === options.personalOfferUrl;
      const isPricingLink = (options.kind === "marketing" || options.personalCampaign) && trimmed === personalPricingUrl;
      return isOfferLink || isPricingLink ? ["", trimmed, ""].join("\n") : trimmed;
    })
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      if (options.personalOfferUrl && paragraph === options.personalOfferUrl) {
        return renderEmailButton(paragraph, "専用リンクで初回7日間0円を申し込む");
      }
      if ((options.kind === "marketing" || options.personalCampaign) && paragraph === personalPricingUrl) {
        return renderEmailButton(paragraph, options.personalCampaign ? "7日間0円キャンペーンを見る" : "Personalの料金・申込みを確認する");
      }
      const [firstLine, ...rest] = paragraph.split("\n");
      if (firstLine.startsWith("■ ")) {
        const title = escapeHtml(firstLine.slice(2));
        const description = rest.map(renderEmailLine).join("<br />");
        return `<p style="margin:0 0 18px"><strong style="color:#1e40af">${title}</strong>${description ? `<br />${description}` : ""}</p>`;
      }
      return `<p style="margin:0 0 18px">${paragraph.split("\n").map(renderEmailLine).join("<br />")}</p>`;
    })
    .join("");

  const footer = options.kind === "marketing" && options.unsubscribeUrl
    ? `このメールは、Vocab Print Proのお知らせを受け取る設定をした方へお送りしています。<br /><a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#475569;text-decoration:underline">お知らせメールの配信を停止する</a>`
    : "このメールは、Vocab Print Proの登録ユーザーへお送りする運営・アカウントに関するお知らせです。";

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vocab Print Pro</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${emailFont}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:600px;border:1px solid #dbeafe;border-radius:14px">
        <tr><td style="padding:16px 20px;border-bottom:1px solid #dbeafe;border-top:4px solid #2563eb;border-radius:13px 13px 0 0">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" bgcolor="#2563eb" style="border-radius:8px;color:#ffffff;font-size:13px;font-weight:900;line-height:36px">VP</td>
            <td valign="middle" style="padding-left:10px;color:#0f172a;font-size:17px;font-weight:800;line-height:1.35">Vocab Print Pro</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:22px 20px 4px;color:#0f172a;font-size:15px;line-height:1.8;overflow-wrap:break-word">${content}</td></tr>
        <tr><td bgcolor="#f1f5f9" style="padding:14px 20px;border-top:1px solid #dbeafe;border-radius:0 0 13px 13px;color:#475569;font-size:12px;line-height:1.7">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
