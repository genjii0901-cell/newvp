import { revalidateTag } from "next/cache";
import { requireSupabaseUser } from "@/lib/supabase/admin";

// マイ単語帳の一覧（単語つき）は、ページを開くたびにSupabaseから全語を取り直すと通信量が大きい。
// 利用者ごとにサーバー側でキャッシュし、保存・編集・削除・公開のときに作り直す。
export const MY_WORDBOOKS_REVALIDATE_SECONDS = 60 * 60;

export function myWordbooksTag(userId: string) {
  return `my-wordbooks-${userId}`;
}

export function revalidateMyWordbooks(userId: string) {
  revalidateTag(myWordbooksTag(userId), { expire: 0 });
}

// 変更系のAPIを包み、成功したらその利用者のキャッシュを捨てる。
export function withMyWordbooksRevalidation(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const response = await handler(request.clone());
    if (response.ok) {
      const auth = await requireSupabaseUser(request).catch(() => null);
      if (auth && !auth.response) revalidateMyWordbooks(auth.user.id);
    }
    return response;
  };
}
