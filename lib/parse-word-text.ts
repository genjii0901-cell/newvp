export type ParsedWordRow = {
  number: string;
  english: string;
  japanese: string;
  unit: string;
};

function parseDelimitedText(text: string, delimiter: "," | "\t") {
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
  return value.trim().toLowerCase();
}

function looksLikeHeader(row: string[]) {
  const normalized = row.map(normalizeHeader).filter(Boolean);
  return normalized.some((cell) =>
    [
      "number",
      "no",
      "english",
      "japanese",
      "unit",
      "word",
      "meaning",
      "訳",
      "意味",
      "英語",
      "日本語",
      "単語",
    ].includes(cell)
  );
}

function pickDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

function getHeaderIndexMap(headerRow: string[]) {
  const headerMap = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    headerMap.set(normalizeHeader(cell), index);
  });
  return {
    number:
      headerMap.get("number") ??
      headerMap.get("no") ??
      headerMap.get("番号") ??
      -1,
    english:
      headerMap.get("english") ??
      headerMap.get("word") ??
      headerMap.get("英語") ??
      headerMap.get("単語") ??
      -1,
    japanese:
      headerMap.get("japanese") ??
      headerMap.get("meaning") ??
      headerMap.get("日本語") ??
      headerMap.get("意味") ??
      headerMap.get("訳") ??
      -1,
    unit: headerMap.get("unit") ?? headerMap.get("章") ?? headerMap.get("範囲") ?? -1,
  };
}

export function parseWordText(text: string): ParsedWordRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const delimiter = pickDelimiter(trimmed);
  const rows = parseDelimitedText(trimmed, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0]);
  const headerIndexes = hasHeader ? getHeaderIndexMap(rows[0]) : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((cells, index) => {
      if (headerIndexes) {
        const english = headerIndexes.english >= 0 ? cells[headerIndexes.english] ?? "" : cells[1] ?? cells[0] ?? "";
        const japanese = headerIndexes.japanese >= 0 ? cells[headerIndexes.japanese] ?? "" : cells[2] ?? cells[1] ?? "";
        const number = headerIndexes.number >= 0 ? cells[headerIndexes.number] ?? String(index + 1) : String(index + 1);
        const unit = headerIndexes.unit >= 0 ? cells[headerIndexes.unit] ?? "" : "";
        return { number: number.trim() || String(index + 1), english: english.trim(), japanese: japanese.trim(), unit: unit.trim() };
      }

      if (cells.length >= 4) {
        return {
          number: (cells[0] || String(index + 1)).trim(),
          english: (cells[1] || "").trim(),
          japanese: (cells[2] || "").trim(),
          unit: (cells[3] || "").trim(),
        };
      }

      if (cells.length === 3) {
        return {
          number: (cells[0] || String(index + 1)).trim(),
          english: (cells[1] || "").trim(),
          japanese: (cells[2] || "").trim(),
          unit: "",
        };
      }

      if (cells.length === 2) {
        return {
          number: String(index + 1),
          english: (cells[0] || "").trim(),
          japanese: (cells[1] || "").trim(),
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
