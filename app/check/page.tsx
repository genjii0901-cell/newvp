import Link from "next/link";

function isLiveStripeKey(value: string | undefined) {
  return Boolean(value && value.startsWith("sk_live_"));
}

function isPriceId(value: string | undefined) {
  return Boolean(value && value.startsWith("price_"));
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePersonalPrice =
  process.env.STRIPE_PRICE_PERSONAL ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const adminPassword = process.env.ADMIN_PASSWORD;

const stripeLiveMode = isLiveStripeKey(stripeSecretKey);
const productionHostReady = /(^https:\/\/)(www\.)?vocabprint\.com/i.test(appUrl);
const productionReady = Boolean(
  productionHostReady &&
    stripeLiveMode &&
    isPriceId(stripePersonalPrice) &&
    stripeWebhookSecret &&
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseServiceRole &&
    adminPassword,
);

const checks = [
  { label: "App URL", value: Boolean(appUrl), env: "NEXT_PUBLIC_APP_URL" },
  { label: "Production Host", value: productionHostReady, env: "https://www.vocabprint.com" },
  { label: "Stripe Live Mode", value: stripeLiveMode, env: "STRIPE_SECRET_KEY must start with sk_live_" },
  { label: "Stripe Personal Price", value: isPriceId(stripePersonalPrice), env: "STRIPE_PRICE_PERSONAL / NEXT_PUBLIC_STRIPE_PRICE_PERSONAL" },
  { label: "Stripe Webhook Secret", value: Boolean(stripeWebhookSecret), env: "STRIPE_WEBHOOK_SECRET" },
  { label: "Supabase URL", value: Boolean(supabaseUrl), env: "NEXT_PUBLIC_SUPABASE_URL" },
  { label: "Supabase Anon Key", value: Boolean(supabaseAnonKey), env: "NEXT_PUBLIC_SUPABASE_ANON_KEY" },
  { label: "Supabase Service Role", value: Boolean(supabaseServiceRole), env: "SUPABASE_SERVICE_ROLE_KEY" },
  { label: "Admin Password", value: Boolean(adminPassword), env: "ADMIN_PASSWORD" },
];

export default function CheckPage() {
  const readyCount = checks.filter((item) => item.value).length;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
            <h1 className="mt-1 text-3xl font-black">本番設定チェック</h1>
            <p className="mt-2 text-sm text-slate-500">
              公開サイトが本番用の Stripe / Supabase 設定で動けるかを、この画面で確認できます。
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              トップ
            </Link>
            <Link href="/pricing" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              料金
            </Link>
            <Link href="/account" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
              アカウント
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div
            className={`rounded-2xl p-4 text-sm font-bold ${
              productionReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            {productionReady
              ? "本番公開の必須設定はそろっています。公開用 Stripe live mode 前提です。"
              : "まだ本番公開の必須設定が不足しています。未設定の項目を確認してください。"}
          </div>

          <p className="mt-4 text-sm font-bold text-slate-600">
            {readyCount}/{checks.length} 項目が設定済みです
          </p>
          <p className="mt-2 text-sm text-slate-500">
            ここは値そのものではなく、設定の有無と本番向け形式だけを確認します。秘密キーの内容は表示しません。
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {checks.map((item) => (
              <div key={item.label} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{item.label}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{item.env}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      item.value ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.value ? "設定済み" : "未設定"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
