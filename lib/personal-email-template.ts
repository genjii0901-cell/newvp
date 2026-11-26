export const PERSONAL_EMAIL_OFFER_LINK = "{{personal_offer_url}}";

export function emailKindForDelivery(kind: "marketing" | "service", content: string) {
  return content.includes(PERSONAL_EMAIL_OFFER_LINK) ? "marketing" : kind;
}
