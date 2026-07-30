"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWordbookPath } from "@/lib/wordbook-slug";

type Product = {
  slug: string;
  title: string;
  wordbook_id: string | null;
  entitlement_kind: "wordbook" | "personal";
  description: string;
  cover_image: string | null;
};

export default function AccessPortal() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const supabase = useMemo(() => createClient(), []);
  const [product, setProduct] = useState<Product | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [message, setMessage] = useState("読み込み中です…");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    fetch(`/api/licenses/product?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json().catch(() => ({})) }))
      .then(({ response, result }) => {
        if (!response.ok) {
          setMessage(result.message ?? "この購入者用ページを準備できませんでした。");
          return;
        }
        setProduct(result.product as Product);
        setMessage("");
      })
      .catch(() => setMessage("ネットワークに接続できませんでした。"));
  }, [slug]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function claimLicense() {
    if (!supabase || !product) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("先にログインしてください。");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/licenses/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: product.slug, code }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response?.ok) {
      setMessage(result?.message ?? "ライセンス登録に失敗しました。");
      return;
    }
    setClaimed(true);
    setMessage("登録が完了しました。この単語帳はVocab Print Pro本体でも追加料金なしで利用できます。");
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("ログイン機能の設定が未完了です。");
      return;
    }
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setMessage("メールアドレスまたはパスワードが違います。");
      else setMessage("ログインしました。続けてライセンスキーを登録してください。");
      return;
    }
    const origin = window.location.origin;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(`/access/${slug}`)}` } });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session) setMessage("登録しました。続けてライセンスキーを登録してください。");
    else setMessage("確認メールを送信しました。メール認証後、もう一度この購入者用URLを開いてログインしてください。");
  }

  const mainHref = product?.wordbook_id ? buildWordbookPath(product.wordbook_id, product.title) : "/";
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-black text-blue-700">Vocab Print Pro</Link>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">Note購入者用</span>
        </div>
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="grid md:grid-cols-[180px_1fr]">
            <div className="min-h-40 bg-blue-700">
              {product?.cover_image ? <img src={product.cover_image} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="p-6">
              <p className="text-sm font-bold text-blue-700">購入した単語帳だけを使える専用ポータル</p>
              <h1 className="mt-1 text-2xl font-black">{product?.title ?? "単語帳ライセンス"}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{product?.description || "Noteで購入した方のための単語帳専用ページです。ライセンス登録後は、この単語帳だけをVocab Print Pro本体でも使えます。"}</p>
            </div>
          </div>
        </section>

        {message && <p className={`mt-5 rounded-xl px-4 py-3 text-sm font-bold ${message.includes("失敗") || message.includes("できません") || message.includes("違い") ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-800"}`}>{message}</p>}

        {!signedIn ? (
          <form onSubmit={submitAuth} className="mx-auto mt-6 max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-bold">
              <button type="button" onClick={() => setMode("signup")} className={`flex-1 rounded-lg py-2 ${mode === "signup" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>新規登録</button>
              <button type="button" onClick={() => setMode("login")} className={`flex-1 rounded-lg py-2 ${mode === "login" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>ログイン</button>
            </div>
            <label className="mt-5 block text-sm font-bold">メールアドレス<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
            <label className="mt-4 block text-sm font-bold">パスワード<div className="relative mt-1"><input required minLength={6} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border px-3 py-3 pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-slate-500" aria-label="パスワード表示を切り替える">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
            <button disabled={busy} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? "処理中…" : mode === "signup" ? "メールアドレスで登録する" : "ログインする"}</button>
          </form>
        ) : !claimed ? (
          <section className="mx-auto mt-6 max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">ライセンスキーを登録</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Noteの購入後に受け取ったキーを入力してください。キーは最初に登録したアカウントにだけ紐付きます。</p>
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="例: VPP-ABC123-DEF456-GHI789" className="mt-4 w-full rounded-xl border px-3 py-3 font-mono tracking-wide" />
            <button onClick={claimLicense} disabled={busy || !code.trim()} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? "登録中…" : "この単語帳を登録する"}</button>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <h2 className="text-xl font-black text-emerald-900">この単語帳を利用できるようになりました</h2>
            <p className="mt-2 text-sm text-emerald-800">印刷・聞き流し・単語チェックは、Vocab Print Pro本体の単語帳ページで使えます。</p>
            <Link href={mainHref} className="mt-5 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">この単語帳を開く</Link>
          </section>
        )}

        <aside className="mt-8 rounded-2xl border border-blue-100 bg-white p-5">
          <h2 className="font-black">ほかの単語帳・CSV・印刷設定も使いたい方へ</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Vocab Print Pro本体では、複数の単語帳、Excel/CSVの貼り付け、聞き流し、単語チェックをまとめて利用できます。</p>
          <Link href="/" className="mt-3 inline-block text-sm font-black text-blue-700">Vocab Print Pro本体を見る</Link>
        </aside>
      </div>
    </main>
  );
}
