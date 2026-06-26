import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/nav";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vocabprint.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vocab Print Pro｜単語帳から英単語テストPDFを自動作成",
    template: "%s｜Vocab Print Pro",
  },
  description:
    "単語帳を選ぶだけで、英単語テスト・一覧・解答のA4 PDFを自動生成。英検・大学受験・資格試験の小テスト作成に。先生・塾・自学に対応。",
  keywords: ["英単語テスト", "単語帳", "PDF作成", "英検", "大学受験", "小テスト", "プリント作成"],
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteUrl,
    siteName: "Vocab Print Pro",
    title: "Vocab Print Pro｜単語帳から英単語テストPDFを自動作成",
    description:
      "単語帳を選ぶだけで、英単語テスト・一覧・解答のA4 PDFを自動生成。英検・大学受験・資格試験の小テスト作成に。",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vocab Print Pro｜単語帳から英単語テストPDFを自動作成",
    description: "単語帳を選ぶだけで、英単語テストのA4 PDFを自動生成。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">
        <Nav />
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-white py-8 text-center text-xs text-slate-400">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5">
            <Link href="/pricing" className="hover:text-slate-600">料金</Link>
            <Link href="/legal/terms" className="hover:text-slate-600">利用規約</Link>
            <Link href="/legal/privacy" className="hover:text-slate-600">プライバシーポリシー</Link>
            <Link href="/legal/tokushoho" className="hover:text-slate-600">特定商取引法に基づく表記</Link>
          </div>
          <p className="mt-4">© 2026 Vocab Print Pro — 単語帳からA4 PDF教材を自動生成</p>
        </footer>
      </body>
    </html>
  );
}
