import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import Nav from "@/components/nav";
import VisitTracker from "@/app/visit-tracker";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";
const siteName = "Vocab Print Pro";
const titleText = "Vocab Print Pro | 単語帳から英単語テストPDFを自動作成";
const siteDescription =
  "単語帳データから、一覧・問題・解答のA4プリントをすぐに作れる学習Webサービスです。英検、大学受験、資格試験の小テスト作成をシンプルに進められます。";
const ogImage = `${siteUrl}/opengraph-image`;
const twitterImage = `${siteUrl}/twitter-image`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: titleText,
    template: "%s | Vocab Print Pro",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "Vocab Print Pro",
    "英単語テスト",
    "単語帳",
    "PDF作成",
    "学習プリント",
    "A4印刷",
    "英語教材",
    "小テスト作成",
  ],
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteUrl,
    siteName,
    title: titleText,
    description: siteDescription,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Vocab Print Pro の共有カード画像",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: titleText,
    description: siteDescription,
    images: [twitterImage],
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
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
      name: siteName,
      inLanguage: "ja",
      description: siteDescription,
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: siteUrl,
      inLanguage: "ja",
      description: "単語帳から一覧・問題・解答のPDFを作成できるWebサービスです。",
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
        <Suspense fallback={null}>
          <VisitTracker />
        </Suspense>
        <Nav />
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-white py-8 text-center text-xs text-slate-400">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5">
            <Link href="/pricing" className="hover:text-slate-600">
              料金
            </Link>
            <Link href="/legal/terms" className="hover:text-slate-600">
              利用規約
            </Link>
            <Link href="/legal/privacy" className="hover:text-slate-600">
              プライバシーポリシー
            </Link>
            <Link href="/legal/tokushoho" className="hover:text-slate-600">
              特定商取引法に基づく表記
            </Link>
          </div>
          <p className="mt-4">© 2026 Vocab Print Pro</p>
        </footer>
      </body>
    </html>
  );
}
