import type { Metadata } from "next";
import PdfMaterialsClient from "./pdf-materials-client";

export const metadata: Metadata = {
  title: "PDF教材ストア | Vocab Print Pro",
  description: "英単語帳ごとの単語一覧、和訳テスト、スペルテスト、赤シート教材を単品またはセットで購入し、すぐ印刷できます。",
  alternates: { canonical: "/materials" },
};

export default function PdfMaterialsPage() {
  return <PdfMaterialsClient />;
}
