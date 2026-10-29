import type { Metadata } from "next";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadCachedPublicCatalog } from "@/lib/cached-wordbooks";
import WordbooksClient, { type OfficialWordbook } from "./wordbooks-client";

// 管理画面を通さずDBを直接変えた場合でも、5分以内に一覧へ反映する。
export const revalidate = 300;

export const metadata: Metadata = {
  title: "みんなの単語帳・単語テスト印刷",
  description:
    "ターゲット、システム英単語、英検、速読英単語などの単語帳を検索し、範囲を選んで単語テスト・解答・一覧をA4で印刷できます。聞き流しと単語チェックにも対応。",
  alternates: { canonical: "/wordbooks" },
  openGraph: {
    title: "みんなの単語帳・単語テスト印刷 | Vocab Print Pro",
    description:
      "単語帳を画像や名前から探し、範囲別の単語テスト、解答、一覧プリントを作成できます。",
    url: "/wordbooks",
  },
};

async function loadInitialWordbooks(): Promise<OfficialWordbook[]> {
  try {
    const result = await loadCachedPublicCatalog();
    if (result.ok) return result.wordbooks as OfficialWordbook[];
  } catch {
    // The built-in catalog keeps the page useful during a temporary DB outage.
  }
  return fallbackOfficialWordbooksForApi() as OfficialWordbook[];
}

export default async function WordbooksPage() {
  const books = await loadInitialWordbooks();
  return <WordbooksClient initialOfficialBooks={books} />;
}
