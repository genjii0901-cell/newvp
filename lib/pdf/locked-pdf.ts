const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_W_MM = 192;
const PAGE_H_MM = 280;
const PAGE_X_MM = 9;
const PAGE_Y_MM = 9;

type LockedPdfOptions = {
  ownerPassword?: string;
  lockEditing?: boolean;
  maxPages?: number;
  optimizeSize?: boolean;
};

function randomOwnerPassword() {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createLockedPdfBlob(
  fullDocHtml: string,
  allowPrint = true,
  options: LockedPdfOptions = {}
): Promise<Blob> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;height:2000px;border:none;background:white;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) throw new Error("PDF出力用の画面を準備できませんでした。");

    doc.open();
    doc.write(fullDocHtml);
    doc.close();

    const pdfFixStyle = doc.createElement("style");
    // html2canvas can crop the lower half of Japanese glyphs when line-clamp,
    // flex centering and overflow clipping are combined. The table cell remains
    // the clipping boundary, so raster output can safely use ordinary blocks.
    pdfFixStyle.textContent = `
      .print-table th, .print-table td { vertical-align:middle!important; }
      .p-fit {
        padding:.35mm 1.05mm!important;
        overflow:visible!important;
        align-items:center!important;
      }
      .p-text {
        display:block!important;
        overflow:visible!important;
        line-height:1.28!important;
        padding:.12em 0 .2em!important;
        -webkit-line-clamp:unset!important;
        line-clamp:unset!important;
      }
    `;
    doc.head?.appendChild(pdfFixStyle);

    await new Promise((resolve) => setTimeout(resolve, 450));
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* ignore */ }
    }

    const allPages = Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
    const pages = options.maxPages ? allPages.slice(0, Math.max(1, options.maxPages)) : allPages;
    if (pages.length === 0) throw new Error("PDFにするページが見つかりませんでした。");

    const lockEditing = options.lockEditing ?? true;
    const ownerPassword = options.ownerPassword?.trim() || randomOwnerPassword();
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      ...(lockEditing
        ? {
            encryption: {
              userPassword: "",
              ownerPassword,
              userPermissions: allowPrint ? ["print"] : [],
            },
          }
        : {}),
    });

    for (let i = 0; i < pages.length; i += 1) {
      const optimizeSize = options.optimizeSize === true;
      const canvas = await html2canvas(pages[i], {
        scale: optimizeSize ? 2 : 2.25,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        removeContainer: true,
        windowWidth: Math.ceil(pages[i].scrollWidth || pages[i].clientWidth || 726),
        windowHeight: Math.ceil(pages[i].scrollHeight || pages[i].clientHeight || 1058),
      });
      const imageFormat = optimizeSize ? "JPEG" : "PNG";
      const imgData = optimizeSize ? canvas.toDataURL("image/jpeg", 0.88) : canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(imgData, imageFormat, PAGE_X_MM, PAGE_Y_MM, PAGE_W_MM, PAGE_H_MM, undefined, optimizeSize ? "MEDIUM" : "FAST");
      void A4_WIDTH_MM;
      void A4_HEIGHT_MM;
    }

    return pdf.output("blob");
  } finally {
    try { iframe.remove(); } catch { /* ignore */ }
  }
}

export async function createRenderedPageImageBlob(fullDocHtml: string): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1300px;border:none;background:white;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) throw new Error("画像出力用の画面を準備できませんでした。");
    doc.open();
    doc.write(fullDocHtml);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (doc.fonts?.ready) {
      try { await doc.fonts.ready; } catch { /* ignore */ }
    }
    const page = doc.querySelector<HTMLElement>(".print-page");
    if (!page) throw new Error("画像にする先頭ページが見つかりませんでした。");
    const canvas = await html2canvas(page, {
      scale: 2.2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      removeContainer: true,
      windowWidth: Math.ceil(page.scrollWidth || page.clientWidth || 726),
      windowHeight: Math.ceil(page.scrollHeight || page.clientHeight || 1058),
    });
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像データを作成できませんでした。")), "image/png");
    });
  } finally {
    try { iframe.remove(); } catch { /* ignore */ }
  }
}

export async function downloadLockedPdf(
  fullDocHtml: string,
  fileName: string,
  allowPrint = true,
  options: LockedPdfOptions = {}
): Promise<void> {
  const blob = await createLockedPdfBlob(fullDocHtml, allowPrint, options);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
