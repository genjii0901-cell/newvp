import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // This old Note-only URL remains valid. Its former client-only unlock is
  // intentionally retired in favor of the server-validated license portal.
  return NextResponse.redirect(new URL("/access/koten-315", request.url), 307);
}
