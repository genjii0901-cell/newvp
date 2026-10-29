// 料金は Vercel の環境変数で変更できる（変更後に再デプロイ）。
// 画面（ブラウザ）でも使うため NEXT_PUBLIC_ 付き。未設定・不正な値は既定値に戻す。
function envInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export const PERSONAL_INTRO_DAYS = envInt(process.env.NEXT_PUBLIC_PERSONAL_INTRO_DAYS, 7, 1, 30);
export const PERSONAL_INTRO_JPY = envInt(process.env.NEXT_PUBLIC_PERSONAL_INTRO_JPY, 380, 50, 100_000);
export const PERSONAL_MONTHLY_JPY = envInt(process.env.NEXT_PUBLIC_PERSONAL_MONTHLY_JPY, 1580, 50, 100_000);
export const PRINT_PAGE_JPY = 50;

// Stripeの料金は作成後に金額を変えられないため、金額ごとに別の名前（lookup key）で自動作成する。
export const PERSONAL_MONTHLY_PRICE = {
  lookupKey: `vpp_personal_monthly_${PERSONAL_MONTHLY_JPY}_v1`,
  name: "Vocab Print Pro Personal 月額",
  amount: PERSONAL_MONTHLY_JPY,
  interval: "month" as const,
};
export const PERSONAL_INTRO_PRICE = {
  lookupKey: `vpp_personal_intro_${PERSONAL_INTRO_DAYS}days_${PERSONAL_INTRO_JPY}_v1`,
  name: `Vocab Print Pro Personal 初回${PERSONAL_INTRO_DAYS}日間`,
  amount: PERSONAL_INTRO_JPY,
};

export function personalOfferLabel(eligibleForIntro: boolean) {
  return eligibleForIntro
    ? `最初の${PERSONAL_INTRO_DAYS}日間は${PERSONAL_INTRO_JPY}円、その後は月${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円`
    : `月${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円`;
}

export function appendPersonalCheckoutPrices(
  body: URLSearchParams,
  introductoryWeek: boolean,
  prices: { monthly: string; intro?: string },
) {
  if (!prices.monthly.startsWith("price_") || (introductoryWeek && !prices.intro?.startsWith("price_"))) {
    throw new Error("Personalの料金設定を確認できませんでした。");
  }
  body.set("line_items[0][price]", prices.monthly);
  body.set("line_items[0][quantity]", "1");
  body.set("payment_method_collection", "always");
  body.set("locale", "ja");
  body.set("metadata[billing_version]", "personal-380-1580-v1");
  body.set("subscription_data[metadata][billing_version]", "personal-380-1580-v1");

  if (introductoryWeek) {
    body.set("line_items[1][price]", prices.intro!);
    body.set("line_items[1][quantity]", "1");
    body.set("subscription_data[trial_period_days]", String(PERSONAL_INTRO_DAYS));
    body.set("metadata[intro_paid_week]", "1");
    body.set("subscription_data[metadata][intro_paid_week]", "1");
  }
  body.set("custom_text[submit][message]", introductoryWeek
    ? `申込時に${PERSONAL_INTRO_JPY}円。最初の${PERSONAL_INTRO_DAYS}日間の後は月額${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円で自動更新します。更新前に解約できます。`
    : `月額${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円で自動更新します。更新前に解約できます。`);
}
