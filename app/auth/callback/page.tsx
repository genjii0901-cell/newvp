import Link from "next/link";

type AuthCallbackPageProps = {
  searchParams?: Promise<{
    message?: string;
    next?: string;
    status?: string;
  }>;
};

function normalizeNextPath(value?: string) {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const params = (await searchParams) ?? {};
  const next = normalizeNextPath(params.next);
  const status = params.status === "success" ? "success" : "error";
  const message =
    params.message ||
    "メール認証を完了できませんでした。もう一度メール内のリンクを開くか、トップページから再度お試しください。";
  const loginHref = next === "/" ? "/#auth" : `${next}#auth`;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
        <h1 className="mt-2 text-2xl font-black">メール確認</h1>
        <p
          className={`mt-4 rounded-2xl p-4 text-sm font-bold ${
            status === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
          <Link href={loginHref} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
            ログイン画面へ
          </Link>
        </div>
      </div>
    </main>
  );
}
