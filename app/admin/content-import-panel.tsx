"use client";

import { useEffect, useState } from "react";

type Headers = () => Promise<Record<string, string>>;
type BookOption = { id: string; title: string };
type Result = {
  ok: boolean;
  message?: string;
  errors?: string[];
  warnings?: string[];
  exampleCount?: number;
  wordCount?: number;
  itemCount?: number;
  unmatched?: string[];
  unmatchedCount?: number;
  saved?: number;
  sample?: Array<Record<string, unknown>>;
};

const EXAMPLE_TEMPLATE = "番号\t英語\t例文1\t訳1\t例文2\t訳2\n1\tapple\tI eat an apple.\t私はりんごを食べる。\tApples are red.\tりんごは赤い。\n2\tbook\tShe reads a book.\t彼女は本を読む。\t\t";
const QUESTION_TEMPLATE = "種類\t問題\t答え\t誤答1\t誤答2\t誤答3\t選択肢方式\tタグ\t解説\n4択\tHe ( ) tennis every day.\tplays\tplay\tplaying\tplayed\t固定\t三単現\t主語が三人称単数なので s が付く\n穴埋め\tShe ___ a book now.\tis reading\t\t\t\tタグ\t進行形\t\n下線\tHe <u>go</u> to school.\tgoes\t\t\t\tランダム\t\t三単現の s\n一問一答\t現在完了で使う助動詞は？\thave / has\t\t\t\t\t\t";

async function fileToText(file: File): Promise<string> {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet);
  }
  return file.text();
}

function ResultBox({ result }: { result: Result }) {
  return (
    <div className={`mt-3 rounded-xl border p-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
      {result.message ? <p className="font-bold">{result.message}</p> : null}
      {result.ok ? (
        <p className="font-black">
          {result.saved !== undefined ? `保存しました（下書き）: ${result.saved}件` : "確認結果（まだ保存していません）"}
          {result.exampleCount !== undefined ? ` ／ 例文 ${result.exampleCount}件・単語 ${result.wordCount}語` : ""}
          {result.itemCount !== undefined ? ` ／ 問題 ${result.itemCount}問` : ""}
        </p>
      ) : null}
      {result.unmatchedCount ? (
        <p className="mt-1 text-amber-800">単語帳に見つからない番号・英語が {result.unmatchedCount}件: {result.unmatched?.join("、")}{result.unmatchedCount > (result.unmatched?.length ?? 0) ? " …" : ""}（保存はできますが、ずれていないか確認してください）</p>
      ) : null}
      {[...(result.errors ?? []), ...(result.warnings ?? [])].slice(0, 12).map((w, i) => (
        <p key={i} className="mt-1 text-amber-800">⚠ {w}</p>
      ))}
      {result.sample?.length ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white/70 p-2 text-[11px] leading-snug">{JSON.stringify(result.sample, null, 1)}</pre>
      ) : null}
    </div>
  );
}

function Importer({
  title, help, template, templateName, children, onRun, busy, text, setText,
}: {
  title: string; help: string; template: string; templateName: string; children?: React.ReactNode;
  onRun: (mode: "preview" | "save") => void; busy: boolean; text: string; setText: (v: string) => void;
}) {
  function download() {
    const blob = new Blob(["\uFEFF" + template.replace(/\t/g, ",").split("\n").map((l) => l).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-1 whitespace-pre-line text-xs font-bold leading-relaxed text-slate-500">{help}</p>
      <div className="mt-3 space-y-3">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
        <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50">
          📄 Excel / CSV ファイルを選ぶ
          <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await fileToText(f)); e.target.value = ""; }} />
        </label>
        <button type="button" onClick={() => setText(template)} className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50">見本を入れる</button>
        <button type="button" onClick={download} className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50">見本のCSVを保存</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Excelの表をコピーして、ここに貼り付けます（1行目は見出し）"
        className="mt-3 h-44 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy || !text.trim()} onClick={() => onRun("preview")} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-black text-white disabled:opacity-40">① 確認する</button>
        <button type="button" disabled={busy || !text.trim()} onClick={() => onRun("save")} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">② 下書きとして保存</button>
      </div>
    </section>
  );
}

export default function ContentImportPanel({ getHeaders }: { getHeaders: Headers }) {
  const [books, setBooks] = useState<BookOption[]>([]);
  const [bookId, setBookId] = useState("");
  const [replace, setReplace] = useState(false);
  const [exText, setExText] = useState("");
  const [exBusy, setExBusy] = useState(false);
  const [exResult, setExResult] = useState<Result | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const [qText, setQText] = useState("");
  const [qBusy, setQBusy] = useState(false);
  const [qResult, setQResult] = useState<Result | null>(null);
  const [sets, setSets] = useState<Array<{ id: string; title: string; kind: string; itemCount: number }>>([]);
  const [setId, setSetId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [kind, setKind] = useState("grammar");

  async function call(url: string, init?: RequestInit) {
    const headers = await getHeaders();
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store" });
    return (await res.json().catch(() => ({ ok: false, message: "応答を読み取れませんでした。" }))) as Result & { wordbooks?: Array<{ id: string | number; title: string }>; sets?: typeof sets; count?: number };
  }

  useEffect(() => {
    call("/api/admin/all-wordbooks").then((d) => setBooks((d.wordbooks ?? []).map((b) => ({ id: String(b.id), title: b.title }))));
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSets() {
    const d = await call("/api/admin/question-sets");
    if (d.ok && d.sets) setSets(d.sets);
  }

  useEffect(() => {
    setSavedCount(null);
    if (!bookId) return;
    call(`/api/admin/examples?wordbookId=${encodeURIComponent(bookId)}`).then((d) => setSavedCount(d.ok ? d.count ?? 0 : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, exResult?.saved]);

  async function runExamples(mode: "preview" | "save") {
    if (!bookId) { setExResult({ ok: false, message: "先に単語帳を選んでください。" }); return; }
    if (mode === "save" && replace && !window.confirm("この単語帳の「取り込み済みの例文」を全部消して、貼り付けた内容に入れ替えます。よろしいですか？")) return;
    setExBusy(true);
    try { setExResult(await call("/api/admin/examples", { method: "POST", body: JSON.stringify({ wordbookId: bookId, text: exText, mode, replace }) })); }
    finally { setExBusy(false); }
  }

  async function runQuestions(mode: "preview" | "save") {
    if (mode === "save" && !setId && !newTitle.trim()) { setQResult({ ok: false, message: "追加先の問題セットを選ぶか、新しい名前を入れてください。" }); return; }
    setQBusy(true);
    try {
      const d = await call("/api/admin/question-sets", { method: "POST", body: JSON.stringify({ text: qText, mode, setId, title: newTitle, kind }) });
      setQResult(d);
      if (mode === "save" && d.ok) { setNewTitle(""); await loadSets(); }
    } finally { setQBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">
        例文・問題の保存先は、Supabaseで docs/migrations/add-examples-and-question-sets.sql を1回実行すると使えます。保存したものは「下書き」で、画面にはまだ出ません。
      </div>

      <Importer
        title="📝 例文を取り込む（1単語に何個でも）"
        help={"1行目は見出し。「番号」か「英語」、「例文」、「訳」の列を使います。\n・縦並び: 同じ番号の行を繰り返すと、その単語に例文が増えます。\n・横並び: 「例文1 / 訳1 / 例文2 / 訳2…」と列を増やします。\n・1つのセルに複数: セル内で改行して並べ、訳も同じ順番にします。"}
        template={EXAMPLE_TEMPLATE}
        templateName="例文取り込み_見本.csv"
        text={exText}
        setText={setExText}
        busy={exBusy}
        onRun={runExamples}
      >
        <label className="block text-xs font-black text-slate-600">
          どの単語帳の例文か
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold">
            <option value="">選んでください</option>
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>
        {savedCount !== null ? <p className="text-xs font-bold text-slate-500">この単語帳に保存済みの例文: {savedCount}件</p> : null}
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          保存するとき、取り込み済みの例文を先に消して入れ替える
        </label>
      </Importer>
      {exResult ? <ResultBox result={exResult} /> : null}

      <Importer
        title="🧩 文法・一問一答・4択の問題を取り込む"
        help={"必須は「問題」と「答え」。種類は 穴埋め（問題文に（　）か ___）／下線（<u>下線にする語</u>）／4択／一問一答。\n選択肢: 「誤答1〜3」の列、または「選択肢」列に / か改行で並べます。\n選択肢方式: 固定＝書いた誤答だけ／タグ＝同じタグの他の問題の答えから自動／ランダム＝全体から自動。省略すると自動で決まります。"}
        template={QUESTION_TEMPLATE}
        templateName="問題取り込み_見本.csv"
        text={qText}
        setText={setQText}
        busy={qBusy}
        onRun={runQuestions}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-black text-slate-600">
            追加先の問題セット
            <select value={setId} onChange={(e) => setSetId(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold">
              <option value="">（新しく作る）</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.title}（{s.itemCount}問）</option>)}
            </select>
          </label>
          {!setId ? (
            <label className="block text-xs font-black text-slate-600">
              新しいセットの名前と種類
              <span className="mt-1 flex gap-2">
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例: 英文法 基本50問" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm font-bold" />
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold">
                  <option value="grammar">文法</option>
                  <option value="qa">一問一答</option>
                  <option value="other">その他</option>
                </select>
              </span>
            </label>
          ) : null}
        </div>
      </Importer>
      {qResult ? <ResultBox result={qResult} /> : null}
    </div>
  );
}
