// 忘却曲線に沿った復習スケジュール（間隔反復）。
// 各単語は「箱(box)」を持ち、正解すると箱が上がって次の復習までの間隔が伸びる。不正解は箱0に戻る。
// 記憶度は エビングハウスの忘却曲線 R = exp(-経過日数 / 安定度) で推定する。
// 保存先は端末のlocalStorage（ユーザー×単語帳ごと）。

export type WordRecord = {
  box: number; // 0..7
  last: number; // 最後に解いた時刻(ms)
  due: number; // 次に復習したい時刻(ms)
  seen: number;
  right: number;
  wrong: number;
};
export type BookProgress = Record<string, WordRecord>;

const DAY = 86_400_000;
// box 0 は「間違えた/新規」で10分後、以降 1,2,4,7,15,30,60日。
export const BOX_INTERVAL_DAYS = [10 / 1440, 1, 2, 4, 7, 15, 30, 60];
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;
// 「間隔が来た時点で記憶度が約90%」になるよう安定度を決める（-ln0.9 ≒ 0.105）。
const STABILITY_FACTOR = 1 / -Math.log(0.9);

export function wordKey(word: { no: number; english: string }) {
  return `${word.no}-${word.english}`;
}

export function progressStorageKey(userId: string, bookId: string) {
  return `vpp-srs-v1:${userId}:${bookId}`;
}

export function loadProgress(userId: string, bookId: string): BookProgress {
  try {
    const raw = window.localStorage.getItem(progressStorageKey(userId, bookId));
    const parsed = raw ? (JSON.parse(raw) as BookProgress) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProgress(userId: string, bookId: string, progress: BookProgress) {
  try {
    window.localStorage.setItem(progressStorageKey(userId, bookId), JSON.stringify(progress));
  } catch {
    // 容量超過などは無視（学習自体は止めない）
  }
}

export function applyAnswer(record: WordRecord | undefined, correct: boolean, now = Date.now()): WordRecord {
  const base: WordRecord = record ?? { box: 0, last: now, due: now, seen: 0, right: 0, wrong: 0 };
  const box = correct ? Math.min(MAX_BOX, base.box + 1) : 0;
  return {
    box,
    last: now,
    due: now + BOX_INTERVAL_DAYS[box] * DAY,
    seen: base.seen + 1,
    right: base.right + (correct ? 1 : 0),
    wrong: base.wrong + (correct ? 0 : 1),
  };
}

export function stabilityDays(record: WordRecord) {
  return Math.max(BOX_INTERVAL_DAYS[record.box], 10 / 1440) * STABILITY_FACTOR;
}

/** 時刻 at における推定記憶度 0..1（未学習は0）。 */
export function retention(record: WordRecord | undefined, at = Date.now()) {
  if (!record) return 0;
  const elapsedDays = Math.max(0, at - record.last) / DAY;
  return Math.exp(-elapsedDays / stabilityDays(record));
}

export type WordStatus = "new" | "learning" | "mastered";

export function statusOf(record: WordRecord | undefined, now = Date.now()): WordStatus {
  if (!record) return "new";
  return record.box >= 4 && retention(record, now) >= 0.7 ? "mastered" : "learning";
}

export type BookSummary = {
  total: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  dueCount: number;
  /** 全単語の平均記憶度 0..100（未学習は0として含む） */
  memoryPercent: number;
};

type Keyed = { no: number; english: string };

export function summarize(words: Keyed[], progress: BookProgress, now = Date.now()): BookSummary {
  let newCount = 0;
  let learningCount = 0;
  let masteredCount = 0;
  let dueCount = 0;
  let sum = 0;
  for (const word of words) {
    const record = progress[wordKey(word)];
    const status = statusOf(record, now);
    if (status === "new") newCount += 1;
    else if (status === "learning") learningCount += 1;
    else masteredCount += 1;
    if (record && record.due <= now) dueCount += 1;
    sum += retention(record, now);
  }
  return {
    total: words.length,
    newCount,
    learningCount,
    masteredCount,
    dueCount,
    memoryPercent: words.length ? Math.round((sum / words.length) * 100) : 0,
  };
}

/** 今日復習すべき単語（期限が来たもの。間違えた直後のものを先に）。 */
export function dueWords<T extends Keyed>(words: T[], progress: BookProgress, now = Date.now()): T[] {
  return words
    .filter((word) => {
      const record = progress[wordKey(word)];
      return Boolean(record) && record.due <= now;
    })
    .sort((a, b) => retention(progress[wordKey(a)], now) - retention(progress[wordKey(b)], now));
}

/** 今から days 日先まで復習しなかった場合の平均記憶度の予測（未学習は含めず、学習済みの語だけで平均）。 */
export function forecast(words: Keyed[], progress: BookProgress, days = 30, now = Date.now()) {
  const records = words.map((word) => progress[wordKey(word)]).filter(Boolean) as WordRecord[];
  const points: Array<{ day: number; percent: number }> = [];
  for (let day = 0; day <= days; day += 1) {
    const at = now + day * DAY;
    const avg = records.length ? records.reduce((sum, record) => sum + retention(record, at), 0) / records.length : 0;
    points.push({ day, percent: Math.round(avg * 100) });
  }
  return points;
}

/** 次に復習が必要になる時刻までの目安（日）。学習済みがなければ null。 */
export function nextDueInDays(words: Keyed[], progress: BookProgress, now = Date.now()) {
  let soonest = Infinity;
  for (const word of words) {
    const record = progress[wordKey(word)];
    if (record) soonest = Math.min(soonest, record.due);
  }
  return Number.isFinite(soonest) ? Math.max(0, (soonest - now) / DAY) : null;
}
