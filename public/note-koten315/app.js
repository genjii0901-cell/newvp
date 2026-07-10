const BOOK_ID = "koten-315";
const APP_SLUG = "k315-7xq9m-vpnote-42f8";
const BASE_PATH = `/note/${APP_SLUG}`;
const NOTE_ACCESS_CODE = "KOTEN315-NOTE-2026";
const app = document.querySelector("#app");

let sourceBook = null;
let currentBook = null;
let currentLicense = null;
let activeTab = "overview";
let quiz = { questions: [], index: 0, score: 0, start: 1, end: 50, count: 10, direction: "word-to-meaning", answered: false };
let listen = { index: 0, playing: false, timer: null, start: 1, end: 50, order: "word-meaning", voice: "female", rate: 0.82, interval: 3600 };
let printState = { mode: "test", direction: "word-to-meaning", start: 1, end: 50, count: 20, shuffle: false, answers: true, columns: 2 };

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
const visibleWords = () => currentBook?.words ?? [];
const isLicensed = () => currentBook?.access === "licensed";
const clamp = (value, min, max) => Math.min(Math.max(Number(value) || min, min), max);

function routeKind() {
  if (location.pathname.endsWith("/activate")) return "activate";
  if (location.pathname.endsWith("/login")) return "login";
  return "book";
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function licenseKeyFor(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const hash = await sha256(`${normalized}|${NOTE_ACCESS_CODE}|${BOOK_ID}`);
  return `KT315_${hash.slice(0, 8)}_${hash.slice(8, 20)}`.toUpperCase();
}

function getLicense() {
  try {
    const license = JSON.parse(localStorage.getItem("koten315_license") || "null");
    return license?.email && license?.licenseKey ? license : null;
  } catch {
    return null;
  }
}

function buildBook() {
  currentLicense = getLicense();
  const licensed = Boolean(currentLicense);
  currentBook = {
    ...sourceBook,
    title: "古典単語315",
    description: "Vocab Print Pro の単語帳専用ページです。単語確認、単語テスト、聞き流し、印刷プリント作成をまとめて使えます。",
    words: licensed ? sourceBook.words : sourceBook.words.slice(0, 50),
    totalWords: sourceBook.words.length,
    access: licensed ? "licensed" : "free",
    freeLimit: 50,
    watermark: !licensed,
  };
  printState.end = Math.min(printState.end || currentBook.words.length, currentBook.words.length);
  quiz.end = Math.min(quiz.end || currentBook.words.length, currentBook.words.length);
  listen.end = Math.min(listen.end || currentBook.words.length, currentBook.words.length);
}

function wordsInRange(start, end) {
  const from = clamp(start, 1, visibleWords().length);
  const to = clamp(end, from, visibleWords().length);
  return visibleWords().filter((word) => word.no >= from && word.no <= to);
}

function printLimit() {
  if (printState.mode === "list") return printState.columns === 2 ? 44 : 26;
  return printState.columns === 2 ? 36 : 20;
}

function stopListening() {
  listen.playing = false;
  if (listen.timer) clearTimeout(listen.timer);
  listen.timer = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function shell() {
  const locked = !isLicensed();
  return `
    <section class="dictionary-hero">
      <div class="hero-main">
        <div class="crumb">Vocab Print Pro / Note License Edition</div>
        <div class="hero-title-row">
          <h1>${escapeHtml(currentBook.title)}</h1>
          <span class="access-pill ${locked ? "free" : "paid"}">${locked ? `無料サンプル ${currentBook.freeLimit}語` : "購入者版"}</span>
        </div>
        <p>${escapeHtml(currentBook.description)}</p>
        <div class="summary-chips">
          <span>${visibleWords().length}語表示</span>
          <span>全${currentBook.totalWords}語</span>
          <span>${locked ? "透かしあり" : "透かしなし"}</span>
          <span>${currentLicense?.email ? escapeHtml(currentLicense.email) : "未登録"}</span>
        </div>
      </div>
      <div class="hero-side no-print">
        ${locked ? `
          <p class="side-label">無料サンプルで利用中</p>
          <a class="primary-action" href="${BASE_PATH}/activate">メール + ライセンスコードで登録</a>
          <a class="secondary-action" href="${BASE_PATH}/login">ライセンスキーでログイン</a>
        ` : `
          <p class="side-label">購入者版で利用中</p>
          <button id="logoutBtn" class="secondary-action" type="button">ログアウト</button>
        `}
      </div>
    </section>
    <nav class="section-tabs no-print" aria-label="単語帳メニュー">
      ${[["overview", "概要"], ["quiz", "単語テスト"], ["listen", "聞き流し"], ["print", "印刷設定"]]
        .map(([id, label]) => `<button class="${activeTab === id ? "active" : ""}" data-tab="${id}" type="button">${label}</button>`).join("")}
    </nav>
    ${locked ? `<section class="sample-notice no-print"><strong>無料サンプル版です。</strong> 50語まで試せます。単語一覧と印刷には「無料版 SAMPLE」の透かしが入ります。</section>` : ""}
    <section id="tabPanel"></section>
  `;
}

function bindShell() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      stopListening();
      activeTab = button.dataset.tab;
      renderBook();
    });
  });
  document.querySelector("#logoutBtn")?.addEventListener("click", () => {
    stopListening();
    localStorage.removeItem("koten315_license");
    location.href = BASE_PATH;
  });
}

function renderBook() {
  stopListening();
  app.innerHTML = shell();
  bindShell();
  if (activeTab === "quiz") renderQuiz();
  else if (activeTab === "listen") renderListen();
  else if (activeTab === "print") renderPrint();
  else renderOverview();
}

function renderOverview() {
  const words = visibleWords();
  const first = words[0];
  const last = words[words.length - 1];
  document.querySelector("#tabPanel").innerHTML = `
    <div class="overview-grid">
      <article class="feature-card">
        <h2>概要</h2>
        <p>購入者は全315語を使えます。無料サンプルでは最初の50語だけを、透かし付きで確認できます。</p>
        <dl class="stats">
          <div><dt>利用範囲</dt><dd>${first?.no ?? 1} - ${last?.no ?? 0}</dd></div>
          <div><dt>表示語数</dt><dd>${words.length}</dd></div>
          <div><dt>状態</dt><dd>${isLicensed() ? "購入者版" : "無料サンプル"}</dd></div>
        </dl>
      </article>
      <article class="feature-card">
        <h2>すぐ使う</h2>
        <div class="tool-links no-print">
          <button data-jump="quiz" type="button">単語テスト</button>
          <button data-jump="listen" type="button">聞き流し</button>
          <button data-jump="print" type="button">印刷設定</button>
        </div>
      </article>
    </div>
    <section class="overview-list-card ${currentBook.watermark ? "watermarked" : ""}">
      <div class="watermark">無料版 SAMPLE</div>
      <div class="list-heading no-print">
        <div>
          <h2>単語一覧</h2>
          <p>概要からそのまま検索できます。</p>
        </div>
        <div class="search-row">
          <input id="overviewSearch" placeholder="単語・意味で検索" />
          <button id="overviewSearchBtn" type="button">検索</button>
          <button id="overviewClearBtn" type="button">クリア</button>
        </div>
      </div>
      <div id="overviewList">${tableRows(words)}</div>
    </section>
  `;
  document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => {
    activeTab = button.dataset.jump;
    renderBook();
  }));
  const input = document.querySelector("#overviewSearch");
  const applySearch = () => {
    const keyword = input.value.trim();
    const filtered = keyword ? words.filter((word) => `${word.word} ${word.meaning}`.includes(keyword)) : words;
    document.querySelector("#overviewList").innerHTML = tableRows(filtered);
  };
  document.querySelector("#overviewSearchBtn").addEventListener("click", applySearch);
  document.querySelector("#overviewClearBtn").addEventListener("click", () => {
    input.value = "";
    applySearch();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applySearch();
  });
}

function makeQuestions() {
  const pool = wordsInRange(quiz.start, quiz.end);
  return shuffle(pool).slice(0, Math.min(quiz.count, pool.length)).map((word) => {
    const answer = quiz.direction === "meaning-to-word" ? word.word : word.meaning;
    const choices = shuffle([
      answer,
      ...shuffle(pool.filter((item) => item.no !== word.no)).slice(0, 3)
        .map((item) => quiz.direction === "meaning-to-word" ? item.word : item.meaning),
    ]);
    return { word, answer, choices };
  });
}

function renderQuiz() {
  quiz = { ...quiz, questions: makeQuestions(), index: 0, score: 0, answered: false };
  drawQuiz();
}

function drawQuiz() {
  const q = quiz.questions[quiz.index];
  const finished = quiz.index >= quiz.questions.length;
  const prompt = q && quiz.direction === "meaning-to-word" ? q.word.meaning : q?.word.word;
  document.querySelector("#tabPanel").innerHTML = `
    <section class="quiz-layout">
      <div class="quiz-window">
        <div class="quiz-header"><span>単語テスト</span><span>${Math.min(quiz.index + 1, quiz.questions.length)} / ${quiz.questions.length}</span></div>
        ${finished ? `
          <div class="quiz-finish">
            <h2>${quiz.score} / ${quiz.questions.length}</h2>
            <p>もう一度ランダムに出題できます。</p>
            <button id="restartQuiz" class="primary-action" type="button">もう一度</button>
          </div>
        ` : `
          <div class="quiz-card"><span class="quiz-no">No.${q.word.no}</span><div class="quiz-word">${escapeHtml(prompt)}</div></div>
          <div class="quiz-options">${q.choices.map((choice) => `<button class="quiz-option" data-choice="${escapeHtml(choice)}" type="button">${escapeHtml(choice)}</button>`).join("")}</div>
          <div id="quizFeedback" class="quiz-feedback"></div>
        `}
      </div>
      <aside class="feature-card quiz-settings no-print">
        <h2>テスト設定</h2>
        <label>出題方向
          <select id="quizDirection">
            <option value="word-to-meaning" ${quiz.direction === "word-to-meaning" ? "selected" : ""}>見出し語 → 意味</option>
            <option value="meaning-to-word" ${quiz.direction === "meaning-to-word" ? "selected" : ""}>意味 → 見出し語</option>
          </select>
        </label>
        <div class="range-grid">
          <label>開始番号<input id="quizStart" type="number" min="1" max="${visibleWords().length}" value="${quiz.start}" /></label>
          <label>終了番号<input id="quizEnd" type="number" min="1" max="${visibleWords().length}" value="${quiz.end}" /></label>
        </div>
        <label>問題数<input id="quizCount" type="number" min="1" max="${wordsInRange(quiz.start, quiz.end).length}" value="${quiz.count}" /></label>
        <button id="resetQuiz" type="button">問題を作り直す</button>
      </aside>
    </section>
  `;
  document.querySelector("#restartQuiz")?.addEventListener("click", renderQuiz);
  document.querySelector("#resetQuiz")?.addEventListener("click", () => {
    quiz.direction = document.querySelector("#quizDirection").value;
    quiz.start = clamp(document.querySelector("#quizStart").value, 1, visibleWords().length);
    quiz.end = clamp(document.querySelector("#quizEnd").value, quiz.start, visibleWords().length);
    quiz.count = clamp(document.querySelector("#quizCount").value, 1, wordsInRange(quiz.start, quiz.end).length);
    renderQuiz();
  });
  document.querySelectorAll(".quiz-option").forEach((button) => button.addEventListener("click", () => answerQuiz(button)));
}

function answerQuiz(button) {
  if (quiz.answered) return;
  quiz.answered = true;
  const q = quiz.questions[quiz.index];
  const correct = button.dataset.choice === q.answer;
  if (correct) quiz.score += 1;
  document.querySelectorAll(".quiz-option").forEach((option) => {
    if (option.dataset.choice === q.answer) option.classList.add("correct");
    else if (option === button) option.classList.add("wrong");
    option.disabled = true;
  });
  document.querySelector("#quizFeedback").innerHTML = `<strong>${correct ? "正解" : "不正解"}</strong><span>答え: ${escapeHtml(q.answer)}</span><button id="nextQuiz" type="button">次へ</button>`;
  document.querySelector("#nextQuiz").addEventListener("click", () => {
    quiz.index += 1;
    quiz.answered = false;
    drawQuiz();
  });
}

function renderListen() {
  listen.index = 0;
  drawListen();
}

function drawListen() {
  const pool = wordsInRange(listen.start, listen.end);
  const word = pool[listen.index] ?? pool[0];
  document.querySelector("#tabPanel").innerHTML = `
    <section class="listen-layout">
      <article class="listen-card">
        <div class="listen-count">${listen.index + 1} / ${pool.length}</div>
        <div class="listen-word">${escapeHtml(word.word)}</div>
        <div class="listen-meaning">${escapeHtml(word.meaning)}</div>
        <div class="listen-controls no-print">
          <button id="prevListen" type="button">前へ</button>
          <button id="playListen" class="primary-action" type="button">${listen.playing ? "停止" : "聞き流し開始"}</button>
          <button id="nextListen" type="button">次へ</button>
        </div>
      </article>
      <article class="feature-card listen-settings no-print">
        <h2>聞き流し設定</h2>
        <label>読み上げ順
          <select id="listenOrder">
            <option value="word-meaning" ${listen.order === "word-meaning" ? "selected" : ""}>見出し語 → 意味</option>
            <option value="meaning-word" ${listen.order === "meaning-word" ? "selected" : ""}>意味 → 見出し語</option>
            <option value="word-only" ${listen.order === "word-only" ? "selected" : ""}>見出し語のみ</option>
          </select>
        </label>
        <div class="range-grid">
          <label>開始番号<input id="listenStart" type="number" min="1" max="${visibleWords().length}" value="${listen.start}" /></label>
          <label>終了番号<input id="listenEnd" type="number" min="1" max="${visibleWords().length}" value="${listen.end}" /></label>
        </div>
        <label>声
          <select id="listenVoice">
            <option value="female" ${listen.voice === "female" ? "selected" : ""}>女声</option>
            <option value="male" ${listen.voice === "male" ? "selected" : ""}>男声</option>
          </select>
        </label>
        <label>速さ
          <select id="listenRate">
            <option value="0.7" ${listen.rate === 0.7 ? "selected" : ""}>ゆっくり</option>
            <option value="0.82" ${listen.rate === 0.82 ? "selected" : ""}>標準</option>
            <option value="1" ${listen.rate === 1 ? "selected" : ""}>速め</option>
          </select>
        </label>
      </article>
    </section>
  `;
  document.querySelector("#prevListen").addEventListener("click", () => moveListen(-1));
  document.querySelector("#nextListen").addEventListener("click", () => moveListen(1));
  document.querySelector("#playListen").addEventListener("click", toggleListen);
  ["#listenOrder", "#listenVoice", "#listenRate", "#listenStart", "#listenEnd"].forEach((selector) => document.querySelector(selector).addEventListener("change", updateListen));
}

function updateListen() {
  listen.order = document.querySelector("#listenOrder").value;
  listen.voice = document.querySelector("#listenVoice").value;
  listen.rate = Number(document.querySelector("#listenRate").value);
  listen.start = clamp(document.querySelector("#listenStart").value, 1, visibleWords().length);
  listen.end = clamp(document.querySelector("#listenEnd").value, listen.start, visibleWords().length);
  listen.index = Math.min(listen.index, wordsInRange(listen.start, listen.end).length - 1);
  if (listen.playing) {
    stopListening();
    listen.playing = true;
    speakCurrent();
  }
}

function moveListen(delta) {
  const pool = wordsInRange(listen.start, listen.end);
  listen.index = (listen.index + delta + pool.length) % pool.length;
  drawListen();
}

function toggleListen() {
  updateListen();
  if (listen.playing) {
    stopListening();
    drawListen();
    return;
  }
  listen.playing = true;
  speakCurrent();
  drawListen();
}

function chooseVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang?.startsWith("ja"));
  if (listen.voice === "male") return voices.find((voice) => /male|otoya|ichiro|男/i.test(voice.name)) || voices[1] || voices[0] || null;
  return voices.find((voice) => /female|kyoko|haruka|nanami|女/i.test(voice.name)) || voices[0] || null;
}

function listenText(word) {
  if (listen.order === "meaning-word") return `${word.meaning}。${word.word}`;
  if (listen.order === "word-only") return word.word;
  return `${word.word}。${word.meaning}`;
}

function speakCurrent() {
  if (!listen.playing) return;
  const pool = wordsInRange(listen.start, listen.end);
  const word = pool[listen.index];
  if (!word) return;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(listenText(word));
    utterance.lang = "ja-JP";
    utterance.rate = listen.rate;
    const voice = chooseVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }
  listen.timer = setTimeout(() => {
    listen.index = (listen.index + 1) % pool.length;
    drawListen();
    speakCurrent();
  }, listen.interval);
}

function renderPrint() {
  printState.end = Math.min(printState.end, visibleWords().length);
  printState.count = Math.min(printState.count, printLimit());
  document.querySelector("#tabPanel").innerHTML = `
    <section class="print-layout">
      <article class="feature-card print-settings no-print">
        <h2>印刷設定</h2>
        <div class="settings-grid">
          <label>形式<select id="printMode"><option value="test" ${printState.mode === "test" ? "selected" : ""}>小テスト</option><option value="list" ${printState.mode === "list" ? "selected" : ""}>一覧</option><option value="answer" ${printState.mode === "answer" ? "selected" : ""}>解答</option></select></label>
          <label>出題方向<select id="printDirection"><option value="word-to-meaning" ${printState.direction === "word-to-meaning" ? "selected" : ""}>見出し語 → 意味</option><option value="meaning-to-word" ${printState.direction === "meaning-to-word" ? "selected" : ""}>意味 → 見出し語</option></select></label>
          <label>開始番号<input id="printStart" type="number" min="1" max="${visibleWords().length}" value="${printState.start}" /></label>
          <label>終了番号<input id="printEnd" type="number" min="1" max="${visibleWords().length}" value="${printState.end}" /></label>
          <label>問題数<input id="printCount" type="number" min="1" max="${printLimit()}" value="${printState.count}" /></label>
          <label>段組<select id="printColumns"><option value="1" ${printState.columns === 1 ? "selected" : ""}>1段</option><option value="2" ${printState.columns === 2 ? "selected" : ""}>2段</option></select></label>
        </div>
        <div class="check-row">
          <label><input id="printShuffle" type="checkbox" ${printState.shuffle ? "checked" : ""} /> ランダム</label>
          <label><input id="printAnswers" type="checkbox" ${printState.answers ? "checked" : ""} /> 答えを表示</label>
        </div>
        <div class="actions">
          <button id="makePrint" class="primary-action" type="button">プレビュー更新</button>
          <button id="printNow" type="button">印刷</button>
        </div>
        <p class="print-limit-note">A4一枚に収める目安: この設定では最大${printLimit()}語まで。</p>
      </article>
      <article id="printPreview" class="print-sheet ${currentBook.watermark ? "watermarked" : ""}"></article>
    </section>
  `;
  document.querySelector("#makePrint").addEventListener("click", updatePrint);
  document.querySelector("#printNow").addEventListener("click", () => window.print());
  updatePrintPreview();
}

function updatePrint() {
  printState.mode = document.querySelector("#printMode").value;
  printState.direction = document.querySelector("#printDirection").value;
  printState.start = clamp(document.querySelector("#printStart").value, 1, visibleWords().length);
  printState.end = clamp(document.querySelector("#printEnd").value, printState.start, visibleWords().length);
  printState.columns = Number(document.querySelector("#printColumns").value || 2);
  printState.count = Math.min(
    clamp(document.querySelector("#printCount").value, 1, wordsInRange(printState.start, printState.end).length),
    printLimit()
  );
  printState.shuffle = document.querySelector("#printShuffle").checked;
  printState.answers = document.querySelector("#printAnswers").checked;
  document.querySelector("#printCount").value = printState.count;
  document.querySelector("#printCount").max = printLimit();
  updatePrintPreview();
}

function printWords() {
  let words = wordsInRange(printState.start, printState.end);
  if (printState.shuffle) words = shuffle(words);
  return words.slice(0, Math.max(1, Math.min(printState.count, printLimit())));
}

function updatePrintPreview() {
  const words = printWords();
  const title = printState.mode === "list" ? "単語一覧" : printState.mode === "answer" ? "解答" : "小テスト";
  const body = printState.mode === "list"
    ? tableRows(words)
    : `<ol class="print-questions columns-${printState.columns}">${words.map((word) => {
      const prompt = printState.direction === "meaning-to-word" ? word.meaning : word.word;
      const answer = printState.direction === "meaning-to-word" ? word.word : word.meaning;
      return `<li><strong>${escapeHtml(prompt)}</strong>${printState.answers || printState.mode === "answer" ? `<span>答え: ${escapeHtml(answer)}</span>` : ""}</li>`;
    }).join("")}</ol>`;
  const density = words.length > 30 ? "dense-3" : words.length > 20 ? "dense-2" : "dense-1";
  const preview = document.querySelector("#printPreview");
  preview.className = `print-sheet ${currentBook.watermark ? "watermarked" : ""} ${density}`;
  preview.innerHTML = `<div class="watermark">無料版 SAMPLE</div><div class="print-title"><span>${escapeHtml(currentBook.title)}</span><span>${title} ${words[0]?.no ?? printState.start}-${words[words.length - 1]?.no ?? printState.end}</span></div>${body}`;
}

function tableRows(words) {
  return `<table><thead><tr><th>No.</th><th>単語</th><th>意味</th></tr></thead><tbody>${words
    .map((word) => `<tr><td>${word.no}</td><td><strong>${escapeHtml(word.word)}</strong></td><td>${escapeHtml(word.meaning)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function renderActivate() {
  app.innerHTML = `
    <section class="auth-card">
      <span class="access-pill paid">購入者登録</span>
      <h1>有料版を有効化</h1>
      <p>note の有料欄に書かれているライセンスコードと、利用するメールアドレスを入力してください。</p>
      <form id="activateForm">
        <label>メールアドレス<input name="email" type="email" required autocomplete="email" /></label>
        <label>ライセンスコード<input name="accessCode" required placeholder="有料欄のコード" /></label>
        <div class="actions">
          <button class="primary-action" type="submit">有料版を有効化</button>
          <a class="secondary-action" href="${BASE_PATH}">無料サンプルへ戻る</a>
        </div>
      </form>
      <p id="activateMsg" class="status"></p>
    </section>
  `;
  document.querySelector("#activateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const msg = document.querySelector("#activateMsg");
    msg.className = "status";
    msg.textContent = "確認しています...";
    try {
      const email = String(values.email || "").trim().toLowerCase();
      const accessCode = String(values.accessCode || "").trim();
      if (!email || !email.includes("@")) throw new Error("メールアドレスを確認してください。");
      if (accessCode !== NOTE_ACCESS_CODE) throw new Error("ライセンスコードが違います。");
      const licenseKey = await licenseKeyFor(email);
      localStorage.setItem("koten315_license", JSON.stringify({ email, licenseKey, activatedAt: new Date().toISOString() }));
      msg.innerHTML = `有効化しました。保管用ライセンスキー: <strong>${escapeHtml(licenseKey)}</strong>`;
      setTimeout(() => (location.href = BASE_PATH), 900);
    } catch (error) {
      msg.className = "status error";
      msg.textContent = error.message;
    }
  });
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-card">
      <span class="access-pill paid">購入者ログイン</span>
      <h1>全315語を使う</h1>
      <p>初回登録後に表示された保管用ライセンスキーで、別の端末からもログインできます。</p>
      <form id="loginForm">
        <label>メールアドレス<input name="email" type="email" required autocomplete="email" /></label>
        <label>ライセンスキー<input name="licenseKey" required /></label>
        <div class="actions">
          <button class="primary-action" type="submit">ログイン</button>
          <a class="secondary-action" href="${BASE_PATH}/activate">購入者登録</a>
          <a class="secondary-action" href="${BASE_PATH}">無料サンプルへ戻る</a>
        </div>
      </form>
      <p id="loginMsg" class="status"></p>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const msg = document.querySelector("#loginMsg");
    msg.className = "status";
    msg.textContent = "確認しています...";
    try {
      const email = String(values.email || "").trim().toLowerCase();
      const expected = await licenseKeyFor(email);
      if (String(values.licenseKey || "").trim().toUpperCase() !== expected) throw new Error("メールアドレスまたはライセンスキーが違います。");
      localStorage.setItem("koten315_license", JSON.stringify({ email, licenseKey: expected, activatedAt: new Date().toISOString() }));
      location.href = BASE_PATH;
    } catch (error) {
      msg.className = "status error";
      msg.textContent = error.message;
    }
  });
}

async function loadBook() {
  app.innerHTML = `<div class="loading">読み込み中...</div>`;
  try {
    sourceBook = await fetch("/note-koten315/koten315.json").then((res) => {
      if (!res.ok) throw new Error("単語帳データを読み込めませんでした。");
      return res.json();
    });
    buildBook();
    renderBook();
  } catch (error) {
    app.innerHTML = `<section class="auth-card"><h1>読み込みに失敗しました</h1><p>${escapeHtml(error.message)}</p></section>`;
  }
}

const kind = routeKind();
if (kind === "activate") renderActivate();
else if (kind === "login") renderLogin();
else loadBook();
