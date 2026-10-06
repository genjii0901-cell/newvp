export const PERSONAL_INTRO_DAYS = 7;
export const PERSONAL_INTRO_JPY = 380;
export const PERSONAL_MONTHLY_JPY = 1580;
export const PRINT_PAGE_JPY = 50;

export function personalOfferLabel(eligibleForIntro: boolean) {
  return eligibleForIntro
    ? `最初の${PERSONAL_INTRO_DAYS}日間は${PERSONAL_INTRO_JPY}円、その後は月${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円`
    : `月${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円`;
}

export function appendPersonalCheckoutPrices(body: URLSearchParams, introductoryWeek: boolean) {
  body.set("line_items[0][price_data][currency]", "jpy");
  body.set("line_items[0][price_data][unit_amount]", String(PERSONAL_MONTHLY_JPY));
  body.set("line_items[0][price_data][recurring][interval]", "month");
  body.set("line_items[0][price_data][product_data][name]", "Vocab Print Pro Personal");
  body.set("line_items[0][quantity]", "1");

  if (introductoryWeek) {
    body.set("line_items[1][price_data][currency]", "jpy");
    body.set("line_items[1][price_data][unit_amount]", String(PERSONAL_INTRO_JPY));
    body.set("line_items[1][price_data][product_data][name]", "Personal 初回7日間");
    body.set("line_items[1][quantity]", "1");
    body.set("subscription_data[trial_period_days]", String(PERSONAL_INTRO_DAYS));
    body.set("metadata[intro_paid_week]", "1");
    body.set("subscription_data[metadata][intro_paid_week]", "1");
  }
}
