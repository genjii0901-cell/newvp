const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
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

export async function downloadLockedPdf(
  fullDocHtml: string,
  fileName: string,
  allowPrint = true,
  options: { ownerPassword?: string; lockEditing?: boolean } = {}
): Promise<void> {
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
    pdfFixStyle.textContent = `
      .p-fit { padding-top:.45mm!important; padding-bottom:.45mm!important; }
      .p-text { line-height:1.12!important; padding-bottom:.25mm!important; }
      .print-table th, .print-table td { vertical-align:middle!important; }
    `;
    doc.head?.appendChild(pdfFixStyle);

    await new Promise((resolve) => setTimeout(resolve, 450));
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* ignore */ }
    }

    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
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
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: 820,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(imgData, "JPEG", PAGE_X_MM, PAGE_Y_MM, PAGE_W_MM, PAGE_H_MM, undefined, "FAST");
      void A4_WIDTH_MM;
      void A4_HEIGHT_MM;
    }

    pdf.save(fileName);
  } finally {
    try { iframe.remove(); } catch { /* ignore */ }
  }
}
