"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Book = { id: string; title: string; coverImage?: string | null };
type Product = { slug: string; title: string; wordbook_id: string | null; entitlement_kind: "wordbook" | "personal"; description: string; cover_image: string | null; is_active: boolean };
type Code = { id: string; product_slug: string; is_active: boolean; claimed_by: string | null; claimed_at: string | null; expires_at: string | null; created_at: string };

export default function LicenseAdminPanel({ books }: { books: Book[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [message, setMessage] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", wordbookId: "", kind: "wordbook" as "wordbook" | "personal", description: "", coverImage: "", isActive: true });
  const [codeProductSlug, setCodeProductSlug] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  async function headers(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/licenses", { headers: await headers(), cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setLoading(false);
    if (!response?.ok) { setMessage(result?.message ?? "ライセンス情報を取得できませんでした。"); return; }
    setProducts(result.products ?? []);
    setCodes(result.codes ?? []);
    if (!codeProductSlug && result.products?.[0]?.slug) setCodeProductSlug(result.products[0].slug);
  }

  useEffect(() => { void load(); }, []);

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    setIssuedCode(""); setMessage(""); setLoading(true);
    const response = await fetch("/api/admin/licenses", { method: "POST", headers: { "Content-Type": "application/json", ...(await headers()) }, body: JSON.stringify({ action: "save-product", ...form }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setLoading(false);
    if (!response?.ok) { setMessage(result?.message ?? "保存できませんでした。"); return; }
    setMessage(result.message ?? "保存しました。");
    setCodeProductSlug(form.slug);
    void load();
  }

  async function issueCode() {
    setIssuedCode(""); setMessage(""); setLoading(true);
    const response = await fetch("/api/admin/licenses", { method: "POST", headers: { "Content-Type": "application/json", ...(await headers()) }, body: JSON.stringify({ action: "generate-code", productSlug: codeProductSlug, expiresAt: expiresAt || null }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setLoading(false);
    if (!response?.ok) { setMessage(result?.message ?? "コードを発行できませんでした。"); return; }
    setIssuedCode(result.code ?? "");
    setMessage(result.message ?? "コードを発行しました。");
    void load();
  }

  async function revokeCode(id: string) {
    if (!window.confirm("このライセンスキーを無効化しますか？すでに付与済みの利用権は別途確認が必要です。")) return;
    const response = await fetch("/api/admin/licenses", { method: "POST", headers: { "Content-Type": "application/json", ...(await headers()) }, body: JSON.stringify({ action: "revoke-code", id }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setMessage(result?.message ?? "処理しました。");
    if (response?.ok) void load();
  }

  return <section className="mt-6 space-y-6">
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
      <h2 className="text-xl font-black text-slate-900">Note購入者向けライセンス</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">商品ごとに専用URLとライセンスキーを発行します。キーの原文は発行直後に一度だけ表示され、DBには保存されません。</p>
    </div>
    {message && <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={saveProduct} className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="font-black">ライセンス商品を作成・更新</h3>
        <p className="mt-1 text-xs text-slate-500">単語帳専用なら、実際の単語帳IDを選びます。Personalは全単語帳を使えるNote特典用です。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">URL用ID<input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="system-eitango" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="text-xs font-bold">表示名<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="システム英単語" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        </div>
        <label className="mt-3 block text-xs font-bold">付与する内容<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "wordbook" | "personal" })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="wordbook">この単語帳だけ無料</option><option value="personal">本体Personal相当（全単語帳）</option></select></label>
        {form.kind === "wordbook" && <label className="mt-3 block text-xs font-bold">対象の単語帳<select required value={form.wordbookId} onChange={(e) => { const book = books.find((item) => item.id === e.target.value); setForm({ ...form, wordbookId: e.target.value, coverImage: form.coverImage || book?.coverImage || "" }); }} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">選択してください</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}（ID: {book.id}）</option>)}</select></label>}
        <label className="mt-3 block text-xs font-bold">説明<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="mt-3 block text-xs font-bold">カバー画像URL（任意）<input value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />購入者用URLを有効にする</label>
        <button disabled={loading} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">商品を保存</button>
      </form>
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="font-black">ライセンスキーを発行</h3>
        <label className="mt-4 block text-xs font-bold">商品<select value={codeProductSlug} onChange={(e) => setCodeProductSlug(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">選択してください</option>{products.filter((product) => product.is_active).map((product) => <option key={product.slug} value={product.slug}>{product.title}（{product.entitlement_kind === "personal" ? "Personal" : "単語帳限定"}）</option>)}</select></label>
        <label className="mt-3 block text-xs font-bold">キーの有効期限（任意）<input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <button onClick={issueCode} disabled={loading || !codeProductSlug} className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">ライセンスキーを発行</button>
        {issuedCode && <div className="mt-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">このコードは今だけ表示されます。Note購入者への案内に使ってください。</p><code className="mt-2 block select-all break-all text-lg font-black text-slate-900">{issuedCode}</code></div>}
        <p className="mt-5 text-xs leading-5 text-slate-500">購入者用URL: <code>{typeof window === "undefined" ? "/access/商品ID" : `${window.location.origin}/access/商品ID`}</code></p>
      </div>
    </div>
    <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-black">最近発行したキー</h3><button onClick={() => void load()} className="text-sm font-bold text-blue-700">更新</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="pb-2">商品</th><th>状態</th><th>登録</th><th>有効期限</th><th></th></tr></thead><tbody>{codes.map((code) => <tr key={code.id} className="border-t"><td className="py-3 font-bold">{code.product_slug}</td><td>{code.is_active ? "有効" : "無効"}</td><td>{code.claimed_by ? "登録済み" : "未登録"}</td><td>{code.expires_at ? new Date(code.expires_at).toLocaleString("ja-JP") : "なし"}</td><td>{code.is_active && <button onClick={() => void revokeCode(code.id)} className="text-xs font-bold text-rose-600">無効化</button>}</td></tr>)}{codes.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">まだキーはありません。</td></tr>}</tbody></table></div></div>
  </section>;
}
