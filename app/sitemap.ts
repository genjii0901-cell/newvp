import type { MetadataRoute } from "next";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { buildWordbookPath } from "@/lib/wordbook-slug";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";

async function loadSitemapWordbooks() {
  if (!isSupabaseServerConfigured()) return fallbackOfficialWordbooksForApi();
  try {
    const result = await loadOfficialWordbooks({ includeWords: false });
    if (result.ok && result.wordbooks.length > 0) return result.wordbooks;
  } catch {
    // Sitemap should never fail just because the database is unavailable.
  }
  return fallbackOfficialWordbooksForApi();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const paths = [
    "",
    "/wordbooks",
    "/guides/word-test-generator",
    "/guides/wordbooks-for-printing",
    "/pricing",
    "/legal/terms",
    "/legal/privacy",
    "/legal/tokushoho",
  ];
  const basePages = paths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));

  const wordbooks = await loadSitemapWordbooks();
  const wordbookUrls = wordbooks.flatMap((book) => {
    const path = buildWordbookPath(book.id, book.title);
    return [
      {
        url: `${siteUrl}${path}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.78,
      },
      {
        url: `${siteUrl}${path}?tab=test`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.9,
      },
      {
        url: `${siteUrl}${path}?tab=listen`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.68,
      },
      {
        url: `${siteUrl}${path}?tab=quiz`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.68,
      },
    ];
  });

  return [...basePages, ...wordbookUrls];
}
