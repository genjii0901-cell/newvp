import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type LicenseKind = "wordbook" | "personal";

export type LicenseEntitlement = {
  id: string;
  productSlug: string;
  wordbookId: string | null;
  kind: LicenseKind;
  expiresAt: string | null;
};

type LicenseRow = {
  id: string;
  product_slug: string;
  wordbook_id: string | number | null;
  entitlement_kind: string;
  expires_at: string | null;
};

export function isLicenseSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /license_(products|codes|entitlements)|schema cache|relation .* does not exist/i.test(message);
}

export async function getLicenseEntitlements(userId: string): Promise<LicenseEntitlement[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("license_entitlements")
    .select("id,product_slug,wordbook_id,entitlement_kind,expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) throw error;

  return ((data ?? []) as LicenseRow[])
    .filter((item) => item.entitlement_kind === "wordbook" || item.entitlement_kind === "personal")
    .map((item) => ({
      id: item.id,
      productSlug: item.product_slug,
      wordbookId: item.wordbook_id == null ? null : String(item.wordbook_id),
      kind: item.entitlement_kind as LicenseKind,
      expiresAt: item.expires_at,
    }));
}

export function hasPersonalLicense(entitlements: LicenseEntitlement[]) {
  return entitlements.some((item) => item.kind === "personal");
}

export function hasWordbookLicense(entitlements: LicenseEntitlement[], wordbookId: unknown) {
  const id = String(wordbookId ?? "");
  return entitlements.some((item) => item.kind === "wordbook" && item.wordbookId === id);
}
