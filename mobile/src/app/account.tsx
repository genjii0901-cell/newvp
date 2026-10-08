import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { APP_URL } from "../lib/api";
import { supabase } from "../lib/supabase";
import { colors } from "../ui/theme";

type Profile = { email?: string; plan?: string };

export default function AccountScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (!next) setProfile(null); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void fetch(`${APP_URL}/api/me/profile`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => response.ok ? response.json() as Promise<{ profile?: Profile }> : null)
      .then((data) => { if (active) setProfile(data?.profile || null); })
      .catch(() => { if (active) setMessage("プラン情報を取得できませんでした。"); });
    return () => { active = false; };
  }, [session]);

  async function authenticate(createAccount: boolean) {
    if (!supabase) return;
    if (!email.trim() || !password) { setMessage("メールアドレスとパスワードを入力してください。"); return; }
    setBusy(true);
    setMessage("");
    try {
      if (createAccount) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${APP_URL}/auth/confirm?next=/` } });
        if (error) throw error;
        setMessage(data.session ? "登録してログインしました。" : "確認メールを送りました。メール内のリンクで確認した後、アプリでログインしてください。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword("");
      }
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : "ログインできませんでした。";
      setMessage(raw.includes("Invalid login") ? "メールアドレスまたはパスワードを確認してください。" : raw.includes("Email not confirmed") ? "確認メール内のリンクを開いてからログインしてください。" : raw);
    } finally { setBusy(false); }
  }

  async function deleteAccount() {
    if (!session || !supabase) return;
    setBusy(true);
    try {
      const response = await fetch(`${APP_URL}/api/me/delete-account`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "削除できませんでした。");
      await supabase.auth.signOut();
      setMessage("アカウントを削除しました。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "削除できませんでした。");
    } finally { setBusy(false); }
  }

  if (!supabase) return <View style={styles.screen}><View style={styles.panel}><Text style={styles.title}>ログイン設定が必要です</Text><Text style={styles.body}>アプリの接続設定が未完了です。公開前に設定します。</Text></View></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {session ? <View style={styles.panel}>
      <Text style={styles.title}>アカウント</Text>
      <Text style={styles.body}>{profile?.email || session.user.email}</Text>
      <Text style={styles.plan}>利用プラン: {profile?.plan === "teacher" ? "Teacher" : profile?.plan === "personal" ? "Personal" : "Free"}</Text>
      <Pressable disabled={busy} onPress={() => { void supabase?.auth.signOut(); }} style={styles.secondary}><Text style={styles.secondaryText}>ログアウト</Text></Pressable>
      <Text style={styles.section}>アカウント管理</Text>
      <Text style={styles.note}>有料契約がある場合は、先に契約を終了してからアカウントを削除できます。</Text>
      <Pressable disabled={busy} onPress={() => Alert.alert("アカウントを削除", "単語帳などの保存データも削除されます。本当に削除しますか？", [{ text: "戻る", style: "cancel" }, { text: "削除する", style: "destructive", onPress: () => { void deleteAccount(); } }])} style={styles.delete}><Text style={styles.deleteText}>アカウントを削除</Text></Pressable>
    </View> : <View style={styles.panel}>
      <Text style={styles.title}>ログイン・新規登録</Text>
      <Text style={styles.body}>Web版と同じアカウントを使えます。</Text>
      <TextInput accessibilityLabel="メールアドレス" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="メールアドレス" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={styles.input} />
      <View style={styles.passwordRow}><TextInput accessibilityLabel="パスワード" autoCapitalize="none" secureTextEntry={!showPassword} placeholder="パスワード" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} style={styles.passwordInput} /><Pressable accessibilityRole="button" onPress={() => setShowPassword(!showPassword)}><Text style={styles.toggle}>{showPassword ? "隠す" : "表示"}</Text></Pressable></View>
      <Pressable disabled={busy} onPress={() => { void authenticate(false); }} style={styles.primary}><Text style={styles.primaryText}>ログイン</Text></Pressable>
      <Pressable disabled={busy} onPress={() => { void authenticate(true); }} style={styles.secondary}><Text style={styles.secondaryText}>無料で新規登録</Text></Pressable>
      <Text style={styles.note}>新規登録後は確認メールが届きます。メールを確認してからログインしてください。</Text>
    </View>}
    {busy ? <ActivityIndicator color={colors.blue} style={{ marginTop: 18 }} /> : null}
    {message ? <Text style={styles.message}>{message}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 40 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 18 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink }, body: { color: colors.muted, marginTop: 8, lineHeight: 22 },
  input: { height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 13, marginTop: 22, color: colors.ink },
  passwordRow: { height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 7, marginTop: 10, paddingHorizontal: 13, flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, color: colors.ink }, toggle: { color: colors.blue, fontWeight: "700" },
  primary: { minHeight: 48, backgroundColor: colors.blue, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { color: "white", fontWeight: "800" }, secondary: { minHeight: 48, backgroundColor: colors.paleBlue, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryText: { color: colors.blue, fontWeight: "800" }, note: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 17 },
  message: { color: colors.ink, backgroundColor: colors.paleBlue, borderRadius: 7, padding: 14, marginTop: 15 }, plan: { color: colors.blue, fontWeight: "700", marginTop: 14 },
  section: { color: colors.ink, fontWeight: "800", marginTop: 32 }, delete: { borderTopWidth: 1, borderColor: colors.line, paddingVertical: 17, marginTop: 10 }, deleteText: { color: colors.red, fontWeight: "700" },
});
