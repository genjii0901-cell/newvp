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

// prices.monthly / prices.intro が null のときは、Stripeの料金オブジェクトを使わず、
// 決済ページ側で金額を直接指定する（料金の作成権限がなくても決済ページを作れる）。
export function appendPersonalCheckoutPrices(
  body: URLSearchParams,
  introductoryWeek: boolean,
  prices: { monthly: string | null; intro?: string | null },
) {
  const invalid = (id: string | null | undefined) => typeof id === "string" && !id.startsWith("price_");
  if (invalid(prices.monthly) || invalid(prices.intro) ||
      (introductoryWeek && prices.intro === undefined) || prices.monthly === undefined) {
    throw new Error("Personalの料金設定を確認できませんでした。");
  }
  if (prices.monthly) {
    body.set("line_items[0][price]", prices.monthly);
  } else {
    body.set("line_items[0][price_data][currency]", "jpy");
    body.set("line_items[0][price_data][unit_amount]", String(PERSONAL_MONTHLY_PRICE.amount));
    body.set("line_items[0][price_data][recurring][interval]", "month");
    body.set("line_items[0][price_data][product_data][name]", PERSONAL_MONTHLY_PRICE.name);
  }
  body.set("line_items[0][quantity]", "1");
  body.set("payment_method_collection", "always");
  body.set("locale", "ja");
  body.set("metadata[billing_version]", "personal-380-1580-v1");
  body.set("subscription_data[metadata][billing_version]", "personal-380-1580-v1");

  if (introductoryWeek) {
    if (prices.intro) {
      body.set("line_items[1][price]", prices.intro);
    } else {
      body.set("line_items[1][price_data][currency]", "jpy");
      body.set("line_items[1][price_data][unit_amount]", String(PERSONAL_INTRO_PRICE.amount));
      body.set("line_items[1][price_data][product_data][name]", PERSONAL_INTRO_PRICE.name);
    }
    body.set("line_items[1][quantity]", "1");
    body.set("subscription_data[trial_period_days]", String(PERSONAL_INTRO_DAYS));
    body.set("metadata[intro_paid_week]", "1");
    body.set("subscription_data[metadata][intro_paid_week]", "1");
  }
  body.set("custom_text[submit][message]", introductoryWeek
    ? `申込時に${PERSONAL_INTRO_JPY}円。最初の${PERSONAL_INTRO_DAYS}日間の後は月額${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円で自動更新します。更新前に解約できます。`
    : `月額${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円で自動更新します。更新前に解約できます。`);
}

// ---- 2026-11 料金改定（税込・A/B案は廃止） ----
// 年間プランは一括払い（年1回・自動更新）。月換算は参考表示で、必ず年額の総額と併記する。
export const PERSONAL_ANNUAL_JPY = 11_800;
export const PERSONAL_ANNUAL_MONTHLY_DISPLAY_JPY = 980;
export const TEACHER_MONTHLY_JPY = 3_980;
export const TEACHER_ANNUAL_JPY = 24_960;
export const TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY = 2_080;

const yen = (value: number) => value.toLocaleString("ja-JP");

// 画面に出す Personal の文言。introEligible＝初回特典（7日間アクセス）を使えるか。
export function personalOfferText(introEligible: boolean) {
  const monthly = `月${yen(PERSONAL_MONTHLY_JPY)}円`;
  if (!introEligible) {
    return {
      badge: "月額プラン",
      price: `月額 ¥${yen(PERSONAL_MONTHLY_JPY)}`,
      after: "毎月自動更新・いつでも解約できます",
      summary: `${monthly}（税込）で自動更新します。`,
      cta: "Personalを始める",
      payNote: `申込時に${monthly}を決済し、毎月自動更新します。解約すると次回以降の更新が止まります（日割りの返金はありません）。`,
    };
  }
  return {
    badge: `${PERSONAL_INTRO_DAYS}日間アクセス`,
    price: `${PERSONAL_INTRO_DAYS}日間アクセス ¥${yen(PERSONAL_INTRO_JPY)}`,
    after: `以降 ${monthly}（自動更新）`,
    summary: `最初の${PERSONAL_INTRO_DAYS}日間アクセスは${PERSONAL_INTRO_JPY}円、以降は${monthly}（税込）で自動更新します。`,
    cta: `${PERSONAL_INTRO_DAYS}日間${PERSONAL_INTRO_JPY}円で始める`,
    payNote: `申込時に${PERSONAL_INTRO_JPY}円を決済し、${PERSONAL_INTRO_DAYS}日間アクセスできます。その後は自動で${monthly}の更新に移ります。更新前に解約できます。`,
  };
}

export const PERSONAL_FEATURES = [
  "印刷回数は無制限（1回20ページまで）",
  "透かしなし・記入名を設定可能",
  "マイ単語帳とPDF生成履歴の保存",
  "聞き流しの全設定（表示切替・画面なし・ランダム・ループ・回数と間隔）",
  "単語チェックの全設定（日→英・制限時間・★だけ出題・自動発音）",
  "忘却曲線に合わせた復習",
  "みんなの単語帳をまとめて利用可能",
] as const;

export const TEACHER_FEATURES = [
  "Personalの全機能を含む",
  "単語テストのタイトルを自由に変更",
  "プリント下の「Created by」表記を外せる",
  "20ページを超える教材もまとめて印刷",
  "自作単語帳のCSV出力と列名の設定",
  "塾・学校での配布用に繰り返し印刷",
] as const;

export type BillingInterval = "month" | "year";

// 月額・年額プラン用（初回7日間アクセスなし）。Teacher（塾プラン）とPersonal年間で使う。
// Stripe側にPriceを作らず、決済ページへ金額を直接渡す（Personal月額と同じ方式）。
export function appendInlinePlanPrice(body: URLSearchParams, plan: "personal" | "teacher", interval: BillingInterval) {
  const table = {
    personal: { month: PERSONAL_MONTHLY_JPY, year: PERSONAL_ANNUAL_JPY },
    teacher: { month: TEACHER_MONTHLY_JPY, year: TEACHER_ANNUAL_JPY },
  } as const;
  const amount = table[plan][interval];
  const label = `${plan === "personal" ? "Vocab Print Pro Personal" : "Vocab Print Pro Teacher"} ${interval === "year" ? "年額" : "月額"}`;
  body.set("line_items[0][price_data][currency]", "jpy");
  body.set("line_items[0][price_data][unit_amount]", String(amount));
  body.set("line_items[0][price_data][recurring][interval]", interval);
  body.set("line_items[0][price_data][product_data][name]", label);
  body.set("line_items[0][quantity]", "1");
  body.set("payment_method_collection", "always");
  body.set("locale", "ja");
  const version = `${plan}-${interval}-${amount}-v1`;
  body.set("metadata[billing_version]", version);
  body.set("subscription_data[metadata][billing_version]", version);
  body.set("custom_text[submit][message]", interval === "year"
    ? `申込時に年額${yen(amount)}円（税込）を一括で決済し、1年ごとに自動更新します。更新前に解約できます。`
    : `月額${yen(amount)}円（税込）で自動更新します。更新前に解約できます。`);
}
