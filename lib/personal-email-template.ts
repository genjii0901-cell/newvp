export const PERSONAL_EMAIL_OFFER_LINK = "{{personal_offer_url}}";
const PERSONAL_PRICING_URL = "https://www.vocabprint.com/pricing#personal";

export const PERSONAL_FEATURES_EMAIL = {
  subject: "Vocab Print Proで聞き流し・単語テスト印刷・かぶり調査",
  content: [
    "Vocab Print Proをご利用いただき、ありがとうございます。",
    "スマホでの聞き流し、範囲を選んだ単語テスト印刷、単語帳同士のかぶり調査を使って、いつもの単語帳で復習できます。",
    "Personalでは、聞き流しの詳しい設定、印刷回数の上限解除、忘却曲線に沿った復習が使えます。",
    PERSONAL_PRICING_URL,
    "Vocab Print Pro",
  ].join("\n\n"),
};

function isOfferLinkLine(line: string) {
  return line.trim() === PERSONAL_EMAIL_OFFER_LINK;
}

export function advertisesPersonalEmailOffer(subject: string, content: string) {
  const offerText = /(?:[7７]\s*日間|[1１一]\s*週間)\s*(?:は|が|を)?\s*(?:[0０]\s*円|無料)|[0０]\s*円特典|メール(?:受信者)?限定の特典/;
  return offerText.test(subject + "\n" + content);
}

export function hasPersonalEmailOfferLink(kind: "marketing" | "service", subject: string, content: string) {
  return (kind === "marketing" || advertisesPersonalEmailOffer(subject, content))
    && content.split(/\r?\n/).some(isOfferLinkLine);
}

export function replacePersonalEmailOfferLink(content: string, url: string) {
  return content.split(/\r?\n/).map((line) => isOfferLinkLine(line) ? url : line).join("\n");
}

export function emailKindForDelivery(kind: "marketing" | "service", hasOfferLink: boolean) {
  return hasOfferLink ? "marketing" : kind;
}
