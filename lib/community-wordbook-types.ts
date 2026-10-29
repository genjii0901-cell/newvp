export const communitySubjects = ["英語", "国語", "多言語", "その他"] as const;
export type CommunitySubject = typeof communitySubjects[number];

export function normalizeCommunitySubject(value: unknown): CommunitySubject {
  return communitySubjects.includes(value as CommunitySubject) ? value as CommunitySubject : "その他";
}

export function defaultCommunityCover(subject: CommunitySubject) {
  if (subject === "英語") return "/community-english.png";
  if (subject === "国語") return "/community-japanese.png";
  return "/community-languages.png";
}
