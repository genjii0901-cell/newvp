import Link from "next/link";

const checks = [
  { label: "Supabase URL", value: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), env: "NEXT_PUBLIC_SUPABASE_URL" },
  {
    label: "Supabase Anon Key",
    value: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    env: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  },
  {
    label: "Supabase Service Role",
    value: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    env: "SUPABASE_SERVICE_ROLE_KEY",
  },
  { label: "Stripe Secret Key", value: Boolean(process.env.STRIPE_SECRET_KEY), env: "STRIPE_SECRET_KEY" },
  {
    label: "Stripe Personal Price",
    value: Boolean(process.env.STRIPE_PRICE_PERSONAL ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL),
    env: "STRIPE_PRICE_PERSONAL / NEXT_PUBLIC_STRIPE_PRICE_PERSONAL",
  },
  {
    label: "Stripe Teacher Price",
    value: Boolean(process.env.STRIPE_PRICE_TEACHER ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER),
    env: "STRIPE_PRICE_TEACHER / NEXT_PUBLIC_STRIPE_PRICE_TEACHER",
  },
  { label: "Stripe Webhook Secret", value: Boolean(process.env.STRIPE_WEBHOOK_SECRET), env: "STRIPE_WEBHOOK_SECRET" },
  { label: "Admin Password", value: Boolean(process.env.ADMIN_PASSWORD), env: "ADMIN_PASSWORD" },
];

export default function CheckPage() {
  const readyCount = checks.filter((item) => item.value).length;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
            <h1 className="mt-1 text-3xl font-black">設定チェック</h1>
            <p className="mt-2 text-sm text-slate-500">
              秘密キーの中身は表示せず、設定されているかだけ確認します。
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              トップ
            </Link>
            <Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              管理者
            </Link>
            <Link href="/pricing" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
              料金
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-600">
            {readyCount}/{checks.length} 項目が設定済みです。
          </p>
          <p className="mt-2 text-sm text-slate-500">
            「Supabase server environment variables are not configured.」が出る場合は、
            主に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が未設定です。
            Service Role Key は秘密キーなので、チャットには貼らず Vercel の Environment Variables か
            ローカルの .env.local に入れてください。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {checks.map((item) => (
              <div key={item.env} className="rounded-2xl border p-4">
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
