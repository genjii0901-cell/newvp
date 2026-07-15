const REDIRECT_BASE = "https://local.invalid";

export function normalizeLocalRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  // Browsers normalize backslashes as URL separators in some contexts. Reject
  // them, as well as control characters, before parsing.
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/";

  try {
    const parsed = new URL(value, REDIRECT_BASE);
    if (parsed.origin !== REDIRECT_BASE) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
