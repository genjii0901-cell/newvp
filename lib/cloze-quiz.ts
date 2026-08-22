export type ClozeWord = { no: number; english: string; japanese: string };
export type ClozeQuestion = {
  word: ClozeWord;
  sentence: string;
  choices: string[];
  answer: string;
  meaning: string;
};

export function isClozePilotBook(title: string) {
  return /英検3級.*パス単|英検1級.*単熟語EX/i.test(title);
}

export function isClozeEligibleWord(word: ClozeWord) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(word.english.trim());
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mainMeaning(value: string) {
  return value
    .replace(/^[\s\d.・、;:：\-]+/, "")
    .replace(/^[([{（【][^)\]}）】]{1,18}[)\]}）】]\s*/, "")
    .split(/[;；、，・]/)[0]
    .trim() || value.trim();
}

function wordKind(word: ClozeWord): "verb" | "adjective" | "adverb" | "preposition" | "noun" {
  const en = word.english.trim().toLowerCase();
  const ja = mainMeaning(word.japanese);
  if (/^(about|above|across|after|against|along|among|around|at|before|behind|below|beneath|beside|between|beyond|by|despite|during|except|for|from|in|inside|into|near|of|off|on|onto|opposite|outside|over|past|since|through|throughout|to|toward|under|until|up|upon|with|within|without)$/.test(en)) return "preposition";
  if (/ly$/.test(en) || /^(again|ago|almost|already|also|always|anyway|away|ever|far|fast|hard|here|however|just|later|maybe|never|now|often|once|quite|rather|really|sometimes|soon|still|then|there|today|together|too|usually|very|well|yet)$/.test(en) || /に$/.test(ja)) return "adverb";
  if (/的な$|な$|い$/.test(ja) || /^(be |become )/.test(en)) return "adjective";
  if (/する$|させる$|れる$|られる$|める$|える$|ける$|ぐ$|す$|つ$|ぬ$|ぶ$|む$|る$|う$/.test(ja)) return "verb";
  return "noun";
}

const JUNIOR_TEMPLATES = {
  verb: [
    "After school, the students decided to _____ together.",
    "Please _____ carefully before you answer the question.",
    "My teacher asked us to _____ during the class activity.",
  ],
  adjective: [
    "The students thought the new idea was very _____ .",
    "Everyone was surprised because the result was _____ .",
    "This book is _____ enough for young learners to enjoy.",
  ],
  adverb: [
    "The class listened _____ while the teacher explained the rule.",
    "She completed the school project _____ and checked it again.",
    "The team worked _____ to finish before the deadline.",
  ],
  noun: [
    "The students talked about _____ during today's lesson.",
    "Our teacher used _____ as the main topic of the class.",
    "We learned why _____ is important in everyday life.",
  ],
  preposition: [
    "The students finished the project _____ working together after school.",
    "A small library stands _____ the school and the community center.",
    "We talked about the plan _____ lunch with our teacher.",
  ],
} as const;

const ADVANCED_TEMPLATES = {
  verb: [
    "The committee decided to _____ the proposal before issuing its final report.",
    "Researchers must _____ the available evidence before drawing a conclusion.",
    "The new policy may _____ how institutions respond to future challenges.",
  ],
  adjective: [
    "Several independent reviewers considered the evidence _____ .",
    "The proposal appeared _____ despite the concerns raised by critics.",
    "The consequences of the decision were far more _____ than expected.",
  ],
  adverb: [
    "The organization responded _____ to the allegations made in the report.",
    "The findings were _____ interpreted by experts from different fields.",
    "The two institutions worked _____ to resolve the long-standing dispute.",
  ],
  noun: [
    "The report highlighted the significance of _____ in contemporary society.",
    "Public debate about _____ intensified after the findings were released.",
    "The researchers examined the relationship between policy and _____ .",
  ],
  preposition: [
    "The findings were evaluated _____ the standards established by the committee.",
    "The debate continued _____ growing concern among independent researchers.",
    "The organization revised its policy _____ consultation with outside experts.",
  ],
} as const;

export function buildOriginalClozeSentence(word: ClozeWord, bookTitle: string) {
  const level = /英検1級/.test(bookTitle) ? ADVANCED_TEMPLATES : JUNIOR_TEMPLATES;
  const kind = wordKind(word);
  const templates = level[kind];
  return templates[hashText(`${word.no}:${word.english}`) % templates.length];
}

function seededShuffle<T>(items: T[], seedText: string) {
  const next = [...items];
  let seed = hashText(seedText) || 1;
  for (let i = next.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function buildClozeQuestion(word: ClozeWord, allWords: ClozeWord[], bookTitle: string): ClozeQuestion {
  const answer = word.english.trim();
  const sameKind = allWords.filter((item) => item.no !== word.no && isClozeEligibleWord(item) && wordKind(item) === wordKind(word));
  const fallback = allWords.filter((item) => item.no !== word.no && isClozeEligibleWord(item));
  const distractors = seededShuffle(
    sameKind.length >= 3 ? sameKind : fallback,
    `${bookTitle}:${word.no}:distractors`,
  ).map((item) => item.english.trim());
  const unique = Array.from(new Set(distractors)).slice(0, 3);
  return {
    word,
    sentence: buildOriginalClozeSentence(word, bookTitle),
    choices: seededShuffle([answer, ...unique], `${bookTitle}:${word.no}:choices`),
    answer,
    meaning: mainMeaning(word.japanese),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

export function buildClozePrintDocument(bookTitle: string, words: ClozeWord[], count = 20) {
  const eligibleWords = words.filter(isClozeEligibleWord);
  const selected = eligibleWords.slice(0, Math.max(1, Math.min(count, 40)));
  const questions = selected.map((word) => buildClozeQuestion(word, eligibleWords, bookTitle));
  const pages: string[] = [];
  for (let start = 0; start < questions.length; start += 10) {
    const chunk = questions.slice(start, start + 10);
    pages.push(`<section class="page"><h1>${escapeHtml(bookTitle)} 4択穴埋めテスト</h1><p class="note">最も適切な語を1つ選びなさい。例文はVocab Print Proが学習用に作成したオリジナルです。</p>${chunk.map((question, offset) => `<div class="question"><p><strong>${start + offset + 1}.</strong> ${escapeHtml(question.sentence)}</p><div class="choices">${question.choices.map((choice, index) => `<span>(${index + 1}) ${escapeHtml(choice)}</span>`).join("")}</div></div>`).join("")}<footer>Vocab Print Pro</footer></section>`);
  }
  pages.push(`<section class="page answers"><h1>${escapeHtml(bookTitle)} 解答</h1>${questions.map((question, index) => `<p><strong>${index + 1}.</strong> ${escapeHtml(question.answer)} <span>${escapeHtml(question.meaning)}</span></p>`).join("")}<footer>Vocab Print Pro</footer></section>`);
  const title = `${bookTitle} 4択穴埋めテスト`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"Yu Gothic","Meiryo",sans-serif}.page{width:182mm;min-height:269mm;position:relative;page-break-after:always;padding-bottom:12mm}.page:last-child{page-break-after:auto}h1{text-align:center;font-size:16pt;margin:0 0 3mm}.note{font-size:8.5pt;color:#555;margin:0 0 5mm}.question{border-bottom:.4pt solid #bbb;padding:2.4mm 0}.question p{font-size:10.5pt;line-height:1.65;margin:0}.choices{display:grid;grid-template-columns:1fr 1fr;gap:1mm 5mm;padding:1.5mm 0 0 6mm;font-size:9.5pt}.answers p{border-bottom:.4pt solid #ddd;padding:2mm;margin:0;font-size:10pt}.answers span{margin-left:5mm;color:#444}footer{position:absolute;bottom:0;right:0;font-size:8pt;color:#666}@media screen{body{background:#eee;padding:20px}.page{background:#fff;margin:0 auto 20px;padding:14mm;width:210mm;min-height:297mm;box-shadow:0 2px 10px #999}}@media print{body{background:#fff}.page{width:100%;min-height:269mm}}</style></head><body>${pages.join("")}</body></html>`;
}
