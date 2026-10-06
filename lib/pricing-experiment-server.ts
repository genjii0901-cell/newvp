import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function recordPricingPurchase(sessionId: string, variant: unknown, amount: unknown) {
  if (variant !== "choice" && variant !== "personal") return;
  if (!sessionId.startsWith("cs_")) return;

  const supabase = getSupabaseAdmin();
  const amountJpy = Number(amount);
  const rows = [{ key: `pricing_exp:v1:paid:${sessionId}`, value: variant }];
  if (Number.isSafeInteger(amountJpy) && amountJpy > 0) {
    rows.push({ key: `pricing_exp:v1:amount:${sessionId}`, value: `${variant}:${amountJpy}` });
  }
  const { error } = await supabase.from("app_settings").upsert(rows, {
    onConflict: "key",
    ignoreDuplicates: true,
  });
  if (error) console.error("Pricing experiment purchase logging failed", error.message);
}
