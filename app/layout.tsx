import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/nav";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vocab Print Pro | 単語帳から英単語テストPDFを自動作成",
    template: "%s | Vocab Print Pro",
  },
  description:
    "単語帳・小テスト・解答PDFをA4できれいに作れる学習プリント作成サービス。英語学習、受験対策、授業準備に使えます。",
  keywords: [
    "Vocab Print Pro",
    "英単語テスト",
    "単語帳",
    "PDF作成",
    "学習プリント",
    "A4印刷",
  ],
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteUrl,
    siteName: "Vocab Print Pro",
    title: "Vocab Print Pro | 単語帳から英単語テストPDFを自動作成",
    description:
      "単語帳・小テスト・解答PDFをA4できれいに作れる学習プリント作成サービス。",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vocab Print Pro | 単語帳から英単語テストPDFを自動作成",
    description:
      "単語帳・小テスト・解答PDFをA4できれいに作れる学習プリント作成サービス。",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Vocab Print Pro",
      inLanguage: "ja",
      description:
        "単語帳・小テスト・解答PDFをA4できれいに作れる学習プリント作成サービス。",
    },
    {
      "@type": "SoftwareApplication",
      name: "Vocab Print Pro",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: siteUrl,
      inLanguage: "ja",
      description:
        "単語帳から一覧・問題・解答PDFを作成できるWebサービス。学校、塾、自学用プリント作成に対応。",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "JPY",
        description: "無料プランあり",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Nav />
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-white py-8 text-center text-xs text-slate-400">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5">
            <Link href="/pricing" className="hover:text-slate-600">料金</Link>
            <Link href="/legal/terms" className="hover:text-slate-600">利用規約</Link>
            <Link href="/legal/privacy" className="hover:text-slate-600">プライバシーポリシー</Link>
            <Link href="/legal/tokushoho" className="hover:text-slate-600">特定商取引法に基づく表記</Link>
          </div>
          <p className="mt-4">© 2026 Vocab Print Pro</p>
        </footer>
      </body>
    </html>
  );
}
