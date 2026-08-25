import { requireAdmin, issueAdminToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const token = issueAdminToken("local-pdf-catalog-batch", true);
  return new Response(token, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vocab-print-pro-batch-token.txt"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
