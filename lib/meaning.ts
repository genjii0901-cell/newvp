const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

function stripLeadingNoise(value: string) {
  let text = value.trim();

  for (let i = 0; i < 6; i += 1) {
    const next = text
      .replace(/^[\s\-=:：・,，、]+/, "")
      .replace(/^[\(\[（【][^\)\]）】]{0,20}[\)\]）】]\s*/, "")
      .replace(/^(?:No\.?\s*)?\d+\s*[\.\):：、]?\s*/, "")
      .replace(/^[①-⑳㉑-㉟]+\s*/, "")
      .replace(/^[一二三四五六七八九十]+\s*[\.\):：、]?\s*/, "")
      .replace(/^(?:自動詞|他動詞|動詞|名詞|形容詞|副詞|句動詞|熟語|前置詞|助動詞|助詞|連語)\s*/, "")
      .trim();

    if (next === text) break;
    text = next;
  }

  return text;
}

export function extractPrimaryMeaning(source: string) {
  let text = stripLeadingNoise(source);
  if (!text) return "";

  const firstJapaneseIndex = text.search(JAPANESE_RE);
  if (firstJapaneseIndex > 0) {
    text = text.slice(firstJapaneseIndex);
  }

  text = stripLeadingNoise(text);

  const segments = text
    .replace(/[\/／]/g, "|")
    .replace(/[;；]/g, "|")
    .replace(/[|｜]/g, "|")
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const primarySegment = segments.find((segment) => JAPANESE_RE.test(segment)) ?? segments[0] ?? text;

  const commaSplit = primarySegment
    .split(/[、，,・]/)
    .map((part) => stripLeadingNoise(part))
    .filter(Boolean);

  const result = commaSplit.find((part) => JAPANESE_RE.test(part)) ?? commaSplit[0] ?? stripLeadingNoise(primarySegment);
  return result.trim();
}

export function formatMeaning(source: string, mode: "all" | "main") {
  if (mode === "all") return source.trim();
  return extractPrimaryMeaning(source);
}
