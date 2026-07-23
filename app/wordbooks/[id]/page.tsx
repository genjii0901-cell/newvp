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
  searchParams?: Promise<{ tab?: string }>;
};

type SeoTab = "overview" | "test" | "listen" | "quiz";

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

function normalizeSeoTab(value: string | undefined): SeoTab {
  if (value === "test" || value === "listen" || value === "quiz") return value;
  return "overview";
}

function tabCanonicalPath(basePath: string, tab: SeoTab) {
  if (tab === "overview") return basePath;
  return `${basePath}?tab=${tab}`;
}

function buildTabSeo(displayTitle: string, wordCount: number, tab: SeoTab) {
  const countText = wordCount ? `約${wordCount}語に対応。` : "";
  if (tab === "test") {
    return {
      title: `${displayTitle}の単語テスト印刷・PDF作成 | Vocab Print Pro`,
      description: `${displayTitle}の単語リストから、A4の単語テスト、解答プリント、単語一覧PDFを作成できます。範囲指定、英語空欄、日本語空欄、ランダム順にも対応。${countText}`,
      keywords: ["単語テスト 印刷", "単語テスト PDF", "英単語プリント", "小テスト 作成"],
    };
  }
  if (tab === "listen") {
    return {
      title: `${displayTitle}の聞き流し学習 | Vocab Print Pro`,
      description: `${displayTitle}の単語を、英語から日本語、日本語から英語の順で聞き流しできます。速度や間隔を調整しながら、移動中や復習に使えます。${countText}`,
      keywords: ["英単語 聞き流し", "単語帳 音声", "英単語 復習"],
    };
  }
  if (tab === "quiz") {
    return {
      title: `${displayTitle}の単語チェック・4択練習 | Vocab Print Pro`,
      description: `${displayTitle}の単語を、カード形式や4択クイズで確認できます。わからない単語にマークを付けて復習できます。${countText}`,
      keywords: ["英単語 クイズ", "単語チェック", "4択 英単語"],
    };
  }
  return null;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id: slug } = await params;
  const tab = normalizeSeoTab((await searchParams)?.tab);
  const book = await findSeoWordbook(slug);
  const fallbackTitle = titleFromSlug(slug);
  const baseCanonicalPath = book
    ? buildWordbookPath(book.id, book.title)
    : `/wordbooks/${encodeURIComponent(slug)}`;

  const displayTitle = book?.title ?? fallbackTitle;
  const wordCount = getSeoWordCount(book);
  const tabSeo = displayTitle ? buildTabSeo(displayTitle, wordCount, tab) : null;
  const canonicalPath = tabCanonicalPath(baseCanonicalPath, tab);
  const title = tabSeo?.title ?? (displayTitle ? `${displayTitle}${label.titleSuffix}` : label.defaultTitle);
  const description =
    tabSeo?.description ??
    (`${displayTitle || label.defaultBook}${label.descriptionPrefix}` +
      (wordCount ? `${label.wordCountPrefix}${wordCount}${label.wordCountSuffix}` : ""));

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
      ...(tabSeo?.keywords.map((keyword) => `${displayTitle} ${keyword}`) ?? []),
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
        hasPart: [
          {
            "@type": "WebPage",
            name: `${displayTitle}の単語テスト印刷`,
            url: `${siteUrl}${canonicalPath}?tab=test`,
          },
          {
            "@type": "WebPage",
            name: `${displayTitle}の聞き流し`,
            url: `${siteUrl}${canonicalPath}?tab=listen`,
          },
          {
            "@type": "WebPage",
            name: `${displayTitle}の単語チェック`,
            url: `${siteUrl}${canonicalPath}?tab=quiz`,
          },
        ],
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
