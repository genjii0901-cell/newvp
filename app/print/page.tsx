"use client";

import { useRouter } from "next/navigation";
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
    padding: 16px;
  }

  .paper-preview {
    width: max-content;
    min-width: 0;
    padding: 0;
    transform-origin: top left;
  }

  .paper-preview-shell {
    transform-origin: top left;
    margin: 0 auto;
    overflow: hidden;
  }

  @media (max-width: 640px) {
    .sheet { padding: 12px 8px 28px; }
    .paper-wrap { padding: 8px; }
  }

  .paper-preview #print-root {
    display: block;
  }

  .paper-preview .print-page {
    width: 192mm;
    height: 280mm;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    font-family: "Yu Gothic", "Meiryo", sans-serif;
    color: #111;
    background: white;
    display: flex;
    flex-direction: column;
    padding-bottom: 1mm;
    margin: 9mm 9mm 8mm;
    border: 1px solid #e2e8f0;
  }

  .paper-preview .print-page-header {
    position: relative;
    text-align: center;
    margin-bottom: 4mm;
    flex: 0 0 auto;
  }

  .paper-preview .print-page-header h1 {
    margin: 0;
    font-size: 12pt;
    font-weight: 900;
    letter-spacing: .04em;
  }

  .paper-preview .print-date {
    position: absolute;
    right: 0;
    top: 0;
    font-size: 7.5pt;
    color: #333;
    font-weight: 600;
    line-height: 1.2;
  }

  .paper-preview .print-note {
    margin: -1mm 0 3mm;
    text-align: center;
    font-size: 8.5pt;
    color: #7c2d12;
  }

  .paper-preview .print-watermark {
    position: absolute;
    inset: -20% -20%;
    z-index: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: center;
    transform: rotate(-30deg);
    pointer-events: none;
    user-select: none;
  }

  .paper-preview .print-watermark .wm-row {
    white-space: nowrap;
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: .18em;
    color: rgba(37, 99, 235, .08);
  }

  .paper-preview .print-page-header,
  .paper-preview .print-note,
  .paper-preview .print-grid,
  .paper-preview .print-info-box,
  .paper-preview footer {
    position: relative;
    z-index: 1;
  }

  .paper-preview .print-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 6.5mm;
    align-items: start;
    flex: 1 1 0;
    min-height: 0;
  }

  .paper-preview .print-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 8.4pt;
    line-height: 1.2;
  }

  .paper-preview .print-table th,
  .paper-preview .print-table td {
    border: .65pt solid #111;
    padding: 0;
    height: 9.5mm;
    max-height: 9.5mm;
    overflow: hidden;
    vertical-align: middle;
  }

  .paper-preview .print-table th {
    height: 8.5mm;
    text-align: center;
    font-weight: 800;
    background: #fff;
  }

  .paper-preview .has-info .print-table {
    font-size: 7.8pt;
  }

  .paper-preview .has-info .print-table td {
    height: 9.0mm;
    max-height: 9.0mm;
  }

  .paper-preview .has-info .print-table th {
    height: 8.0mm;
    max-height: 8.0mm;
  }

  .paper-preview .p-no {
    width: 10%;
    text-align: center;
  }

  .paper-preview .p-word {
    width: 26%;
  }

  .paper-preview .p-meaning {
    width: 64%;
  }

  .paper-preview .p-fit {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: .8mm 1.05mm;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .paper-preview .p-fit.center {
    justify-content: center;
    text-align: center;
  }

  .paper-preview .p-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .paper-preview .p-text.one {
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .paper-preview .p-text.two {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .paper-preview .p-blank {
    display: inline-block;
    width: 100%;
    min-width: 22mm;
    border-bottom: 1.2pt solid #111;
    transform: translateY(-.5mm);
  }

  .paper-preview .p-red {
    color: #dc2626;
    font-weight: 800;
  }

  .paper-preview .print-info-box {
    flex: 0 0 auto;
    margin-top: 8mm;
    background: white;
  }

  .paper-preview .print-info-fields {
    display: flex;
    gap: 3mm;
    align-items: flex-end;
  }

  .paper-preview .pif {
    display: flex;
    align-items: baseline;
    gap: 1.5mm;
    border-bottom: .75pt solid #111;
    padding-bottom: 1mm;
    padding-top: .5mm;
  }

  .paper-preview .pif-sm {
    flex: 0 0 26mm;
  }

  .paper-preview .pif-lg {
    flex: 1 1 auto;
  }

  .paper-preview .pif-label {
    flex: 0 0 auto;
    font-size: 6.8pt;
    font-weight: 800;
    white-space: nowrap;
    color: #333;
  }

  .paper-preview .pif-value {
    flex: 1 1 auto;
    font-size: 8.2pt;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .paper-preview footer {
    flex: 0 0 auto;
    margin-top: 9mm;
    height: 6mm;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: end;
    font-size: 7.5pt;
    color: #555;
    background: white;
  }

  .paper-preview footer span:nth-child(2) {
    text-align: center;
  }

  .paper-preview footer span:nth-child(3) {
    text-align: right;
    word-break: break-word;
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: 9mm 9mm 8mm 9mm;
    }

    html,
    body {
      width: 210mm;
      min-height: 0;
      height: auto;
      background: white;
    }

    body > nav,
    body > footer {
      display: none !important;
    }

    .sheet {
      max-width: none;
      margin: 0;
      padding: 0;
    }

    .toolbar {
      display: none;
    }

    .paper-wrap {
      border: none;
      box-shadow: none;
      overflow: visible;
      padding: 0;
    }

    .paper-preview {
      width: auto;
      min-width: 0;
      padding: 0;
      transform: none !important;
      margin: 0 auto !important;
    }

    .paper-preview-shell {
      width: auto !important;
      height: auto !important;
      transform: none !important;
      margin: 0 auto !important;
      overflow: visible !important;
    }

    .paper-preview #print-root {
      position: static !important;
      left: auto !important;
      top: auto !important;
      width: 192mm !important;
      margin: 0 auto !important;
    }

    .paper-preview .print-page {
      width: 192mm !important;
      height: 280mm !important;
      margin: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: always !important;
      break-after: page !important;
    }

    .paper-preview .print-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  }
`;

export default function PrintPage() {
  const router = useRouter();
  const [job, setJob] = useState<PrintJob | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1100);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  function openPrintDialog() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  useEffect(() => {
    const raw = sessionStorage.getItem("vpp-print-job");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PrintJob;
      if (typeof parsed?.html === "string") {
        setJob(parsed);
        window.setTimeout(openPrintDialog, 900);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const previewNaturalWidth = 794;
  const previewNaturalHeight = 1123;
  const previewScale = Math.min(1, Math.max(0.28, (viewportWidth - 40) / previewNaturalWidth));
  const previewPageCount = Math.max(1, job?.html.match(/class=["']print-page/g)?.length ?? 1);

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
          <button type="button" onClick={openPrintDialog} className="btn primary">
            印刷ダイアログを開く
          </button>
          <button type="button" onClick={goBack} className="btn">
            戻る
          </button>
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
          <div
            className="paper-preview-shell"
            style={{
              width: previewNaturalWidth * previewScale,
              minHeight: previewNaturalHeight * previewScale * previewPageCount,
            }}
          >
            <div
              className="paper-preview"
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                WebkitUserSelect: "none",
                userSelect: "none",
                transform: `scale(${previewScale})`,
              }}
              dangerouslySetInnerHTML={{ __html: job.html }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
