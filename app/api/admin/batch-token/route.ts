import { issuePdfBatchToken, requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const token = await issuePdfBatchToken();
  const callback = new URL(request.url).searchParams.get("callback");
  if (callback === "local") {
    const escaped = token.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>高速作成キー</title></head><body><p>高速作成を準備しています。</p><form id="handoff" method="post" action="http://127.0.0.1:43117/vocab-print-token"><input type="hidden" name="token" value="${escaped}"></form><script>document.getElementById("handoff").submit();<\/script></body></html>`;
    return new Response(html, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new Response(token, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vocab-print-pro-batch-token.txt"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
