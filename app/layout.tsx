import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "Vocab Print Pro",
  description: "単語帳から英単語テストとA4 PDF教材を作成できるWebサービス",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">
        <Nav />
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-white py-6 text-center text-xs text-slate-400">
          © 2026 Vocab Print Pro — 単語帳からA4 PDF教材を自動生成
        </footer>
      </body>
    </html>
  );
}
