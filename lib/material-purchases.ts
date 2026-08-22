import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MaterialPurchase = {
  purchase_type: "asset" | "wordbook";
  asset_id: string | null;
  wordbook_id: string | null;
  amount_jpy: number;
  status: string;
};

export function isMaterialPurchaseSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error ?? "");
  return /material_purchases|schema cache|relation .* does not exist/i.test(message);
}

export async function recordMaterialPurchase({
  userId,
  stripeSessionId,
  purchaseType,
  assetId,
  wordbookId,
  amountJpy,
}: {
  userId: string;
  stripeSessionId: string;
  purchaseType: "asset" | "wordbook";
  assetId?: string | null;
  wordbookId?: string | null;
  amountJpy: number;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("material_purchases").upsert({
    user_id: userId,
    stripe_session_id: stripeSessionId,
    purchase_type: purchaseType,
    asset_id: assetId ?? null,
    wordbook_id: wordbookId ?? null,
    amount_jpy: amountJpy,
    status: "paid",
  }, { onConflict: "stripe_session_id" });
  if (error) throw error;
}

export async function getMaterialPurchases(userId: string): Promise<MaterialPurchase[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("material_purchases")
    .select("purchase_type,asset_id,wordbook_id,amount_jpy,status")
    .eq("user_id", userId)
    .eq("status", "paid");
  if (error) throw error;
  return (data ?? []) as MaterialPurchase[];
}

export async function canAccessMaterial(userId: string, assetId: string, wordbookId: string | null) {
  const purchases = await getMaterialPurchases(userId);
  return purchases.some((purchase) =>
    (purchase.purchase_type === "asset" && purchase.asset_id === assetId) ||
    (purchase.purchase_type === "wordbook" && Boolean(wordbookId) && purchase.wordbook_id === wordbookId)
  );
}
