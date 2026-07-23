const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

const LEADING_MARK_RE =
  /^\s*(?:[-=:：・,，、]|No\.?\s*)*\s*(?:\(?\d+\)?[.)．、:：-]?|[①-⑳]|[一二三四五六七八九十]+[.)．、:：-]?)\s*/;

const POS_LABEL_RE =
  /^\s*(?:[（(【［\[]\s*(?:名|名詞|動|動詞|自|自動詞|他|他動詞|形|形容詞|形動|副|副詞|助|助動詞|接|接続詞|前|前置詞|句|熟語|古|古語|文|口語|俗|比|比喩|原義|派生|反|類|対)\s*[）)】］\]])\s*/;

const NOTE_RE = /[（(【［\[].*?[）)】］\]]/g;

function normalizeMeaningText(value: string) {
  return value
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingNoise(value: string) {
  let text = normalizeMeaningText(value);

  for (let index = 0; index < 8; index += 1) {
    const next = text
      .replace(LEADING_MARK_RE, "")
      .replace(POS_LABEL_RE, "")
      .replace(/^\s*(?:意味|訳|答え|解答)\s*[:：]\s*/, "")
      .trim();

    if (next === text) break;
    text = next;
  }

  return text;
}

function preferJapanesePart(value: string) {
  const colonParts = value.split(/[:：]/).map((part) => part.trim()).filter(Boolean);
  if (colonParts.length > 1) {
    const japanesePart = colonParts.find((part) => JAPANESE_RE.test(part));
    if (japanesePart) return japanesePart;
  }

  const firstJapaneseIndex = value.search(JAPANESE_RE);
  if (firstJapaneseIndex > 0) return value.slice(firstJapaneseIndex).trim();
  return value;
}

function cleanCandidate(value: string) {
  return stripLeadingNoise(
    normalizeMeaningText(value)
      .replace(NOTE_RE, " ")
      .replace(/^(?:こと|もの)\s*[:：]\s*/, "")
      .replace(/^[\/／|｜;；、，,.。．・･\s]+/, "")
      .replace(/[\/／|｜;；、，,.。．・･\s]+$/, ""),
  );
}

export function extractPrimaryMeaning(source: string) {
  let text = preferJapanesePart(stripLeadingNoise(source));
  if (!text) return "";

  text = stripLeadingNoise(text);

  const segments = text
    .replace(/[／/｜|;；。．\n\r]/g, "|")
    .replace(/\s*[、，,]\s*/g, "|")
    .replace(/\s*[・･]\s*/g, "|")
    .split("|")
    .map(cleanCandidate)
    .filter(Boolean);

  const primary =
    segments.find((segment) => JAPANESE_RE.test(segment) && segment.length >= 2) ??
    segments.find((segment) => JAPANESE_RE.test(segment)) ??
    cleanCandidate(text);

  return primary || normalizeMeaningText(source);
}

export function formatMeaning(source: string, mode: "all" | "main") {
  if (mode === "all") return normalizeMeaningText(source);
  return extractPrimaryMeaning(source);
}
