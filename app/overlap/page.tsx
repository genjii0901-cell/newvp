import type { Metadata } from "next";
import OverlapPageClient from "./overlap-page-client";

export const metadata: Metadata = {
  title: "単語帳かぶり調査",
  description: "複数の単語帳に共通する語、特定の単語帳にだけある語を抽出し、印刷やマイ単語帳への保存ができます。",
  alternates: { canonical: "/overlap" },
};

export default function OverlapPage() {
  return <OverlapPageClient />;
}
