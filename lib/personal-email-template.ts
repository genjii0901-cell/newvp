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

export function emailKindForDelivery(kind: "marketing" | "service", content: string) {
  return content.includes(PERSONAL_EMAIL_OFFER_LINK) ? "marketing" : kind;
}
