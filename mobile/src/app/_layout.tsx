import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../ui/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ title: "Vocab Print Pro" }} />
        <Stack.Screen name="wordbooks/[id]" options={{ title: "単語帳" }} />
        <Stack.Screen name="account" options={{ title: "アカウント" }} />
      </Stack>
    </>
  );
}
