import { createSign } from "crypto";

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type SearchConsoleRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type SearchConsoleReport = {
  configured: boolean;
  message: string;
  periodLabel?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  queries?: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
};

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function readCredentials(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ServiceAccountCredentials;
    return parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    return null;
  }
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function getAccessToken(credentials: ServiceAccountCredentials) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: tokenUri,
      iat: now,
      exp: now + 60 * 60,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claimSet}`);
  signer.end();
  const privateKey = credentials.private_key?.replace(/\\n/g, "\n") ?? "";
  const assertion = `${header}.${claimSet}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || "Google Search Console authentication failed.");
  }
  return body.access_token;
}

export async function loadSearchConsoleReport(): Promise<SearchConsoleReport> {
  const credentials = readCredentials();
  if (!credentials) {
    return {
      configured: false,
      message: "Google検索語を表示するには、Search Console用サービスアカウントの環境変数を設定してください。",
    };
  }

  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 89);
    const propertyUrl = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.vocabprint.com")
      .replace(/\/$/, "") + "/";
    const accessToken = await getAccessToken(credentials);
    const response = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: dateKey(startDate),
          endDate: dateKey(endDate),
          dimensions: ["query"],
          rowLimit: 10,
          dataState: "final",
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    const body = (await response.json().catch(() => ({}))) as {
      rows?: SearchConsoleRow[];
      responseAggregationType?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message || "Google Search Console query failed.");
    }

    const queries = (body.rows ?? []).map((row) => ({
      query: row.keys?.[0] || "(not provided)",
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    }));
    const clicks = queries.reduce((sum, item) => sum + item.clicks, 0);
    const impressions = queries.reduce((sum, item) => sum + item.impressions, 0);

    return {
      configured: true,
      message: "Google Search Consoleの検索語を表示しています。反映には数日かかることがあります。",
      periodLabel: `${dateKey(startDate)} - ${dateKey(endDate)}`,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: queries.length > 0 ? queries.reduce((sum, item) => sum + item.position, 0) / queries.length : 0,
      queries,
    };
  } catch (error) {
    return {
      configured: false,
      message: error instanceof Error ? `Google Search Consoleの取得に失敗しました: ${error.message}` : "Google Search Consoleの取得に失敗しました。",
    };
  }
}
