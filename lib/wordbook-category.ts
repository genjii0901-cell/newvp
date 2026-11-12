// メイン画面の欄分け（英語／古文・国語／多言語）。公式単語帳には分類がないため題名で判定する。
// みんなの単語帳の subject（英語・国語・多言語・その他）があればそれを優先する。

export type ShelfCategory = "english" | "japanese" | "languages";

const JAPANESE_PATTERN = /古文|古典|漢文|古語|国語|現代文|漢字|四字熟語|ことわざ|慣用句/;
const LANGUAGES_PATTERN = /多言語|中国語|韓国語|ハングル|フランス語|ドイツ語|スペイン語|イタリア語|ロシア語|ポルトガル語|ベトナム語|タイ語|インドネシア語|アラビア語/;

export function wordbookShelfCategory(book: { title: string; subject?: string | null }): ShelfCategory {
  if (book.subject === "国語") return "japanese";
  if (book.subject === "多言語") return "languages";
  if (book.subject === "英語") return "english";
  if (JAPANESE_PATTERN.test(book.title)) return "japanese";
  if (LANGUAGES_PATTERN.test(book.title)) return "languages";
  return "english";
}
