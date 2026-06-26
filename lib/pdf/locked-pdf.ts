// クライアント専用: 印刷HTMLを画像化し、Adobeと同じ「ロック（暗号化・権限制限）」を
// かけたPDFを生成してダウンロードする。
// - 文字を画像化するので Adobe Acrobat で文字編集・コピーができない
// - さらに owner password + 権限制限（印刷のみ許可・編集/コピー不可）をかける
//
// 100%の防御ではない（スクショ/OCR/専用ツールで突破は可能）が、
// 一般的な編集・コピーを強力に抑止する。

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
// previewCss の .print-page は 192mm×280mm、余白 9mm/9mm/8mm。
const PAGE_W_MM = 192;
const PAGE_H_MM = 280;
const PAGE_X_MM = 9;
const PAGE_Y_MM = 9;

function randomOwnerPassword() {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param fullDocHtml previewCss を適用済みの完全なHTML文字列（#print-root と .print-page を含む）
 * @param fileName ダウンロードファイル名（.pdf 付き）
 * @param allowPrint 印刷を許可するか（true=印刷のみ可・編集/コピー不可）
 */
export async function downloadLockedPdf(
  fullDocHtml: string,
  fileName: string,
  allowPrint = true
): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // オフスクリーンのiframeに原寸でレンダリング
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;height:2000px;border:none;background:white;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) throw new Error("iframe document を作成できませんでした。");

    doc.open();
    doc.write(fullDocHtml);
    doc.close();

    // フォント・レイアウト確定を待つ
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* ignore */ }
    }

    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
    if (pages.length === 0) throw new Error("印刷ページが見つかりませんでした。");

    const ownerPassword = randomOwnerPassword();
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      encryption: {
        userPassword: "", // 誰でも開ける（パスワード不要）
        ownerPassword, // 権限変更には不明なパスワードが必要
        // 列挙したものだけ許可。print のみ → 編集・コピー・注釈は不可。
        userPermissions: allowPrint ? ["print"] : [],
      },
    });

    for (let i = 0; i < pages.length; i += 1) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: 820,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage("a4", "portrait");
      // 余白位置に原寸で配置（A4内の正しい位置を再現）
      pdf.addImage(imgData, "JPEG", PAGE_X_MM, PAGE_Y_MM, PAGE_W_MM, PAGE_H_MM, undefined, "FAST");
      void A4_WIDTH_MM;
      void A4_HEIGHT_MM;
    }

    pdf.save(fileName);
  } finally {
    try { iframe.remove(); } catch { /* ignore */ }
  }
}
