export type ContentKind = "example" | "question";
export type SavedContent = {
  id: string;
  sort_order: number;
  word_number?: string;
  word_english?: string;
  sentence_en?: string;
  sentence_ja?: string;
  status?: string;
  item_kind?: string;
  prompt?: string;
  answer?: string;
  wrong_choices?: string[];
  choice_mode?: string;
  pool_tag?: string;
  explanation?: string;
  unit?: string;
};

export const QUESTION_KINDS = { choice: "4択", blank: "穴埋め", underline: "下線", qa: "一問一答" };
export const SEARCH_FIELDS = {
  example: { sentence_en: "例文", sentence_ja: "日本語訳", word_english: "単語", word_number: "単語番号" },
  question: { prompt: "問題文", answer: "答え", unit: "単元", pool_tag: "タグ" },
};

/** 編集画面のJSONを検査する。未知のキーや公開状態は書き込ませない。 */
export function validateContent(kind: ContentKind, input: unknown) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const errors: string[] = [];
  function field(key: string, label: string, max = 5000, required = false) {
    const raw = value[key];
    if (raw !== undefined && typeof raw !== "string") errors.push(`${label}は文字列で入力してください。`);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (required && !text) errors.push(`${label}を入力してください。`);
    if (text.length > max) errors.push(`${label}は${max}文字以内にしてください。`);
    return text;
  }
  if (kind === "example") {
    const word_number = field("word_number", "単語番号", 100);
    const word_english = field("word_english", "単語", 300);
    const sentence_en = field("sentence_en", "例文", 5000, true);
    const sentence_ja = field("sentence_ja", "日本語訳");
    if (!word_number && !word_english) errors.push("単語番号か単語のどちらかを入力してください。");
    return { errors, row: { word_number, word_english, sentence_en, sentence_ja } };
  }
  const item_kind = field("item_kind", "問題の種類", 30, true);
  const prompt = field("prompt", "問題文", 10000, true);
  const answer = field("answer", "答え", 5000, true);
  const choice_mode = field("choice_mode", "選択肢方式", 30, true);
  const pool_tag = field("pool_tag", "タグ", 100);
  const explanation = field("explanation", "解説", 10000);
  const unit = field("unit", "単元", 200);
  if (!Object.hasOwn(QUESTION_KINDS, item_kind)) errors.push("問題の種類を選んでください。");
  if (!["fixed", "pool", "random"].includes(choice_mode)) errors.push("選択肢方式を選んでください。");
  const rawChoices = value.wrong_choices;
  if (!Array.isArray(rawChoices) || rawChoices.some((v) => typeof v !== "string")) errors.push("誤答は文字列の一覧で入力してください。");
  const wrong_choices = Array.isArray(rawChoices) ? [...new Set(rawChoices.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))] : [];
  if (wrong_choices.length > 20 || wrong_choices.some((v) => v.length > 1000)) errors.push("誤答は20個まで、各1000文字以内にしてください。");
  if (wrong_choices.includes(answer)) errors.push("誤答に正解と同じ内容が含まれています。");
  if (item_kind !== "qa" && choice_mode === "fixed" && wrong_choices.length < 3) errors.push("固定の4択には、異なる誤答が3個以上必要です。");
  if (item_kind !== "qa" && choice_mode === "pool" && !pool_tag) errors.push("タグ方式にはタグを入力してください。");
  if (item_kind === "blank" && !/[（(]\s*[）)]|_{2,}|＿{2,}/.test(prompt)) errors.push("穴埋めの問題文に（　）か ___ を入れてください。");
  if (item_kind === "underline" && !/<u>[^]+?<\/u>/.test(prompt)) errors.push("下線部分を <u> と </u> で囲んでください。");
  return { errors, row: { item_kind, prompt, answer, wrong_choices, choice_mode, pool_tag, explanation, unit } };
}

export function emptyContent(kind: ContentKind): SavedContent {
  return kind === "example"
    ? { id: "", sort_order: 0, word_number: "", word_english: "", sentence_en: "", sentence_ja: "" }
    : { id: "", sort_order: 0, item_kind: "choice", prompt: "", answer: "", wrong_choices: [], choice_mode: "fixed", pool_tag: "", explanation: "", unit: "" };
}
