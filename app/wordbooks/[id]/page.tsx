import type { Metadata } from "next";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { buildWordbookPath, extractWordbookIdFromSlug } from "@/lib/wordbook-slug";
import WordbookDetailClient from "./wordbook-detail-client";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";

const label = {
  defaultTitle: "\u5358\u8a9e\u5e33\u306e\u5358\u8a9e\u30c6\u30b9\u30c8\u30fb\u4e00\u89a7\u30d7\u30ea\u30f3\u30c8\u4f5c\u6210",
  titleSuffix: "\u306e\u5358\u8a9e\u30c6\u30b9\u30c8\u30fb\u4e00\u89a7\u30d7\u30ea\u30f3\u30c8\u4f5c\u6210",
  defaultBook: "\u5358\u8a9e\u5e33",
  descriptionPrefix: "\u306e\u5358\u8a9e\u30ea\u30b9\u30c8\u304b\u3089\u3001A4\u306e\u82f1\u5358\u8a9e\u30c6\u30b9\u30c8\u3001\u4e00\u89a7\u30d7\u30ea\u30f3\u30c8\u3001\u805e\u304d\u6d41\u3057\u5b66\u7fd2\u3092\u4f5c\u6210\u3067\u304d\u307e\u3059\u3002",
  wordCountPrefix: "\u53ce\u9332\u8a9e\u6570\u306f\u7d04",
  wordCountSuffix: "\u8a9e\u3067\u3059\u3002",
  testKeyword: " \u5358\u8a9e\u30c6\u30b9\u30c8",
  printKeyword: " \u30d7\u30ea\u30f3\u30c8",
  listKeyword: " \u5358\u8a9e\u4e00\u89a7",
  genericTest: "\u82f1\u5358\u8a9e\u30c6\u30b9\u30c8 \u4f5c\u6210",
  genericPdf: "\u5358\u8a9e\u5e33 PDF",
  coverAlt: "\u306e\u5358\u8a9e\u5e33\u30ab\u30d0\u30fc",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

async function findSeoWordbook(slug: string) {
  const id = extractWordbookIdFromSlug(slug);
  if (!id) return null;

  if (isSupabaseServerConfigured()) {
    try {
      const result = await loadOfficialWordbooks({ includeWords: false });
      if (result.ok) {
        const found = result.wordbooks.find((book) => String(book.id) === id);
        if (found) return found;
      }
    } catch {
      // Metadata should still render if the database is temporarily unavailable.
    }
  }

  return fallbackOfficialWordbooksForApi().find((book) => String(book.id) === id) ?? null;
}

function titleFromSlug(slug: string) {
  const decoded = decodeURIComponent(slug || "");
  const rawTitle = decoded.includes("--") ? decoded.split("--").slice(1).join("--") : "";
  return rawTitle
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: slug } = await params;
  const book = await findSeoWordbook(slug);
  const fallbackTitle = titleFromSlug(slug);
  const canonicalPath = book
    ? buildWordbookPath(book.id, book.title)
    : `/wordbooks/${encodeURIComponent(slug)}`;

  const displayTitle = book?.title ?? fallbackTitle;
  const wordCount = book?.wordCount ?? book?.words?.length ?? 0;
  const title = displayTitle ? `${displayTitle}${label.titleSuffix}` : label.defaultTitle;
  const description =
    `${displayTitle || label.defaultBook}${label.descriptionPrefix}` +
    (wordCount ? `${label.wordCountPrefix}${wordCount}${label.wordCountSuffix}` : "");

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    keywords: [
      displayTitle,
      `${displayTitle}${label.testKeyword}`,
      `${displayTitle} PDF`,
      `${displayTitle}${label.printKeyword}`,
      `${displayTitle}${label.listKeyword}`,
      label.genericTest,
      label.genericPdf,
    ].filter((value): value is string => Boolean(value)),
    openGraph: {
      type: "article",
      locale: "ja_JP",
      url: `${siteUrl}${canonicalPath}`,
      siteName: "Vocab Print Pro",
      title,
      description,
      images: book?.coverImage
        ? [
            {
              url: book.coverImage,
              width: 1200,
              height: 630,
              alt: `${displayTitle}${label.coverAlt}`,
            },
          ]
        : [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: "Vocab Print Pro" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [book?.coverImage || `${siteUrl}/twitter-image`],
    },
  };
}

export default async function WordbookDetailPage({ params }: PageProps) {
  const { id: slug } = await params;
  const book = await findSeoWordbook(slug);
  const displayTitle = book?.title ?? titleFromSlug(slug);
  const canonicalPath = book ? buildWordbookPath(book.id, book.title) : `/wordbooks/${encodeURIComponent(slug)}`;
  const wordCount = (book as { wordCount?: number } | null)?.wordCount ?? book?.words?.length ?? 0;

  // 構造化データ: 教材ページであること＋パンくずをGoogleに伝える（検索での表示を助ける）。
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LearningResource",
        name: `${displayTitle}${label.titleSuffix}`,
        url: `${siteUrl}${canonicalPath}`,
        inLanguage: "ja",
        learningResourceType: "英単語テスト・一覧プリント",
        educationalUse: "自習・小テスト",
        isAccessibleForFree: true,
        provider: { "@type": "Organization", name: "Vocab Print Pro", url: siteUrl },
        ...(wordCount ? { about: `${displayTitle}（約${wordCount}語）` } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ホーム", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "みんなの単語帳", item: `${siteUrl}/wordbooks` },
          { "@type": "ListItem", position: 3, name: displayTitle, item: `${siteUrl}${canonicalPath}` },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WordbookDetailClient />
    </>
  );
}
