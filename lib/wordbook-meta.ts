export const WORDBOOK_META_PREFIX = "\n\n__VPP_META__:";

export type EmbeddedWordbookMeta = {
  coverImage?: string | null;
  visibility?: string | null;
  creatorName?: string | null;
  subject?: string | null;
  anonymous?: boolean;
  /** みんなの単語帳などから取り込んだ単語帳。改変・再公開はできない。 */
  copied?: boolean;
  /** 取り込み元の必要プラン（free/personal/teacher）。無料化を防ぐため元の区分を引き継ぐ。 */
  requiredPlan?: string | null;
  /** 取り込み元の単語帳ID。★や学習記録を元の単語帳と共有するために使う。 */
  sourceId?: string | null;
};

/** 旧版で取り込んだ単語帳には印がないので、説明文から判定する。 */
export function isLegacyCopiedDescription(description: string | null | undefined) {
  const text = stripEmbeddedWordbookMeta(description);
  return /をマイ単語帳に追加しました。$|をみんなの単語帳から追加しました。$/.test(text.trim());
}

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
      creatorName: typeof parsed.creatorName === "string" ? parsed.creatorName : null,
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      anonymous: parsed.anonymous === true,
      copied: parsed.copied === true,
      requiredPlan: typeof parsed.requiredPlan === "string" ? parsed.requiredPlan : null,
      sourceId: typeof parsed.sourceId === "string" ? parsed.sourceId : null,
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
  const payload: Record<string, string | boolean> = {};
  if (typeof meta.coverImage === "string" && meta.coverImage.trim()) {
    payload.coverImage = meta.coverImage.trim();
  }
  if (typeof meta.visibility === "string" && meta.visibility.trim()) {
    payload.visibility = meta.visibility.trim();
  }
  if (typeof meta.creatorName === "string" && meta.creatorName.trim()) {
    payload.creatorName = meta.creatorName.trim();
  }
  if (typeof meta.subject === "string" && meta.subject.trim()) {
    payload.subject = meta.subject.trim();
  }
  if (meta.anonymous === true) payload.anonymous = true;
  if (meta.copied === true) payload.copied = true;
  if (typeof meta.sourceId === "string" && meta.sourceId.trim()) payload.sourceId = meta.sourceId.trim();
  if (typeof meta.requiredPlan === "string" && meta.requiredPlan.trim()) payload.requiredPlan = meta.requiredPlan.trim();
  if (Object.keys(payload).length === 0) return cleanDescription;
  return `${cleanDescription}${WORDBOOK_META_PREFIX}${JSON.stringify(payload)}`;
}
