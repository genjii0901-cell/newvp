const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
const ALPHABET_RE = /[A-Za-z]/;

function pickVoice(lang: string, voiceHint?: "male" | "female") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  const candidates = voices.filter((voice) => voice.lang.toLowerCase() === lang.toLowerCase());
  const prefixCandidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const pool = candidates.length ? candidates : prefixCandidates;
  if (voiceHint && pool.length > 1) {
    const hinted = pool.find((voice) => {
      const name = voice.name.toLowerCase();
      if (voiceHint === "female") return /female|woman|girl|haruka|kyoko|nanami|sayaka/.test(name);
      return /male|man|boy|otoya|ichiro|takumi|keita/.test(name);
    });
    if (hinted) return hinted;
    return voiceHint === "female" ? pool[0] : pool[1] ?? pool[0];
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

export function speakText(
  text: string,
  options: {
    preferred?: "english" | "japanese";
    lang?: string;
    rate?: number;
    voiceHint?: "male" | "female";
    signal?: { stopped: boolean };
  } = {}
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(false);
  }

  const value = text.trim();
  if (options.signal?.stopped) return Promise.resolve(false);
  if (!value) return Promise.resolve(true);

  const lang = options.lang ?? guessSpeechLang(value, options.preferred ?? "japanese");
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = lang;
  utterance.rate = options.rate ?? (lang === "en-US" ? 0.9 : 0.95);
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
