import type { Metadata } from "next";
import PdfMaterialsClient from "./pdf-materials-client";

export const metadata: Metadata = {
  title: "PDF教材ライブラリ",
  description: "Vocab Print Proで用意された単語テストや学習用PDFを開いて印刷できます。",
  alternates: { canonical: "/materials" },
};

export default function PdfMaterialsPage() {
  return <PdfMaterialsClient />;
}

