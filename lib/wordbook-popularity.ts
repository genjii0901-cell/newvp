// 単語帳ごとの使用者数（印刷した会員の人数）を数え、記録漏れぶんを推定で補う。
//
// 印刷の記録（pdf_generations）には「どの単語帳か」が残っていないもの（wordbook_id が空）がある。
// その印刷をした人の数を、各単語帳に「実人数の割合」で配って補う。盛るための上乗せや乱数は使わない。
//
//   推定人数 = 実人数 + 単語帳不明の人数 × (その単語帳の実人数 ÷ 全単語帳の実人数の合計)
//
// 単語帳不明の人数 = 単語帳不明の印刷だけをした人の数（どこかの単語帳で数えられている人は足さない）。
// 実人数が多い単語帳ほど多く補われ、単語帳ごとに足す数が違うので、全部同じ数にはならない。

export type PopularityRow = { user_id: string | null; wordbook_id: string | null };

export type PopularityEntry = {
  /** 記録に残っている実際の人数 */
  actual: number;
  /** 記録漏れを補った推定人数（表示用） */
  estimated: number;
};

export function estimateWordbookPopularity(rows: PopularityRow[]): Record<string, PopularityEntry> {
  const usersByBook = new Map<string, Set<string>>();
  const attributedUsers = new Set<string>();
  const unattributedUsers = new Set<string>();

  for (const row of rows) {
    if (!row.user_id) continue;
    const bookId = row.wordbook_id ? String(row.wordbook_id).trim() : "";
    if (!bookId) {
      unattributedUsers.add(row.user_id);
      continue;
    }
    let users = usersByBook.get(bookId);
    if (!users) {
      users = new Set();
      usersByBook.set(bookId, users);
    }
    users.add(row.user_id);
    attributedUsers.add(row.user_id);
  }

  let unknownOnly = 0;
  for (const user of unattributedUsers) {
    if (!attributedUsers.has(user)) unknownOnly += 1;
  }

  let totalActual = 0;
  for (const users of usersByBook.values()) totalActual += users.size;

  const result: Record<string, PopularityEntry> = {};
  for (const [bookId, users] of usersByBook) {
    const actual = users.size;
    const share = totalActual > 0 ? actual / totalActual : 0;
    result[bookId] = { actual, estimated: actual + Math.round(unknownOnly * share) };
  }
  return result;
}

/** これ未満の推定人数は表示しない（「新着」などにする）。 */
export const POPULARITY_DISPLAY_MIN = 5;
