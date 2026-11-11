const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
const ALPHABET_RE = /[A-Za-z]/;

// 声の質を点数にして、こもった古い合成音声より、自然で聞き取りやすい声を優先する。
function voiceScore(voice: SpeechSynthesisVoice, lang: string) {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase().replace("_", "-") === lang.toLowerCase()) score += 20;
  // ニューラル（自然）音声: Edge の「Online (Natural)」、Google、Apple の高品質版など
  if (/natural|neural|online/.test(name)) score += 100;
  if (/premium|enhanced|siri/.test(name)) score += 80;
  if (/google/.test(name)) score += 60;
  if (/aria|jenny|guy|nanami|keita|kyoko|samantha|ava|daniel|serena|o-ren|otoya/.test(name)) score += 15;
  // こもって聞こえやすい古い・軽量の音声は後回し
  if (/compact|espeak|festival|pico/.test(name)) score -= 80;
  if (/microsoft (david|zira|mark|haruka|ichiro|sayaka)/.test(name) && !/natural|online/.test(name)) score -= 30;
  if (voice.localService === false) score += 10;
  return score;
}

function pickVoice(lang: string, voiceHint?: "male" | "female") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  const exact = voices.filter((voice) => voice.lang.toLowerCase().replace("_", "-") === lang.toLowerCase());
  const pool = (exact.length ? exact : voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix)))
    .slice()
    .sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang));
  if (voiceHint && pool.length > 1) {
    const hinted = pool.find((voice) => {
      const name = voice.name.toLowerCase();
      if (voiceHint === "female") return /female|woman|girl|haruka|kyoko|nanami|sayaka|aria|jenny|samantha|ava|serena/.test(name);
      return /male|man|boy|otoya|ichiro|takumi|keita|guy|daniel|david/.test(name);
    });
    if (hinted) return hinted;
  }
  return pool[0] ?? undefined;
}

export function guessSpeechLang(text: string, preferred: "english" | "japanese") {
  const trimmed = text.trim();
  if (!trimmed) return preferred === "english" ? "en-US" : "ja-JP";
  if (preferred === "english" && ALPHABET_RE.test(trimmed) && !JAPANESE_RE.test(trimmed)) return "en-US";
  return "ja-JP";
}

export function primeSpeechVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
}

// 声の一覧は読み込みが遅れることがある。空のままだと既定の（こもった）声になるので少し待つ。
function waitForVoices(): Promise<void> {
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 800);
    synth.addEventListener("voiceschanged", done);
  });
}

export function speakText(
  text: string,
  options: {
    preferred?: "english" | "japanese";
    lang?: string;
    rate?: number;
    voiceHint?: "male" | "female";
    signal?: { stopped: boolean };
    voicesWaited?: boolean;
  } = {}
): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(false);
  }

  const value = text.trim();
  if (options.signal?.stopped) return Promise.resolve(false);
  if (!value) return Promise.resolve(true);

  if (!options.voicesWaited && window.speechSynthesis.getVoices().length === 0) {
    return waitForVoices().then(() => speakText(value, { ...options, voicesWaited: true }));
  }
  const lang = options.lang ?? guessSpeechLang(value, options.preferred ?? "japanese");
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = lang;
  utterance.rate = options.rate ?? (lang === "en-US" ? 0.9 : 0.95);
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = pickVoice(lang, options.voiceHint);
  if (voice) utterance.voice = voice;

  return new Promise<boolean>((resolve) => {
    let done = false;
    let cancellationPoll: number | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(watchdog);
      window.clearInterval(cancellationPoll);
      resolve(ok);
    };

    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    // Only onend confirms completion; an estimated duration must not skip live audio.
    const watchdog = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      finish(false);
    }, Math.max(30_000, value.length * 800 / Math.max(utterance.rate, 0.1)));
    if (options.signal) {
      cancellationPoll = window.setInterval(() => {
        if (options.signal?.stopped) finish(false);
      }, 100);
    }
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish(false);
    }
  });
}
