export const WORDBOOK_META_PREFIX = "\n\n__VPP_META__:";

export type EmbeddedWordbookMeta = {
  coverImage?: string | null;
  visibility?: string | null;
};

export function parseEmbeddedWordbookMeta(description: string | null | undefined): EmbeddedWordbookMeta {
  if (typeof description !== "string") return {};
  const markerIndex = description.indexOf(WORDBOOK_META_PREFIX);
  if (markerIndex < 0) return {};
  const raw = description.slice(markerIndex + WORDBOOK_META_PREFIX.length).trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      coverImage: typeof parsed.coverImage === "string" ? parsed.coverImage : null,
      visibility: typeof parsed.visibility === "string" ? parsed.visibility : null,
    };
  } catch {
    return {};
  }
}

export function stripEmbeddedWordbookMeta(description: string | null | undefined) {
  if (typeof description !== "string") return "";
  const markerIndex = description.indexOf(WORDBOOK_META_PREFIX);
  if (markerIndex < 0) return description;
  return description.slice(0, markerIndex).trimEnd();
}

export function embedWordbookMeta(
  description: string | null | undefined,
  meta: EmbeddedWordbookMeta
) {
  const cleanDescription = stripEmbeddedWordbookMeta(description).trim();
  const payload: Record<string, string> = {};
  if (typeof meta.coverImage === "string" && meta.coverImage.trim()) {
    payload.coverImage = meta.coverImage.trim();
  }
  if (typeof meta.visibility === "string" && meta.visibility.trim()) {
    payload.visibility = meta.visibility.trim();
  }
  if (Object.keys(payload).length === 0) return cleanDescription;
  return `${cleanDescription}${WORDBOOK_META_PREFIX}${JSON.stringify(payload)}`;
}
