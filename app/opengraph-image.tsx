import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vocab Print Pro の共有カード画像";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #38bdf8 100%)",
          color: "#ffffff",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "#ffffff",
              color: "#1d4ed8",
              fontSize: 46,
              fontWeight: 800,
            }}
          >
            VP
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 42, fontWeight: 800 }}>Vocab Print Pro</div>
            <div style={{ fontSize: 22, color: "#dbeafe", marginTop: 6 }}>A4 vocabulary test generator</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 900, lineHeight: 1.1, maxWidth: 980 }}>
            単語帳から
            <div>英単語テストPDFを自動作成</div>
          </div>
          <div style={{ fontSize: 28, color: "#e2e8f0", maxWidth: 960, lineHeight: 1.4 }}>
            一覧・問題・解答のA4 PDFをすぐ作成。授業準備や受験学習のプリント作成に。
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 22,
              color: "#bfdbfe",
            }}
          >
            <div style={{ padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>無料で開始</div>
            <div style={{ padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>A4最適化</div>
            <div style={{ padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>授業向け</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#a7f3d0" }}>vocabprint.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
