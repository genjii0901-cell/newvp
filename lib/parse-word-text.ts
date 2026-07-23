export type ParsedWordRow = {
  number: string;
  english: string;
  japanese: string;
  unit: string;
};

type Delimiter = "," | "\t";

function parseDelimitedText(text: string, delimiter: Delimiter) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

const HEADER_ALIASES = {
  number: ["number", "no", "no.", "num", "id", "番号"],
  english: ["english", "word", "英語", "英単語", "単語", "問題", "古語"],
  japanese: ["japanese", "meaning", "日本語", "日本語訳", "意味", "訳", "答え", "解答"],
  unit: ["unit", "ユニット", "レッスン", "lesson", "章", "範囲"],
  page: ["page", "ページ", "頁"],
  memo: ["memo", "メモ", "備考"],
} as const;

function looksLikeHeader(row: string[]) {
  const known: Set<string> = new Set(Object.values(HEADER_ALIASES).flat());
  return row.map(normalizeHeader).filter(Boolean).some((cell) => known.has(cell));
}

function pickDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

function findHeaderIndex(headerMap: Map<string, number>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const index = headerMap.get(normalizeHeader(alias));
    if (typeof index === "number") return index;
  }
  return -1;
}

function getHeaderIndexMap(headerRow: string[]) {
  const headerMap = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    headerMap.set(normalizeHeader(cell), index);
  });
  return {
    number: findHeaderIndex(headerMap, HEADER_ALIASES.number),
    english: findHeaderIndex(headerMap, HEADER_ALIASES.english),
    japanese: findHeaderIndex(headerMap, HEADER_ALIASES.japanese),
    unit: findHeaderIndex(headerMap, HEADER_ALIASES.unit),
    page: findHeaderIndex(headerMap, HEADER_ALIASES.page),
    memo: findHeaderIndex(headerMap, HEADER_ALIASES.memo),
  };
}

function hasJapanese(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function isPlainInteger(value: string) {
  return /^\d+$/.test(value.trim());
}

function joinExtras(parts: Array<string | undefined>) {
  return parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" / ");
}

function cleanCell(value: string | undefined) {
  return (value ?? "").trim();
}

export function parseWordText(text: string): ParsedWordRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const delimiter = pickDelimiter(trimmed);
  const rows = parseDelimitedText(trimmed, delimiter)
    .map((row) => row.map(cleanCell))
    .filter((row) => row.some(Boolean));

  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0]);
  const headerIndexes = hasHeader ? getHeaderIndexMap(rows[0]) : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((cells, index) => {
      if (headerIndexes) {
        const english = headerIndexes.english >= 0 ? cells[headerIndexes.english] : cells[1] ?? cells[0];
        const japanese = headerIndexes.japanese >= 0 ? cells[headerIndexes.japanese] : cells[2] ?? cells[1];
        const number = headerIndexes.number >= 0 ? cells[headerIndexes.number] : String(index + 1);
        const unit = joinExtras([
          headerIndexes.unit >= 0 ? cells[headerIndexes.unit] : "",
          headerIndexes.page >= 0 ? cells[headerIndexes.page] : "",
          headerIndexes.memo >= 0 ? cells[headerIndexes.memo] : "",
        ]);
        return {
          number: cleanCell(number) || String(index + 1),
          english: cleanCell(english),
          japanese: cleanCell(japanese),
          unit,
        };
      }

      if (cells.length >= 4) {
        return {
          number: cleanCell(cells[0]) || String(index + 1),
          english: cleanCell(cells[1]),
          japanese: cleanCell(cells[2]),
          unit: joinExtras(cells.slice(3)),
        };
      }

      if (cells.length === 3) {
        const first = cleanCell(cells[0]);
        const second = cleanCell(cells[1]);
        const third = cleanCell(cells[2]);

        // Headerless Japanese/classical rows are often "問題,意味,Unit".
        // Numeric or label-like first columns are still treated as the number column.
        if (!isPlainInteger(first) && hasJapanese(second) && !hasJapanese(third)) {
          return {
            number: String(index + 1),
            english: first,
            japanese: second,
            unit: third,
          };
        }

        return {
          number: first || String(index + 1),
          english: second,
          japanese: third,
          unit: "",
        };
      }

      if (cells.length === 2) {
        return {
          number: String(index + 1),
          english: cleanCell(cells[0]),
          japanese: cleanCell(cells[1]),
          unit: "",
        };
      }

      return {
        number: String(index + 1),
        english: "",
        japanese: "",
        unit: "",
      };
    })
    .filter((row) => row.english && row.japanese);
}
