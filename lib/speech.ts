const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
const ALPHABET_RE = /[A-Za-z]/;

function pickVoice(lang: "en-US" | "ja-JP") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ??
    undefined
  );
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
    rate?: number;
    signal?: { stopped: boolean };
  } = {}
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(false);
  }

  const value = text.trim();
  if (!value || options.signal?.stopped) return Promise.resolve(true);

  const lang = guessSpeechLang(value, options.preferred ?? "japanese");
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = lang;
  utterance.rate = options.rate ?? (lang === "en-US" ? 0.9 : 0.95);
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;

  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    window.speechSynthesis.speak(utterance);

    window.setTimeout(() => finish(true), Math.max(1200, value.length * (lang === "en-US" ? 120 : 170)));
  });
}
