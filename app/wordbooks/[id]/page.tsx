import type { Metadata } from "next";
import Link from "next/link";
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

const PRINT_FAQ = [
  {
    question: "必要な範囲だけ印刷できますか？",
    answer: "開始番号と終了番号、出題数を指定できます。毎日の確認テストや授業用プリントにも使えます。",
  },
  {
    question: "英語を隠したテストや日本語を隠したテストは作れますか？",
    answer: "印刷設定から、英語空欄・日本語空欄・赤字表示を選べます。問題、解答、一覧の形式も切り替え可能です。",
  },
] as const;

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
      title: `${displayTitle}の単語テスト印刷・PDF作成`,
      description: `${displayTitle}の単語リストから、A4の単語テスト、解答プリント、単語一覧PDFを作成できます。範囲指定、英語空欄、日本語空欄、ランダム順にも対応。${countText}`,
      keywords: ["単語テスト 印刷", "単語テスト PDF", "英単語プリント", "小テスト 作成"],
    };
  }
  if (tab === "listen") {
    return {
      title: `${displayTitle}の聞き流し学習`,
      description: `${displayTitle}の単語を、英語から日本語、日本語から英語の順で聞き流しできます。速度や間隔を調整しながら、移動中や復習に使えます。${countText}`,
      keywords: ["英単語 聞き流し", "単語帳 音声", "英単語 復習"],
    };
  }
  if (tab === "quiz") {
    return {
      title: `${displayTitle}の単語チェック・4択練習`,
      description: `${displayTitle}の単語を、カード形式や4択クイズで確認できます。わからない単語にマークを付けて復習できます。${countText}`,
      keywords: ["英単語 クイズ", "単語チェック", "4択 英単語"],
    };
  }
  return null;
}

function WordbookPrintGuide({
  title,
  description,
  wordCount,
}: {
  title: string;
  description?: string | null;
  wordCount: number;
}) {
  const countText = wordCount ? `${wordCount.toLocaleString()}語` : "選んだ範囲";
  const intro =
    description?.trim() ||
    `${title}の単語を、必要な範囲だけ選んで単語テストや学習プリントにできます。`;

  return (
    <section className="mx-auto max-w-6xl px-2.5 pb-8 sm:px-5 sm:pb-12" aria-label={`${title}の単語テスト印刷について`}>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-7">
        <p className="text-xs font-black text-blue-700">単語帳別の単語テスト印刷</p>
        <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{title}の単語テストを印刷</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {intro} Vocab Print Proでは、{countText}から開始番号・終了番号・問題数を選び、A4で印刷しやすい問題・解答・一覧プリントを作成できます。
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-900">範囲を選んで印刷</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">授業や小テストに合わせて、使う番号の範囲と問題数を設定できます。</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-900">問題・解答・一覧に対応</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">英語・日本語の空欄、赤字、ランダム順など学習目的に合わせて切り替えられます。</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-900">印刷前にレイアウト確認</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">日付・氏名欄・ページ番号を調整し、実際のA4レイアウトを確認してから印刷できます。</p>
          </div>
        </div>

        <div className="mt-6 border-t pt-5">
          <h3 className="text-base font-black text-slate-900">{title}の単語テスト印刷でよくある質問</h3>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600">
            <details className="rounded-xl border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer font-bold text-slate-800">{PRINT_FAQ[0].question}</summary>
              <p className="mt-2">{PRINT_FAQ[0].answer}</p>
            </details>
            <details className="rounded-xl border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer font-bold text-slate-800">{PRINT_FAQ[1].question}</summary>
              <p className="mt-2">{PRINT_FAQ[1].answer}</p>
            </details>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-3 text-sm font-bold">
          <Link href="/guides/word-test-generator" className="text-blue-700 hover:text-blue-900 hover:underline">英単語テストの作り方</Link>
          <Link href="/guides/wordbooks-for-printing" className="text-blue-700 hover:text-blue-900 hover:underline">単語帳別プリントの使い方</Link>
          <Link href="/wordbooks" className="text-blue-700 hover:text-blue-900 hover:underline">ほかの単語帳を探す</Link>
        </nav>
      </div>
    </section>
  );
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
  const primarySeoTab = tab === "overview" ? "test" : tab;
  const tabSeo = displayTitle ? buildTabSeo(displayTitle, wordCount, primarySeoTab) : null;
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

export default async function WordbookDetailPage({ params, searchParams }: PageProps) {
  const { id: slug } = await params;
  const tab = normalizeSeoTab((await searchParams)?.tab);
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
      ...(tab === "test"
        ? [
            {
              "@type": "FAQPage",
              "@id": `${siteUrl}${canonicalPath}?tab=test#faq`,
              mainEntity: PRINT_FAQ.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <WordbookDetailClient />
      {tab === "test" && displayTitle ? (
        <WordbookPrintGuide
          title={displayTitle}
          description={book?.description}
          wordCount={wordCount}
        />
      ) : null}
    </>
  );
}
