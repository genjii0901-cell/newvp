"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MyBook = {
  id: string;
  title: string;
  copied?: boolean;
  words: Array<{ no: number; english: string; japanese: string; unit: string | null }>;
};

type Headers = { no: string; english: string; japanese: string; unit: string };

const DEFAULT_HEADERS: Headers = { no: "番号", english: "英語", japanese: "日本語", unit: "区分" };
const HEADER_STORAGE_KEY = "vpp-teacher-csv-headers-v1";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function TeacherCsvTool() {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [adminAccess, setAdminAccess] = useState(false);
  const [books, setBooks] = useState<MyBook[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [headers, setHeaders] = useState<Headers>(DEFAULT_HEADERS);
  const [status, setStatus] = useState<"loading" | "guest" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HEADER_STORAGE_KEY);
      if (saved) setHeaders({ ...DEFAULT_HEADERS, ...(JSON.parse(saved) as Partial<Headers>) });
    } catch {
      // 保存済みの列名が壊れていても、初期値で続ける。
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setStatus("guest");
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      if (!data.session) setStatus("guest");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      if (!session) setStatus("guest");
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, booksRes] = await Promise.all([
          fetch("/api/me/profile", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
          fetch("/api/me/wordbooks", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        ]);
        const profileJson = await profileRes.json().catch(() => ({}));
        const booksJson = await booksRes.json().catch(() => ({}));
        if (cancelled) return;
        setPlan(profileJson?.profile?.plan ?? "free");
        setAdminAccess(profileJson?.profile?.adminAccess === true);
        if (!booksRes.ok || !Array.isArray(booksJson.wordbooks)) {
          setStatus("error");
          setMessage(booksJson.error ?? "マイ単語帳を読み込めませんでした。");
          return;
        }
        // 取り込み（公式・他人の単語帳のコピー）は出力の対象にしない。自作だけを出力できる。
        const own = (booksJson.wordbooks as MyBook[]).filter((book) => book.copied !== true);
        setBooks(own);
        setSelectedId(own[0]?.id ?? "");
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("読み込みに失敗しました。通信を確認して、開き直してください。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function updateHeader(key: keyof Headers, value: string) {
    const next = { ...headers, [key]: value };
    setHeaders(next);
    try {
      window.localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 保存できなくても出力は続けられる。
    }
  }

  const allowed = plan === "teacher" || adminAccess;
  const book = books.find((item) => item.id === selectedId);

  function download() {
    if (!book) return;
    const rows = [
      [headers.no, headers.english, headers.japanese, headers.unit],
      ...book.words.map((word) => [word.no, word.english, word.japanese, word.unit ?? ""]),
    ];
    const csv = `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${book.title}-単語一覧.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border bg-white p-4 sm:rounded-3xl sm:p-8" aria-labelledby="teacher-csv-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="teacher-csv-title" className="text-xl font-black">CSV出力と列名の設定</h2>
        <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-black text-white">Teacher限定</span>
      </div>
      <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
        マイ単語帳で作った自作の単語帳を、CSVで書き出せます。列の見出しは塾の名簿やExcelの形式に合わせて変えられます（この端末に保存されます）。
        公式単語帳や、他の単語帳から取り込んだものは対象外です。
      </p>

      {status === "loading" ? <p className="mt-4 text-sm font-bold text-slate-500">読み込み中...</p> : null}
      {status === "error" ? <p role="alert" className="mt-4 text-sm font-bold text-red-700">{message}</p> : null}

      {status === "guest" || status === "ready" ? (
        <div className="relative mt-5">
          <div className={`grid gap-5 lg:grid-cols-2 ${allowed ? "" : "pointer-events-none select-none opacity-40"}`} aria-hidden={!allowed} inert={!allowed}>
            <div>
              <h3 className="text-sm font-black">列名（見出し）</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {([
                  ["no", "1列目"],
                  ["english", "2列目"],
                  ["japanese", "3列目"],
                  ["unit", "4列目"],
                ] as Array<[keyof Headers, string]>).map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-slate-500">
                    {label}
                    <input
                      value={headers[key]}
                      maxLength={30}
                      onChange={(event) => updateHeader(key, event.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-base font-black text-slate-900 sm:text-sm"
                    />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => { setHeaders(DEFAULT_HEADERS); try { window.localStorage.removeItem(HEADER_STORAGE_KEY); } catch {} }} className="mt-3 py-1 text-xs font-black text-blue-700 underline">初期値に戻す</button>
            </div>
            <div>
              <h3 className="text-sm font-black">出力する単語帳</h3>
              {allowed && books.length === 0 ? (
                <p className="mt-2 text-sm font-bold text-slate-500">自作の単語帳がありません。<Link href="/my-wordbooks" className="text-blue-700 underline">マイ単語帳で作成</Link></p>
              ) : (
                <>
                  <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2 text-base font-black sm:text-sm">
                    {allowed ? books.map((item) => (
                      <option key={item.id} value={item.id}>{item.title}（{item.words.length}語）</option>
                    )) : <option>自作の単語帳（例）</option>}
                  </select>
                  <button type="button" onClick={download} disabled={!allowed || !book || book.words.length === 0} className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                    CSVをダウンロード
                  </button>
                </>
              )}
            </div>
          </div>
          {!allowed ? (
            <div className="absolute inset-0 flex items-center justify-center p-2">
              <div className="w-full max-w-sm rounded-2xl border border-blue-200 bg-white/95 p-4 text-center shadow-lg">
                <p className="text-sm font-black text-slate-900">🔒 Teacherプランで開放されます</p>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
                  {status === "guest" ? "ログインして、Teacherプランに申し込むと使えます。" : plan === "personal" ? "いまはPersonalプランです。Teacherに切り替えると使えます。" : "無料会員のままでは使えません。Teacherに申し込むと使えます。"}
                </p>
                <Link href="/pricing" className="mt-3 inline-block rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white">Teacherの料金を見る</Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
