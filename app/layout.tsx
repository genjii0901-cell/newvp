import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import Nav from "@/components/nav";
import VisitTracker from "@/app/visit-tracker";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";
const siteName = "Vocab Print Pro";
const titleText = `Vocab Print Pro | ${"\u5358\u8a9e\u5e33\u304b\u3089\u82f1\u5358\u8a9e\u30c6\u30b9\u30c8PDF\u3092\u4f5c\u6210"}`;
const siteDescription =
  "\u5358\u8a9e\u5e33\u30c7\u30fc\u30bf\u304b\u3089\u3001\u4e00\u89a7\u30fb\u554f\u984c\u30fb\u89e3\u7b54\u306eA4\u30d7\u30ea\u30f3\u30c8\u3092\u3059\u3050\u306b\u4f5c\u308c\u308b\u5b66\u7fd2Web\u30b5\u30fc\u30d3\u30b9\u3067\u3059\u3002\u82f1\u691c\u3001\u5927\u5b66\u53d7\u9a13\u3001\u8cc7\u683c\u8a66\u9a13\u306e\u5c0f\u30c6\u30b9\u30c8\u4f5c\u6210\u3092\u30b7\u30f3\u30d7\u30eb\u306b\u9032\u3081\u3089\u308c\u307e\u3059\u3002";
const ogImage = `${siteUrl}/opengraph-image`;
const twitterImage = `${siteUrl}/twitter-image`;

const footerLabels = {
  pricing: "\u6599\u91d1",
  terms: "\u5229\u7528\u898f\u7d04",
  privacy: "\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc",
  tokushoho: "\u7279\u5b9a\u5546\u53d6\u5f15\u6cd5\u306b\u57fa\u3065\u304f\u8868\u8a18",
};

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
    "\u82f1\u5358\u8a9e\u30c6\u30b9\u30c8",
    "\u5358\u8a9e\u5e33",
    "PDF\u4f5c\u6210",
    "\u5b66\u7fd2\u30d7\u30ea\u30f3\u30c8",
    "A4\u5370\u5237",
    "\u82f1\u8a9e\u6559\u6750",
    "\u5c0f\u30c6\u30b9\u30c8\u4f5c\u6210",
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
        alt: "Vocab Print Pro\u306e\u5171\u6709\u30ab\u30fc\u30c9\u753b\u50cf",
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
      description: "\u5358\u8a9e\u5e33\u304b\u3089\u4e00\u89a7\u30fb\u554f\u984c\u30fb\u89e3\u7b54\u306ePDF\u3092\u4f5c\u6210\u3067\u304d\u308bWeb\u30b5\u30fc\u30d3\u30b9\u3067\u3059\u3002",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "JPY",
        description: "\u7121\u6599\u30d7\u30e9\u30f3\u3042\u308a",
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
              {footerLabels.pricing}
            </Link>
            <Link href="/legal/terms" className="hover:text-slate-600">
              {footerLabels.terms}
            </Link>
            <Link href="/legal/privacy" className="hover:text-slate-600">
              {footerLabels.privacy}
            </Link>
            <Link href="/legal/tokushoho" className="hover:text-slate-600">
              {footerLabels.tokushoho}
            </Link>
          </div>
          <p className="mt-4">© 2026 Vocab Print Pro</p>
        </footer>
      </body>
    </html>
  );
}
