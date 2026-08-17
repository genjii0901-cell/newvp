import type { Metadata } from "next";
import SamplePortal from "../sample-portal";

export const metadata: Metadata = {
  title: "システム英単語 購入者用ページのサンプル | Vocab Print Pro",
  robots: { index: false, follow: false },
};

export default function SystemEitangoSamplePage() {
  return (
    <SamplePortal
      accent="blue"
      bookId="84"
      description="システム英単語を使っている方が、範囲を選んで印刷し、聞き流しと単語チェックまで進められる購入者用ページの見本です。"
      noteHref="/note/system-eitango"
      title="システム英単語 専用ページ"
      words={[[1, "achieve", "達成する"], [2, "benefit", "利益、恩恵"], [3, "challenge", "挑戦、課題"], [4, "develop", "発展させる"], [5, "essential", "不可欠な"]]}
    />
  );
}
