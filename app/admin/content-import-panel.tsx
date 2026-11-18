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
  const [sets, setSets] = useState<Array<{ id: string; title: string; kind: string; subject?: string; itemCount: number }>>([]);
  const [setId, setSetId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [kind, setKind] = useState("grammar");
  const [subject, setSubject] = useState("");
  const [aiFrom, setAiFrom] = useState(1);
  const [aiCount, setAiCount] = useState(50);
  const [aiPerWord, setAiPerWord] = useState(2);
  const [aiMessage, setAiMessage] = useState("");
  const [qTopic, setQTopic] = useState("");

  async function copyText(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setAiMessage(done); }
    catch { window.prompt("コピーできませんでした。下の文を手でコピーしてください。", text); }
  }

  async function copyExamplePrompt() {
    if (!bookId) { setAiMessage("先に単語帳を選んでください。"); return; }
    const d = (await call(`/api/admin/all-wordbooks?id=${encodeURIComponent(bookId)}&includeWords=1`)) as unknown as { wordbooks?: Array<{ words: Array<{ no: number; english: string; japanese: string }> }> };
    const words = d.wordbooks?.[0]?.words ?? [];
    const part = words.slice(aiFrom - 1, aiFrom - 1 + aiCount);
    if (part.length === 0) { setAiMessage("その範囲に単語がありません。"); return; }
    const list = part.map((w) => [w.no, w.english, w.japanese].join("\t")).join("\n");
    const prompt = [
      `次の英単語それぞれに、自然で短い英語の例文を${aiPerWord}個ずつ作り、日本語訳を付けてください。`,
      "条件:",
      "- 例文はオリジナル（市販の本や辞書からの引用は禁止）。その単語の意味・用法が分かる文にする。",
      "- 難易度は単語帳の水準に合わせ、例文の中の他の単語は易しくする。",
      "- 単語の形が変わってもよいが、元の単語が分かること。",
      "- 出力は、タブ区切りの表だけ（説明文・コードブロック記号は不要）。1行目は見出し行: 番号<TAB>英語<TAB>例文<TAB>訳（<TAB>はタブ文字）",
      `- 同じ単語の例文は、同じ番号の行を繰り返す（例文が${aiPerWord}個なら${aiPerWord}行）。`,
      "",
      "単語（番号 / 英語 / 日本語）:",
      list,
    ].join("\n");
    await copyText(prompt, `${part.length}語分の依頼文をコピーしました。ChatGPT や Claude に貼り付け、返ってきた表を下の枠に貼ってください。`);
  }

  async function copyQuestionPrompt() {
    const prompt = [
      "次のテーマで、問題集の問題を作ってください。",
      `テーマ: ${qTopic || "（ここにテーマを書く 例: 高校英文法 時制 / 数学I 2次関数）"}`,
      "条件:",
      "- すべてオリジナルの問題にする（市販の問題集・過去問の文章の引用は禁止）。",
      "- 出力は、タブ区切りの表だけ（説明文・コードブロック記号は不要）。1行目は次の見出し行（<TAB>はタブ文字）:",
      "種類<TAB>問題<TAB>答え<TAB>誤答1<TAB>誤答2<TAB>誤答3<TAB>選択肢方式<TAB>タグ<TAB>解説",
      "- 種類は 4択／穴埋め／下線／一問一答 のどれか。",
      "- 穴埋めの問題文には（　）か ___ を入れる。下線の問題文は <u>下線にする語</u> の形で書く。",
      "- 4択は、誤答を3個書き、選択肢方式は「固定」にする。誤答は、まぎらわしいが明確に誤りのものにする。",
      "- タグには、同じ文法項目・単元を表す短い言葉を書く。",
      "- 解説は、なぜその答えになるのかを1〜2文で書く。",
      "- 問題数: 20問",
    ].join("\n");
    await copyText(prompt, "依頼文をコピーしました。AIに貼り付け、返ってきた表を下の枠に貼ってください。");
  }
  const [backupBusy, setBackupBusy] = useState(false);

  async function downloadBackup() {
    setBackupBusy(true);
    try {
      const res = await fetch("/api/admin/content-backup", { headers: await getHeaders(), cache: "no-store" });
      if (!res.ok) { window.alert((await res.json().catch(() => ({ message: "失敗しました。" }))).message); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `content-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setBackupBusy(false); }
  }

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
      const d = await call("/api/admin/question-sets", { method: "POST", body: JSON.stringify({ text: qText, mode, setId, title: newTitle, kind, subject }) });
      setQResult(d);
      if (mode === "save" && d.ok) { setNewTitle(""); await loadSets(); }
    } finally { setQBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">
        例文・問題の保存先は、Supabaseで docs/migrations/add-examples-and-question-sets.sql を1回実行すると使えます。保存したものは「下書き」で、画面にはまだ出ません。
        <button type="button" disabled={backupBusy} onClick={downloadBackup} className="ml-2 rounded-lg border border-amber-400 bg-white px-3 py-1 font-black text-amber-900 disabled:opacity-40">💾 バックアップを自分のPCに保存</button>
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
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-bold text-violet-900">
          <p className="font-black">🤖 AIに例文を作ってもらう（APIなし・月額プランのチャットでOK）</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label>番号 <input type="number" min={1} value={aiFrom} onChange={(e) => setAiFrom(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-16 rounded border border-violet-300 px-1" /> から</label>
            <label><input type="number" min={1} max={100} value={aiCount} onChange={(e) => setAiCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="h-8 w-14 rounded border border-violet-300 px-1" /> 語ぶん</label>
            <label>1語に <input type="number" min={1} max={5} value={aiPerWord} onChange={(e) => setAiPerWord(Math.min(5, Math.max(1, Number(e.target.value) || 1)))} className="h-8 w-12 rounded border border-violet-300 px-1" /> 個</label>
            <button type="button" onClick={copyExamplePrompt} className="rounded-lg bg-violet-700 px-3 py-2 font-black text-white">依頼文をコピー</button>
          </div>
          <p className="mt-2 font-bold text-violet-800">コピーした文をAIに貼る → 返ってきた表を下の枠に貼る → ①確認する → ②保存。一度に50語くらいずつが安定します。</p>
          {aiMessage ? <p className="mt-1 font-black">{aiMessage}</p> : null}
        </div>
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
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-bold text-violet-900">
          <p className="font-black">🤖 AIに問題を作ってもらう（APIなし）</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={qTopic} onChange={(e) => setQTopic(e.target.value)} placeholder="テーマ 例: 高校英文法 時制" className="h-8 min-w-0 flex-1 rounded border border-violet-300 px-2" />
            <button type="button" onClick={copyQuestionPrompt} className="rounded-lg bg-violet-700 px-3 py-2 font-black text-white">依頼文をコピー</button>
          </div>
          <p className="mt-1 font-bold text-violet-800">AIが作った問題は、内容に誤りがないか確認してから保存してください。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-black text-slate-600">
            追加先の問題セット
            <select value={setId} onChange={(e) => setSetId(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold">
              <option value="">（新しく作る）</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.subject ? `[${s.subject}] ` : ""}{s.title}（{s.itemCount}問）</option>)}
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
                  <option value="other">その他（解説つき問題など）</option>
                </select>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="教科 例: 数学" className="h-10 w-24 rounded-lg border border-slate-300 px-2 text-sm font-bold" />
              </span>
            </label>
          ) : null}
        </div>
      </Importer>
      {qResult ? <ResultBox result={qResult} /> : null}
    </div>
  );
}
