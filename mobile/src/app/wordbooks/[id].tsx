import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { APP_URL, coverUrl, loadWordbooks, type Word, type Wordbook } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { colors } from "../../ui/theme";

type Mode = "overview" | "cards" | "quiz" | "listen";

function choicesFor(words: Word[], current: Word): string[] {
  const others = words.filter((word) => word.no !== current.no && word.japanese !== current.japanese);
  const offset = Math.max(0, words.findIndex((word) => word.no === current.no));
  const distractors = [others[offset % others.length], others[(offset + 7) % others.length], others[(offset + 17) % others.length]]
    .filter(Boolean).map((word) => word.japanese);
  return [...new Set([current.japanese, ...distractors])].sort((a, b) => a.localeCompare(b, "ja"));
}

export default function WordbookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [book, setBook] = useState<Wordbook | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [mode, setMode] = useState<Mode>("overview");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const runRef = useRef(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) return;
      try {
        setError("");
        const summary = (await loadWordbooks(id))[0];
        if (!summary) throw new Error("単語帳が見つかりません。");
        if (!active) return;
        setBook(summary);
        if (summary.requiredPlan !== "free") {
          const session = await supabase?.auth.getSession();
          const token = session?.data.session?.access_token;
          if (!token) { setLocked(true); return; }
          const profileResponse = await fetch(`${APP_URL}/api/me/profile`, { headers: { Authorization: `Bearer ${token}` } });
          const profile = await profileResponse.json() as { profile?: { plan?: string } };
          if (!profileResponse.ok || !["personal", "teacher"].includes(profile.profile?.plan || "")) { setLocked(true); return; }
        }
        const detail = (await loadWordbooks(id, true))[0];
        if (active) setWords((detail?.words || []).filter((word) => word.english && word.japanese));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "読み込みに失敗しました。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; runRef.current += 1; void Speech.stop(); };
  }, [id]);

  const current = words[index];
  const choices = useMemo(() => current ? choicesFor(words, current) : [], [current, words]);

  function next() {
    setIndex((value) => (value + 1) % words.length);
    setFlipped(false);
    setSelected(null);
  }

  function stopAudio() {
    runRef.current += 1;
    setSpeaking(false);
    void Speech.stop();
  }

  function playWord() {
    if (!current) return;
    stopAudio();
    const run = runRef.current;
    setSpeaking(true);
    Speech.speak(current.english, {
      language: /[a-z]/i.test(current.english) ? "en-US" : "ja-JP",
      rate: 0.9,
      onDone: () => {
        if (run !== runRef.current) return;
        Speech.speak(current.japanese, {
          language: "ja-JP",
          rate: 0.9,
          onDone: () => { if (run === runRef.current) setSpeaking(false); },
          onError: () => { if (run === runRef.current) setSpeaking(false); },
        });
      },
      onError: () => { if (run === runRef.current) setSpeaking(false); },
    });
  }

  if (loading) return <ActivityIndicator color={colors.blue} size="large" style={{ marginTop: 64 }} />;
  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (!book) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        {coverUrl(book.coverImage) ? <Image alt={`${book.title}の表紙`} source={{ uri: coverUrl(book.coverImage)! }} resizeMode="cover" style={styles.cover} /> : null}
        <View style={{ flex: 1 }}><Text style={styles.title}>{book.title}</Text><Text style={styles.meta}>{book.wordCount.toLocaleString()}語 · {book.requiredPlan === "free" ? "無料" : "Personal"}</Text></View>
      </View>
      <View style={styles.tabs}>
        {([ ["overview", "概要"], ["cards", "カード"], ["quiz", "4択"], ["listen", "聞き流し"] ] as const).map(([value, label]) => (
          <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => { stopAudio(); setMode(value); setSelected(null); }} style={[styles.tab, mode === value && styles.tabActive]}><Text style={[styles.tabText, mode === value && styles.tabTextActive]}>{label}</Text></Pressable>
        ))}
      </View>

      {mode === "overview" ? <View style={styles.panel}><Text style={styles.sectionTitle}>この単語帳</Text><Text style={styles.body}>{book.description || "単語をカードや4択で確認し、音声で復習できます。"}</Text><Text style={styles.helper}>上のタブから学習方法を選んでください。</Text></View> : null}
      {locked && mode !== "overview" ? <View style={styles.panel}><Text style={styles.sectionTitle}>Personal対象の単語帳</Text><Text style={styles.body}>学習にはPersonalまたはTeacherの利用権が必要です。現在のアカウントでログインしてください。</Text></View> : null}
      {!locked && mode !== "overview" && words.length === 0 ? <View style={styles.panel}><Text style={styles.body}>学習できる単語がありません。</Text></View> : null}
      {!locked && current && mode !== "overview" ? <View style={styles.panel}>
        <Text style={styles.progress}>{index + 1} / {words.length}</Text>
        {mode === "cards" ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="カードを裏返す" onPress={() => setFlipped(!flipped)} style={styles.flashcard}>
            <Text style={styles.cardLabel}>{flipped ? "意味" : "単語"}</Text>
            <Text style={styles.cardWord}>{flipped ? current.japanese : current.english}</Text>
            <Text style={styles.flipHint}>タップして{flipped ? "単語" : "意味"}を見る</Text>
          </Pressable>
          <View style={styles.actions}><Action label="もう一度" onPress={() => setFlipped(false)} secondary /><Action label="覚えた · 次へ" onPress={next} /></View>
        </> : null}
        {mode === "quiz" ? <>
          <Text style={styles.question}>{current.english}</Text>
          <Text style={styles.prompt}>意味を選んでください</Text>
          {choices.map((choice) => <Pressable key={choice} disabled={selected !== null} onPress={() => { setSelected(choice); if (choice === current.japanese) setCorrect((value) => value + 1); }} style={[styles.choice, selected === choice && (choice === current.japanese ? styles.correct : styles.incorrect)]}><Text style={styles.choiceText}>{choice}</Text></Pressable>)}
          {selected !== null ? <><Text style={styles.feedback}>{selected === current.japanese ? "正解" : `正解: ${current.japanese}`}</Text><Action label="次の問題" onPress={next} /></> : null}
          <Text style={styles.helper}>このセッションの正解数: {correct}</Text>
        </> : null}
        {mode === "listen" ? <>
          <Text style={styles.question}>{current.english}</Text><Text style={styles.translation}>{current.japanese}</Text>
          <View style={styles.actions}><Action label={speaking ? "停止" : "英語と意味を再生"} onPress={speaking ? stopAudio : playWord} /><Action label="次の単語" onPress={() => { stopAudio(); next(); }} secondary /></View>
          <Text style={styles.helper}>端末の音声で読み上げます。再生が終わってから次に進みます。</Text>
        </> : null}
      </View> : null}
    </ScrollView>
  );
}

function Action({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, secondary && styles.actionSecondary]}><Text style={[styles.actionText, secondary && styles.actionSecondaryText]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 40 },
  center: { padding: 24 }, error: { color: colors.red },
  summary: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 14 },
  cover: { width: 63, height: 84, borderRadius: 4, backgroundColor: colors.paleBlue },
  title: { color: colors.ink, fontWeight: "800", fontSize: 19, lineHeight: 27 }, meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  tabs: { flexDirection: "row", marginTop: 16, backgroundColor: colors.surface, borderRadius: 7, padding: 3, borderWidth: 1, borderColor: colors.line },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 5 }, tabActive: { backgroundColor: colors.paleBlue },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.muted }, tabTextActive: { color: colors.blue },
  panel: { backgroundColor: colors.surface, borderRadius: 8, padding: 18, borderWidth: 1, borderColor: colors.line, marginTop: 15 },
  sectionTitle: { color: colors.ink, fontWeight: "800", fontSize: 17 }, body: { color: colors.ink, lineHeight: 24, marginTop: 12 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  progress: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  flashcard: { minHeight: 260, justifyContent: "center", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.line, marginTop: 14, padding: 22, backgroundColor: colors.background },
  cardLabel: { color: colors.blue, fontWeight: "800", fontSize: 12 }, cardWord: { fontSize: 27, color: colors.ink, fontWeight: "800", textAlign: "center", marginTop: 14, lineHeight: 38 }, flipHint: { color: colors.muted, fontSize: 12, marginTop: 22 },
  actions: { flexDirection: "row", gap: 8, marginTop: 16 }, action: { flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", paddingHorizontal: 8, borderRadius: 7, backgroundColor: colors.blue },
  actionSecondary: { backgroundColor: colors.paleBlue }, actionText: { color: "white", fontWeight: "700", textAlign: "center" }, actionSecondaryText: { color: colors.blue },
  question: { color: colors.ink, fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: 32, marginBottom: 12 }, prompt: { color: colors.muted, textAlign: "center", marginBottom: 22 },
  choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 14, marginBottom: 9 }, choiceText: { color: colors.ink, lineHeight: 22 },
  correct: { borderColor: colors.green, backgroundColor: "#e8f7f0" }, incorrect: { borderColor: colors.red, backgroundColor: "#fff0f1" }, feedback: { color: colors.ink, fontWeight: "700", marginTop: 4 },
  translation: { color: colors.muted, fontSize: 20, textAlign: "center", lineHeight: 30, marginTop: 10 },
});
