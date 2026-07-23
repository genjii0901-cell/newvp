import type { Metadata } from "next";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { buildWordbookPath, extractWordbookIdFromSlug } from "@/lib/wordbook-slug";
import WordbookDetailClient from "./wordbook-detail-client";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";

const label = {
  defaultTitle: "単語帳の単語テスト・一覧プリント作成",
  titleSuffix: "の単語テスト・一覧プリント作成",
  defaultBook: "単語帳",
  descriptionPrefix: "の単語リストから、A4の英単語テスト、一覧プリント、聞き流し学習を作成できます。",
  wordCountPrefix: "収録語数は約",
  wordCountSuffix: "語です。",
  coverAlt: "の単語帳カバー",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

async function findSeoWordbook(slug: string) {
  const id = extractWordbookIdFromSlug(slug);
  if (!id) return null;

  if (isSupabaseServerConfigured()) {
    try {
      const result = await loadOfficialWordbooks({ includeWords: false, filterIds: [id] });
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
  return rawTitle.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function getSeoWordCount(book: Awaited<ReturnType<typeof findSeoWordbook>>) {
  return ((book as { wordCount?: number } | null)?.wordCount ?? book?.words?.length ?? 0);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: slug } = await params;
  const book = await findSeoWordbook(slug);
  const fallbackTitle = titleFromSlug(slug);
  const canonicalPath = book
    ? buildWordbookPath(book.id, book.title)
    : `/wordbooks/${encodeURIComponent(slug)}`;

  const displayTitle = book?.title ?? fallbackTitle;
  const wordCount = getSeoWordCount(book);
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
      `${displayTitle} 単語テスト`,
      `${displayTitle} 小テスト`,
      `${displayTitle} PDF`,
      `${displayTitle} プリント`,
      `${displayTitle} 単語一覧`,
      `${displayTitle} 聞き流し`,
      `${displayTitle} 印刷`,
      `${displayTitle} 解答`,
      "英単語テスト 作成",
      "単語帳 PDF",
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
  const wordCount = getSeoWordCount(book);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LearningResource",
        name: `${displayTitle}${label.titleSuffix}`,
        url: `${siteUrl}${canonicalPath}`,
        inLanguage: "ja",
        learningResourceType: "単語テスト・単語一覧プリント",
        educationalUse: "自習・小テスト・授業プリント",
        isAccessibleForFree: true,
        provider: { "@type": "Organization", name: "Vocab Print Pro", url: siteUrl },
        ...(wordCount ? { about: `${displayTitle}・約${wordCount}語` } : {}),
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
