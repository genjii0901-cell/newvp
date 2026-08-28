import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金プラン・7日間無料のPersonalプラン",
  description:
    "Vocab Print Proの料金プラン。Freeは透かし付きで単語テスト印刷を試せます。Personalは月額780円、初回7日間無料で、透かしなし印刷・語数制限なし・単語帳保存・苦手単語管理を利用できます。",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Vocab Print Proの料金プラン",
    description: "Freeで試して、Personalは初回7日間無料。単語テスト印刷と学習機能をまとめて利用できます。",
    url: "/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
