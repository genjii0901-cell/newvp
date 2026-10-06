import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金プラン・Personal初回7日間380円",
  description:
    "Vocab Print Proの料金プラン。印刷は1ページ50円の都度購入、またはPersonal。Personalは初回7日間380円、その後月1,580円で自動更新します。",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Vocab Print Proの料金プラン",
    description: "Personalは初回7日間380円、その後月1,580円。都度購入は1ページ50円です。",
    url: "/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
