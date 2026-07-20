"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
    display: flex;
    flex-direction: column;
    align-items: center;
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
    font-size: 13pt;
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
    font-size: 9.4pt;
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
    font-size: 8.6pt;
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
      margin: 5mm;
    }

    html,
    body {
      width: auto;
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
      display: block;
    }

    .paper-preview {
      width: auto;
      min-width: 0;
      padding: 0;
      transform: none !important;
    }

    .paper-preview-shell {
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      transform: none !important;
    }

    .paper-preview {
      width: 100% !important;
    }

    .paper-preview .print-page {
      width: auto !important;
      /* 高さは内容＋min-heightで用紙いっぱいに。固定280/296mmだと端末の余白で溢れて2枚目が出るため。 */
      height: auto !important;
      max-height: none !important;
      overflow: hidden !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
      border: 0 !important;
      box-shadow: none !important;
      display: flex !important;
      flex-direction: column !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: always !important;
      break-after: page !important;
    }

    .paper-preview .print-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }

    /* グリッドは内容ぶんの高さ（潰れない・強制的に伸ばさない）。min-heightで無理に埋めると
       端末の印刷可能領域を超えてフッター(created by)が2枚目に押し出されるため、自然高さにする。 */
    .paper-preview .print-grid {
      flex: 0 0 auto !important;
      min-height: 0 !important;
    }

    /* min-heightでの強制フィルはしない。端末差は行の高さだけで調整（溢れ防止を最優先）。 */
    .plat-ios .paper-preview .print-table td { height: 9mm !important; max-height: 9mm !important; }
    .plat-ios .paper-preview .print-table th { height: 8mm !important; max-height: 8mm !important; }
    .plat-ios .paper-preview .has-info .print-table td { height: 8.4mm !important; max-height: 8.4mm !important; }
    .plat-ios .paper-preview .has-info .print-table th { height: 7.6mm !important; max-height: 7.6mm !important; }

    .plat-wide .paper-preview .print-table td { height: 9.5mm !important; max-height: 9.5mm !important; }
    .plat-wide .paper-preview .print-table th { height: 8.5mm !important; max-height: 8.5mm !important; }
    .plat-wide .paper-preview .has-info .print-table td { height: 9mm !important; max-height: 9mm !important; }
    .plat-wide .paper-preview .has-info .print-table th { height: 7.8mm !important; max-height: 7.8mm !important; }
  }
`;

export default function PrintPage() {
  const router = useRouter();
  const [job, setJob] = useState<PrintJob | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(1060);
  // iOS(Safari)は印刷可能領域が狭く、Android/PCは広い。端末で用紙いっぱいの高さを変える。
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const iOSLike = /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(iOSLike);
  }, []);

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
    if (!job?.title) return;
    const previousTitle = document.title;
    document.title = job.title;
    return () => {
      document.title = previousTitle;
    };
  }, [job?.title]);

  // プレビューを囲む .paper-wrap の実際の内寸（padding を除いた幅）を測ってから縮尺を決める。
  // window.innerWidth ベースだと sheet / paper-wrap の余白ぶんはみ出して margin:auto が効かず、
  // iPad などで左寄せになってしまうため。
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const cs = window.getComputedStyle(el);
      const pad = parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
      setAvailableWidth(Math.max(200, el.clientWidth - pad));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [job]);

  const previewNaturalWidth = 794;
  const previewNaturalHeight = 1123;
  const previewScale = Math.min(1, Math.max(0.28, availableWidth / previewNaturalWidth));
  const previewPageCount = Math.max(1, job?.html.match(/class=["']print-page/g)?.length ?? 1);

  return (
    <main className={`sheet ${isIOS ? "plat-ios" : "plat-wide"}`}>
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
        <div className="paper-wrap" ref={wrapRef}>
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
