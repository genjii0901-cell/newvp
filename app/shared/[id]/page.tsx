import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCommunityWordbooks } from "@/lib/community-wordbooks";
import WordbookDetailClient from "@/app/wordbooks/[id]/wordbook-detail-client";

type Props = { params: Promise<{ id: string }> };

async function getBook(id: string) {
  if (!/^\d+$/.test(id) && !/^[0-9a-f-]{36}$/i.test(id) && !/^sample-(english|japanese|spanish)$/.test(id)) return null;
  try {
    return (await loadCommunityWordbooks({ id }))[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return { title: "共有単語帳", robots: { index: false } };
  return {
    title: `${book.title} | みんなの単語帳`,
    description: `${book.creator}さんの${book.subject}の単語帳。${book.wordCount}語をカード・4択・聞き流しで学習できます。${book.description}`.slice(0, 160),
    alternates: { canonical: `/shared/${encodeURIComponent(id)}` },
    openGraph: { title: book.title, description: book.description, images: [book.coverImage] },
  };
}

export default async function SharedWordbookPage({ params }: Props) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();
  const reportSubject = encodeURIComponent(`共有単語帳の報告: ${book.title}`);
  const reportBody = encodeURIComponent(`対象: https://www.vocabprint.com/shared/${id}\n内容: `);
  return <>
    <WordbookDetailClient bookIdOverride={id} preservePath source="community" />
    <p className="mx-auto max-w-6xl px-4 pb-10 text-right text-xs text-slate-500">
      <a href={`mailto:vocabprint@gmail.com?subject=${reportSubject}&body=${reportBody}`} className="underline hover:text-blue-700">この単語帳を報告する</a>
    </p>
  </>;
}
