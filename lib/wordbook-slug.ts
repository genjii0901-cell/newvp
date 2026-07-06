export function slugifyWordbookTitle(title: string) {
  return (title || "wordbook")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[\/?#%&=+:.\\]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "wordbook";
}

export function buildWordbookPath(id: string | number, title: string) {
  return `/wordbooks/${encodeURIComponent(`${String(id)}--${slugifyWordbookTitle(title)}`)}`;
}

export function extractWordbookIdFromSlug(value: string) {
  const decoded = decodeURIComponent(value || "");
  if (decoded.includes("--")) return decoded.split("--")[0] || decoded;
  const numericPrefix = decoded.match(/^(\d+)(?:-|$)/);
  if (numericPrefix) return numericPrefix[1];
  return decoded;
}
