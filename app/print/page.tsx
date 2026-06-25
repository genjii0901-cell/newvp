"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PrintJob = {
  html: string;
  title: string;
  sourceLabel: string;
  createdAt: string;
};

const printJobCss = `
  :root {
    color-scheme: light;
  }

  body {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: "Yu Gothic", "Meiryo", sans-serif;
  }

  .sheet {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 20px 40px;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .title {
    font-size: 28px;
    font-weight: 900;
    margin: 0;
  }

  .sub {
    margin: 8px 0 0;
    color: #475569;
    font-size: 14px;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn {
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #0f172a;
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn.primary {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }

  .paper-wrap {
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  }

  .paper-preview {
    min-width: 920px;
    padding: 12px;
    transform-origin: top left;
  }

  @media print {
    body {
      background: white;
    }

    .sheet {
      max-width: none;
      padding: 0;
    }

    .toolbar {
      display: none;
    }

    .paper-wrap {
      border: none;
      box-shadow: none;
      overflow: visible;
    }

    .paper-preview {
      min-width: 0;
      padding: 0;
    }
  }
`;

export default function PrintPage() {
  const [job, setJob] = useState<PrintJob | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("vpp-print-job");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PrintJob;
      if (typeof parsed?.html === "string") {
        setJob(parsed);
        window.setTimeout(() => window.print(), 400);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  return (
    <main className="sheet">
      <style jsx global>{printJobCss}</style>

      <div className="toolbar">
        <div>
          <h1 className="title">単語テスト</h1>
          <p className="sub">
            ここから印刷ダイアログを開けます。
          </p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => window.print()} className="btn primary">
            印刷ダイアログを開く
          </button>
          <Link href="/" className="btn">
            戻る
          </Link>
        </div>
      </div>

      {!job ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="font-bold">印刷データがありません。</p>
          <p className="mt-2 text-sm text-slate-500">
            先にトップの「単語テストを作成」ボタン、または管理者画面の「PDF作成へ送る」を使ってください。
          </p>
        </div>
      ) : (
        <div className="paper-wrap">
          <div className="paper-preview" dangerouslySetInnerHTML={{ __html: job.html }} />
        </div>
      )}
    </main>
  );
}
