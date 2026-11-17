// Excel / CSV から貼り付けた表を、例文や問題のデータに変換する（画面・APIの両方で使う純粋な処理）。

export type Table = { header: string[]; rows: string[][] };

/** Excelからコピーした表（タブ区切り）やCSVを読む。"" で囲まれた中の改行・区切りも正しく扱う。 */
export function parseDelimited(input: string): Table {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = text.split("\n", 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); records.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); records.push(row); }
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map((h) => h.trim()), rows };
}

const norm = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s_\-・/／]/g, "");

// ───────────── 例文 ─────────────

export type ExampleRow = { number: string; english: string; sentenceEn: string; sentenceJa: string };
export type ExampleParse = { examples: ExampleRow[]; errors: string[]; wordCount: number };

type ExampleColumn = { kind: "number" | "word" | "en" | "ja"; index: number };

function classifyExampleColumn(raw: string): ExampleColumn | null {
  const h = norm(raw);
  if (!h) return null;
  const digits = h.match(/(\d+)$/);
  const index = digits ? Math.max(1, Number(digits[1])) : 1;
  if (/^(番号|no|number|#|id)$/.test(h)) return { kind: "number", index: 1 };
  if (/(訳|japanese|ja$|ja\d)/.test(h)) return { kind: "ja", index };
  if (/(例文|英文|example|sentence|ex\d*$)/.test(h)) return { kind: "en", index };
  if (/^(英語|単語|見出し|見出語|english|word)$/.test(h)) return { kind: "word", index: 1 };
  return null;
}

/**
 * 1行目は見出し。「番号」「英語（単語）」「例文」「訳」の列を見つける。
 * - 縦並び: 同じ番号の行を繰り返せば、1単語に何個でも付けられる。
 * - 横並び: 「例文1・訳1・例文2・訳2…」のように列を増やす。
 * - 1つのセルに複数: セル内改行で区切る。例文と訳は同じ順番で対応させる。
 */
export function parseExamples(input: string): ExampleParse {
  const { header, rows } = parseDelimited(input);
  const errors: string[] = [];
  const columns = header.map(classifyExampleColumn);
  const numberCol = columns.findIndex((c) => c?.kind === "number");
  const wordCol = columns.findIndex((c) => c?.kind === "word");
  const enCols = columns.map((c, i) => (c?.kind === "en" ? { i, index: c.index } : null)).filter((x): x is { i: number; index: number } => x !== null);
  const jaByIndex = new Map<number, number>();
  columns.forEach((c, i) => { if (c?.kind === "ja" && !jaByIndex.has(c.index)) jaByIndex.set(c.index, i); });
  if (numberCol < 0 && wordCol < 0) errors.push("見出しに「番号」か「英語」の列が必要です。");
  if (enCols.length === 0) errors.push("見出しに「例文」の列が必要です。");
  if (errors.length > 0) return { examples: [], errors, wordCount: 0 };

  const examples: ExampleRow[] = [];
  const seen = new Set<string>();
  const words = new Set<string>();
  rows.forEach((row, rowIndex) => {
    const number = (numberCol >= 0 ? row[numberCol] ?? "" : "").trim();
    const english = (wordCol >= 0 ? row[wordCol] ?? "" : "").trim();
    if (!number && !english) {
      if (enCols.some(({ i }) => (row[i] ?? "").trim())) errors.push(`${rowIndex + 2}行目: 番号も英語もないため飛ばしました。`);
      return;
    }
    for (const { i, index } of enCols) {
      const enLines = (row[i] ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (enLines.length === 0) continue;
      const jaCol = jaByIndex.get(index);
      const jaCell = jaCol !== undefined ? row[jaCol] ?? "" : "";
      const jaLines = jaCell.split("\n").map((s) => s.trim());
      if (jaLines.filter(Boolean).length > 0 && jaLines.filter(Boolean).length !== enLines.length) {
        errors.push(`${rowIndex + 2}行目: 例文${index}の数(${enLines.length})と訳の数(${jaLines.filter(Boolean).length})が違います。訳は空にして保存します。`);
      }
      enLines.forEach((sentenceEn, lineIndex) => {
        const aligned = jaLines.filter(Boolean).length === enLines.length;
        const sentenceJa = aligned ? jaLines.filter(Boolean)[lineIndex] : "";
        const key = `${number}\u0000${english}\u0000${sentenceEn}`;
        if (seen.has(key)) return;
        seen.add(key);
        words.add(`${number}\u0000${english}`);
        examples.push({ number, english, sentenceEn, sentenceJa });
      });
    }
  });
  return { examples, errors, wordCount: words.size };
}

// ───────────── 問題（文法・一問一答・4択） ─────────────

export type ItemKind = "blank" | "underline" | "choice" | "qa";
export type ChoiceMode = "fixed" | "pool" | "random";
export type QuestionRow = {
  itemKind: ItemKind;
  prompt: string;
  answer: string;
  wrongChoices: string[];
  choiceMode: ChoiceMode;
  poolTag: string;
  explanation: string;
  unit: string;
};
export type QuestionParse = { items: QuestionRow[]; errors: string[] };

function questionField(raw: string): string | null {
  const h = norm(raw);
  if (/^(種類|形式|kind|type)$/.test(h)) return "kind";
  if (/^(問題|問題文|設問|question|prompt)$/.test(h)) return "prompt";
  if (/^(答え|答|正解|answer)$/.test(h)) return "answer";
  if (/^(誤答|誤り|不正解|wrong|distractor)\d*$/.test(h)) return "wrong";
  if (/^(選択肢|choices?)$/.test(h)) return "choices";
  if (/^(選択肢方式|選択肢の作り方|方式|mode)$/.test(h)) return "mode";
  if (/^(タグ|分類|グループ|pool|tag)$/.test(h)) return "tag";
  if (/^(解説|explanation)$/.test(h)) return "explanation";
  if (/^(単元|章|unit)$/.test(h)) return "unit";
  return null;
}

function parseKind(value: string): ItemKind | null {
  const v = norm(value);
  if (!v) return "choice";
  if (/(穴埋め|括弧|かっこ|blank)/.test(v)) return "blank";
  if (/(下線|underline)/.test(v)) return "underline";
  if (/(一問一答|記述|qa)/.test(v)) return "qa";
  if (/(4択|四択|選択|choice)/.test(v)) return "choice";
  return null;
}

function parseMode(value: string): ChoiceMode | null {
  const v = norm(value);
  if (!v) return null;
  if (/(固定|fixed)/.test(v)) return "fixed";
  if (/(タグ|同じ|pool)/.test(v)) return "pool";
  if (/(ランダム|random)/.test(v)) return "random";
  return null;
}

/**
 * 問題の表を読む。必須は「問題」「答え」。
 * 4択の選択肢は、(1)誤答1〜誤答N の列、(2)「選択肢」列に / か改行で並べる、のどちらでも書ける。
 * 選択肢方式: 固定=保存した誤答だけを使う／タグ=同じタグの他の問題の答えから選ぶ／ランダム=全体から選ぶ。
 * 方式を書かなければ、誤答が3つ以上あれば固定、タグがあればタグ、どちらもなければランダムにする。
 */
export function parseQuestions(input: string): QuestionParse {
  const { header, rows } = parseDelimited(input);
  const errors: string[] = [];
  const fields = header.map(questionField);
  const col = (name: string) => fields.indexOf(name);
  if (col("prompt") < 0) errors.push("見出しに「問題」の列が必要です。");
  if (col("answer") < 0) errors.push("見出しに「答え」の列が必要です。");
  if (errors.length > 0) return { items: [], errors };
  const wrongCols = fields.map((f, i) => (f === "wrong" ? i : -1)).filter((i) => i >= 0);

  const items: QuestionRow[] = [];
  rows.forEach((row, rowIndex) => {
    const get = (name: string) => (col(name) >= 0 ? (row[col(name)] ?? "").trim() : "");
    const prompt = get("prompt");
    const answer = get("answer");
    const line = rowIndex + 2;
    if (!prompt && !answer) return;
    if (!prompt || !answer) { errors.push(`${line}行目: 問題か答えが空のため飛ばしました。`); return; }
    const itemKind = parseKind(get("kind"));
    if (!itemKind) { errors.push(`${line}行目: 種類「${get("kind")}」が分かりません（穴埋め／下線／4択／一問一答）。`); return; }
    const wrong = wrongCols.map((i) => (row[i] ?? "").trim()).filter(Boolean);
    for (const part of get("choices").split(/\n|\/|／|\|/)) {
      const t = part.trim();
      if (t) wrong.push(t);
    }
    const wrongChoices = [...new Set(wrong.filter((w) => w !== answer))];
    const poolTag = get("tag");
    const modeText = get("mode");
    let choiceMode = parseMode(modeText);
    if (modeText && !choiceMode) errors.push(`${line}行目: 選択肢方式「${modeText}」が分かりません（固定／タグ／ランダム）。自動で決めます。`);
    if (!choiceMode) choiceMode = wrongChoices.length >= 3 ? "fixed" : poolTag ? "pool" : "random";
    if (itemKind !== "qa" && choiceMode === "fixed" && wrongChoices.length < 3) {
      errors.push(`${line}行目: 固定なのに誤答が${wrongChoices.length}個です（4択には3個必要）。`);
    }
    if (itemKind === "blank" && !/[（(]\s*[）)]|_{2,}|＿{2,}/.test(prompt)) {
      errors.push(`${line}行目: 穴埋めの問題文に（　）か ___ がありません。`);
    }
    if (itemKind === "underline" && !/<u>.+<\/u>/.test(prompt)) {
      errors.push(`${line}行目: 下線の問題文に <u>下線にする語</u> がありません。`);
    }
    items.push({ itemKind, prompt, answer, wrongChoices, choiceMode, poolTag, explanation: get("explanation"), unit: get("unit") });
  });
  return { items, errors };
}
