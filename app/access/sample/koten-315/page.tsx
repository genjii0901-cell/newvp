import type { Metadata } from "next";
import SamplePortal from "../sample-portal";

export const metadata: Metadata = {
  title: "古典単語315 購入者用ページのサンプル | Vocab Print Pro",
  robots: { index: false, follow: false },
};

export default function Koten315SamplePage() {
  return (
    <SamplePortal
      accent="indigo"
      bookId="31"
      description="古典単語315を使っている方が、古語と意味を聞き、苦手を確認し、授業や定期テスト用のプリントを作れる購入者用ページの見本です。"
      noteHref="/note/k315-7xq9m-vpnote-42f8"
      title="古典単語315 専用ページ"
      words={[[1, "あからさまなり", "明らかだ"], [2, "あさまし", "驚きあきれる"], [3, "ありがたし", "めったにない"], [4, "いみじ", "はなはだしい"], [5, "をかし", "趣がある"]]}
    />
  );
}
