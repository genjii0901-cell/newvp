import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { coverUrl, loadWordbooks, type Wordbook } from "../lib/api";
import { colors } from "../ui/theme";

export default function CatalogScreen() {
  const [books, setBooks] = useState<Wordbook[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError("");
      setBooks(await loadWordbooks());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadWordbooks()
      .then((value) => { if (active) setBooks(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "読み込みに失敗しました。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => books.filter((book) => book.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [books, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>VOCAB PRINT PRO</Text>
            <Text style={styles.heading}>みんなの単語帳</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/account")} style={styles.accountButton}><Text style={styles.accountText}>アカウント</Text></Pressable>
        </View>
        <TextInput accessibilityLabel="単語帳を検索" placeholder="単語帳名で検索" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.search} />
        <Text style={styles.count}>{filtered.length}冊の単語帳</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: 48 }} /> : null}
      {!loading && error ? <View style={styles.notice}><Text style={styles.error}>{error}</Text><Pressable onPress={() => { setLoading(true); void refresh(); }}><Text style={styles.retry}>再読み込み</Text></Pressable></View> : null}
      {!loading && !error ? (
        <FlatList data={filtered} keyExtractor={(book) => book.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void refresh(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>該当する単語帳はありません。</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}を開く`} onPress={() => router.push({ pathname: "/wordbooks/[id]", params: { id: item.id } })} style={styles.book}>
            {coverUrl(item.coverImage) ? <Image alt={`${item.title}の表紙`} source={{ uri: coverUrl(item.coverImage)! }} resizeMode="cover" style={styles.cover} /> : <View style={[styles.cover, styles.coverFallback]}><Text style={styles.coverLetter}>V</Text></View>}
            <View style={styles.bookText}><Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.meta}>{item.wordCount.toLocaleString()}語  ·  {item.requiredPlan === "free" ? "無料" : "Personal"}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: { color: colors.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heading: { color: colors.ink, fontSize: 24, fontWeight: "800", marginTop: 3 },
  accountButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 6, backgroundColor: colors.paleBlue },
  accountText: { color: colors.blue, fontWeight: "700", fontSize: 13 },
  search: { height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 12, color: colors.ink, backgroundColor: colors.background, marginTop: 15 },
  count: { color: colors.muted, fontSize: 12, marginTop: 9 },
  list: { padding: 14, gap: 8, paddingBottom: 30 },
  book: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  cover: { width: 53, height: 68, borderRadius: 4, backgroundColor: colors.paleBlue },
  coverFallback: { justifyContent: "center", alignItems: "center" },
  coverLetter: { color: colors.blue, fontSize: 28, fontWeight: "900" },
  bookText: { flex: 1, minWidth: 0 },
  bookTitle: { color: colors.ink, fontWeight: "700", fontSize: 15, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  chevron: { color: colors.muted, fontSize: 28, marginRight: 4 },
  notice: { margin: 18, padding: 18, backgroundColor: colors.surface, borderRadius: 8 },
  error: { color: colors.red },
  retry: { marginTop: 12, color: colors.blue, fontWeight: "700" },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40 },
});
