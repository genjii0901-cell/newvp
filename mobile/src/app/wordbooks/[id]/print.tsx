import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { APP_URL, loadWordbooks, type Word, type Wordbook } from "../../../lib/api";
import { storePurchases } from "../../../lib/purchases";
import { supabase } from "../../../lib/supabase";
import { colors } from "../../../ui/theme";

type Format = "list" | "english" | "japanese";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function printHtml(title: string, words: Word[], format: Format) {
  const pages = Array.from({ length: Math.ceil(words.length / 50) }, (_, page) => words.slice(page * 50, (page + 1) * 50));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; } * { box-sizing: border-box; }
    html, body { margin: 0; color: #172139; font-family: sans-serif; }
    .page { width: 186mm; height: 273mm; break-after: page; page-break-after: always; overflow: hidden; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    h1 { font-size: 16pt; margin: 0 0 7mm; } .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: 9pt; }
    td { height: 9.1mm; border-bottom: 1px solid #9ba5b6; overflow: hidden; vertical-align: middle; word-break: break-word; }
    td:first-child { width: 11mm; font-size: 8pt; } td:nth-child(2) { width: 34%; padding-right: 2mm; }
    .foot { margin-top: 4mm; text-align: right; font-size: 8pt; color: #657189; }
  </style></head><body>${pages.map((pageWords, pageIndex) => `<section class="page"><h1>${escapeHtml(title)}</h1><div class="columns">${[pageWords.slice(0, 25), pageWords.slice(25, 50)].map((column) => `<table><tbody>${column.map((word) => `<tr><td>${escapeHtml(word.label || word.no)}</td><td>${format === "english" ? "" : escapeHtml(word.english)}</td><td>${format === "japanese" ? "" : escapeHtml(word.japanese)}</td></tr>`).join("")}</tbody></table>`).join("")}</div><div class="foot">${pageIndex + 1} / ${pages.length} · Created by Vocab Print Pro</div></section>`).join("")}</body></html>`;
}

export default function PrintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [book, setBook] = useState<Wordbook | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [format, setFormat] = useState<Format>("japanese");
  const [startText, setStartText] = useState("1");
  const [endText, setEndText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [price, setPrice] = useState("");
  const [storeReady, setStoreReady] = useState(false);
  const [paid, setPaid] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const range = useMemo(() => {
    const start = Number(startText);
    const end = endText ? Number(endText) : Math.min(words.length, 1000);
    const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start && end <= words.length;
    return { valid, words: valid ? words.slice(start - 1, end) : [] };
  }, [words, startText, endText]);
  const pages = Math.ceil(range.words.length / 50);

  const token = useCallback(async () => {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    return data.session;
  }, []);

  const refreshAccess = useCallback(async () => {
    const session = await token();
    if (!session) { setSignedIn(false); setPaid(false); setLoaded(true); return false; }
    setSignedIn(true);
    try {
      const response = await fetch(`${APP_URL}/api/mobile/access`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json() as { paid?: boolean; message?: string };
      if (!response.ok) throw new Error(result.message || "購入状態を確認できませんでした。");
      setPaid(result.paid === true);
      if (!result.paid) {
        const store = await storePurchases(session.user.id);
        if (store) {
          const offerings = await store.getOfferings();
          const monthly = offerings.current?.availablePackages.find((item) => item.packageType === "MONTHLY");
          setStoreReady(Boolean(monthly));
          setPrice(monthly?.product.priceString || "");
        } else setStoreReady(false);
      }
      return result.paid === true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "購入状態を確認できませんでした。"); }
    finally { setLoaded(true); }
    return false;
  }, [token]);

  useEffect(() => {
    if (!id) return;
    void loadWordbooks(id, true).then(([item]) => { setBook(item || null); setWords(item?.words || []); }).catch(() => setMessage("単語帳を読み込めませんでした。"));
  }, [id]);

  useFocusEffect(useCallback(() => {
    void Promise.resolve().then(refreshAccess);
  }, [refreshAccess]));

  async function purchase(restore = false) {
    const session = await token();
    if (!session) { router.push("/account"); return; }
    setBusy(true); setMessage("");
    try {
      const store = await storePurchases(session.user.id);
      if (!store) throw new Error("アプリ内課金は準備中です。ストア設定の完了後にご利用ください。");
      if (restore) await store.restorePurchases();
      else {
        const offering = (await store.getOfferings()).current;
        const selected = offering?.availablePackages.find((item) => item.packageType === "MONTHLY");
        if (!selected) throw new Error("現在購入できるプランがありません。");
        await store.purchasePackage(selected);
      }
      const active = await refreshAccess();
      if (!active) setMessage("購入の反映を確認中です。少し待ってから「購入状態を再確認」を押してください。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "購入を完了できませんでした。"); }
    finally { setBusy(false); }
  }

  async function perform(action: "print" | "csv") {
    const session = await token();
    if (!session) { router.push("/account"); return; }
    setBusy(true); setMessage("");
    try {
      const check = await fetch(`${APP_URL}/api/mobile/access`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const access = await check.json() as { paid?: boolean; message?: string };
      if (!check.ok) throw new Error(access.message || "購入状態を確認できませんでした。");
      if (!access.paid) { setPaid(false); throw new Error("この機能には有料プランが必要です。"); }
      if (action === "print") {
        if (!range.valid || !book) throw new Error("印刷範囲を確認してください。");
        if (pages > 20) throw new Error("1回の印刷は20ページまでです。範囲を狭めてください。");
        await Print.printAsync({ html: printHtml(book.title, range.words, format) });
      } else {
        const response = await fetch(`${APP_URL}/api/mobile/csv?id=${encodeURIComponent(id || "")}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message || "CSVを作成できませんでした。"); }
        const file = new File(Paths.cache, `vocabprint-${id}.csv`);
        file.write(await response.text());
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "CSVを保存・共有" });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "処理を完了できませんでした。"); }
    finally { setBusy(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{book?.title || "単語帳"}</Text>
    <Text style={styles.caption}>印刷・CSV出力</Text>
    {book ? <Text style={styles.body}>全{words.length}語 · 選択範囲{range.words.length}語 · 約{pages}ページ</Text> : null}
    <View style={styles.panel}>
      <Text style={styles.heading}>印刷形式</Text>
      {([["japanese", "日本語を空欄にする"], ["english", "英語を空欄にする"], ["list", "単語一覧"]] as const).map(([value, label]) =>
        <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: format === value }} onPress={() => setFormat(value)} style={[styles.option, format === value && styles.selected]}><Text style={styles.body}>{format === value ? "● " : "○ "}{label}</Text></Pressable>)}
      <Text style={[styles.heading, { marginTop: 18 }]}>印刷範囲</Text>
      <View style={styles.rangeRow}><TextInput accessibilityLabel="開始位置" keyboardType="number-pad" value={startText} onChangeText={setStartText} style={styles.rangeInput} /><Text style={styles.body}>から</Text><TextInput accessibilityLabel="終了位置" keyboardType="number-pad" value={endText} onChangeText={setEndText} placeholder={String(Math.min(words.length, 1000))} style={styles.rangeInput} /><Text style={styles.body}>まで</Text></View>
      {!range.valid && words.length ? <Text style={styles.error}>1から{words.length}の範囲で指定してください。</Text> : null}
      <Text style={styles.note}>印刷ダイアログでPDF保存も選べます。アプリ版の詳細レイアウト設定は順次追加します。</Text>
    </View>
    {!loaded ? <ActivityIndicator color={colors.blue} /> : paid ? <View style={styles.panel}>
      <Text style={styles.heading}>有料プラン利用中</Text>
      <Pressable disabled={busy || !range.valid || pages > 20} onPress={() => { void perform("print"); }} style={styles.primary}><Text style={styles.white}>印刷する</Text></Pressable>
      {pages > 20 ? <Text style={styles.note}>1回20ページまでです。印刷範囲を狭めてください。</Text> : null}
      <Pressable disabled={busy} onPress={() => { void perform("csv"); }} style={styles.secondary}><Text style={styles.blue}>CSVを出力</Text></Pressable>
    </View> : <View style={styles.panel}>
      <Text style={styles.heading}>印刷とCSV出力は有料プラン</Text>
      <Text style={styles.body}>カード・4択・聞き流し・共有は無料で使えます。</Text>
      {!signedIn ? <Pressable onPress={() => router.push("/account")} style={styles.primary}><Text style={styles.white}>ログイン・新規登録</Text></Pressable> : storeReady ? <><Pressable disabled={busy} onPress={() => { void purchase(); }} style={styles.primary}><Text style={styles.white}>ストアでプランを見る{price ? ` (${price})` : ""}</Text></Pressable><Pressable disabled={busy} onPress={() => { void purchase(true); }} style={styles.secondary}><Text style={styles.blue}>購入を復元</Text></Pressable></> : <Text style={styles.note}>アプリ内課金のストア設定は準備中です。</Text>}
      {signedIn ? <Pressable disabled={busy} onPress={() => { void refreshAccess(); }} style={styles.secondary}><Text style={styles.blue}>購入状態を再確認</Text></Pressable> : null}
    </View>}
    {busy ? <ActivityIndicator color={colors.blue} /> : null}
    {message ? <Text style={styles.error}>{message}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" }, caption: { color: colors.blue, fontWeight: "700", marginTop: 5 },
  body: { color: colors.ink, lineHeight: 23, marginTop: 8 }, panel: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 16, marginTop: 16 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: "800" }, option: { padding: 10, borderRadius: 6, marginTop: 8 }, selected: { backgroundColor: colors.paleBlue },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }, rangeInput: { width: 72, borderWidth: 1, borderColor: colors.line, borderRadius: 6, color: colors.ink, paddingHorizontal: 9, paddingVertical: 9, textAlign: "center" },
  note: { color: colors.muted, lineHeight: 19, fontSize: 12, marginTop: 12 }, primary: { backgroundColor: colors.blue, padding: 14, borderRadius: 7, alignItems: "center", marginTop: 16 }, secondary: { backgroundColor: colors.paleBlue, padding: 14, borderRadius: 7, alignItems: "center", marginTop: 10 },
  white: { color: "white", fontWeight: "800" }, blue: { color: colors.blue, fontWeight: "800" }, error: { color: colors.red, marginTop: 16 },
});
