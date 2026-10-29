// 画面に出す単語帳の説明文の表記を整える。DBには「公式単語帳」と入っているが、画面では「人気の単語帳」と表示する。
export function popularizeText(value: string | null | undefined) {
  return (value ?? "").replace(/公式教材/g, "人気教材").replace(/公式単語帳/g, "人気の単語帳");
}
