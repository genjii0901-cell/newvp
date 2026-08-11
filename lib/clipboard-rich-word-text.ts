function isBoldStyle(style: string) {
  return /font-weight\s*:\s*(?:bold|[6-9]\d{2}|[1-9]\d{3,})\b/i.test(style);
}

function getBoldClassNames(doc: Document) {
  const names = new Set<string>();
  for (const styleTag of Array.from(doc.querySelectorAll("style"))) {
    const css = styleTag.textContent ?? "";
    for (const match of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      if (isBoldStyle(match[2])) names.add(match[1]);
    }
  }
  return names;
}

function textWithBoldMarkers(node: Node, inheritedBold: boolean, boldClassNames: Set<string>): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent?.replace(/\s+/g, " ") ?? "";
    return inheritedBold && value ? `**${value}**` : value;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  if (element.tagName === "BR") return "\n";
  const isBold =
    inheritedBold ||
    element.tagName === "B" ||
    element.tagName === "STRONG" ||
    isBoldStyle(element.getAttribute("style") ?? "") ||
    Array.from(element.classList).some((className) => boldClassNames.has(className));

  return Array.from(element.childNodes)
    .map((child) => textWithBoldMarkers(child, isBold, boldClassNames))
    .join("");
}

/**
 * Excel からコピーされたHTML表を、太字を **...** で保持したTSVへ変換する。
 * HTMLをそのまま保存・描画することはないので、貼り付け内容は実行されない。
 */
export function richClipboardHtmlToWordTsv(html: string) {
  if (!html || typeof DOMParser === "undefined") return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("table tr"));
  if (rows.length === 0) return null;

  const boldClassNames = getBoldClassNames(doc);
  const tsv = rows
    .map((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td"))
        .map((cell) => textWithBoldMarkers(cell, false, boldClassNames).replace(/\n+/g, " ").trim())
        .join("\t")
    )
    .filter(Boolean)
    .join("\n");

  return tsv.includes("**") ? tsv : null;
}
