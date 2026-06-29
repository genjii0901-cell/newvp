import { ImageResponse } from "next/og";

// SNS共有用のOGP画像（1200x630）。Vercel上にCJKフォントが無いため文言はASCIIで統一し、
// 文字化け（tofu）を避ける。日本語の訴求はメタデータの description 側で表示される。
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vocab Print Pro — word lists to printable A4 vocabulary tests";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #047857 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: "#ffffff",
              color: "#1e3a8a",
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            VP
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Vocab Print Pro</div>
        </div>

        <div style={{ marginTop: 48, fontSize: 70, fontWeight: 800, lineHeight: 1.1, maxWidth: 980 }}>
          Word lists into printable A4 vocabulary tests
        </div>

        <div style={{ marginTop: 28, fontSize: 34, color: "#cbd5e1", maxWidth: 940 }}>
          Vocabulary lists, quizzes & answer keys — ready to print. Free to start.
        </div>

        <div style={{ marginTop: "auto", fontSize: 30, fontWeight: 700, color: "#a7f3d0" }}>
          vocabprint.com
        </div>
      </div>
    ),
    { ...size }
  );
}
