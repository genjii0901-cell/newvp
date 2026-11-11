import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金プラン・Personal 7日間アクセス380円／Teacher",
  description:
    "Vocab Print Proの料金プラン。印刷は1ページ50円の都度購入、Personal、塾・学校向けのTeacher。Personalは7日間アクセス380円、以降は月1,580円で自動更新します。Teacherは月3,980円（税込）、年間プランもあります。",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Vocab Print Proの料金プラン",
    description: "Personalは7日間アクセス380円、以降月1,580円。Teacherは月3,980円。都度購入は1ページ50円です。",
    url: "/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
