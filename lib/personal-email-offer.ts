import { createHmac, timingSafeEqual } from "node:crypto";

type Recipient = { id: string; email?: string | null };

function sign(recipient: Recipient) {
  // Use an existing server-only secret unless a dedicated key is configured.
  const secret = process.env.PERSONAL_OFFER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = recipient.email?.trim().toLowerCase();
  if (!secret || !email) return null;
  return createHmac("sha256", secret)
    .update(JSON.stringify(["personal-email-offer-v1", recipient.id, email]))
    .digest("base64url");
}

export function personalEmailOfferOpen(now = Date.now()) {
  const end = process.env.PERSONAL_OFFER_END_AT;
  return !end || Date.parse(end) > now;
}

export function createPersonalEmailOfferUrl(appUrl: string, recipient: Recipient) {
  const token = sign(recipient);
  if (!token || !personalEmailOfferOpen()) return null;
  const url = new URL("/pricing", appUrl);
  url.searchParams.set("offer", token);
  url.hash = "personal";
  return url.toString();
}

export function isPersonalEmailOfferEligible(
  token: unknown,
  recipient: Recipient,
  profile: { plan?: unknown; trial_used?: unknown } | null,
) {
  if (!profile || profile.plan !== "free" || profile.trial_used || !personalEmailOfferOpen()) return false;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = sign(recipient);
  return expected !== null && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
