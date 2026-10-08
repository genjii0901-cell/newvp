import { Platform } from "react-native";

let configured = false;

export async function storePurchases(userId: string) {
  const key = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY :
    Platform.OS === "android" ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : undefined;
  if (!key) return null;
  const Purchases = (await import("react-native-purchases")).default;
  if (!configured) {
    Purchases.configure({ apiKey: key });
    configured = true;
  }
  await Purchases.logIn(userId);
  return Purchases;
}
