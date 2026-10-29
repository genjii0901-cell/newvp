import { redirect } from "next/navigation";

// 聞き流しは単語帳ページ内のタブに統合した。旧URLは単語帳一覧（または選択済みの単語帳）へ転送する。
// 旧実装は legacy-backup-20261030/listening-page.tsx.bak に残してある。
export default async function ListeningRedirect({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : "";
  if (id && /^[\w-]{1,64}$/.test(id)) {
    redirect(params.source === "my" ? `/my-wordbooks` : `/wordbooks/${encodeURIComponent(id)}?tab=listen`);
  }
  redirect("/wordbooks");
}
