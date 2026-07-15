#!/usr/bin/env -S node --experimental-strip-types

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Word = { no: number; english: string; japanese: string };
type Wordbook = { id: string; title: string; words: Word[] };
type ArticleCode = "N" | "R" | "RS" | "RRS" | "E";
type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-japanese";

type DocumentSpec = {
  role: string;
  label: string;
  titleSuffix: string;
  printStyle: PrintStyle;
};

type ArticleSpec = {
  code: ArticleCode;
  label: string;
  randomized: boolean;
  documents: [DocumentSpec, DocumentSpec];
};

type CliOptions = {
  source: "local" | "api";
  sourceFile: string;
  catalogFile: string;
  output: string;
  books: string[] | "all";
  articles: ArticleCode[] | "all";
  planFile: string | null;
  seed: string;
  maxWords: number | null;
  force: boolean;
  refreshSource: boolean;
  list: boolean;
};

type ArtifactFile = {
  path: string;
  bytes: number;
  sha256: string;
};

type DocumentManifest = {
  role: string;
  label: string;
  title: string;
  printStyle: PrintStyle;
  fullPdf: ArtifactFile;
  samplePdf: ArtifactFile;
  previewPng: ArtifactFile & { width: number; height: number };
  validation: {
    expectedPages: number;
    fullPages: number;
    samplePages: number;
    a4Portrait: boolean;
    titleFound: boolean;
    footerFound: boolean;
    pageNumberFound: boolean;
  };
};

type ArticleManifest = {
  bookId: string;
  bookTitle: string;
  articleCode: ArticleCode;
  articleLabel: string;
  randomized: boolean;
  randomSeed: string | null;
  wordCount: number;
  status: "ready" | "failed";
  error?: string;
  documents: DocumentManifest[];
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const FOOTER_TEXT = "Created by motoki";
const WORDS_PER_PAGE = 50;
const FIXED_GENERATED_AT = new Date("2000-01-01T00:00:00.000Z");

const ARTICLE_SPECS: Record<ArticleCode, ArticleSpec> = {
  N: {
    code: "N",
    label: "通常・日本語空欄",
    randomized: false,
    documents: [
      {
        role: "japanese-blank-test",
        label: "日本語空欄テスト",
        titleSuffix: "日本語空欄テスト",
        printStyle: "blank-japanese",
      },
      {
        role: "answer",
        label: "解答",
        titleSuffix: "日本語空欄テスト 解答",
        printStyle: "standard",
      },
    ],
  },
  R: {
    code: "R",
    label: "ランダム・日本語空欄",
    randomized: true,
    documents: [
      {
        role: "japanese-blank-test-random",
        label: "日本語空欄テスト（ランダム）",
        titleSuffix: "日本語空欄テスト（ランダム）",
        printStyle: "blank-japanese",
      },
      {
        role: "answer-random",
        label: "解答（ランダム）",
        titleSuffix: "日本語空欄テスト 解答（ランダム）",
        printStyle: "standard",
      },
    ],
  },
  RS: {
    code: "RS",
    label: "赤シート",
    randomized: false,
    documents: [
      {
        role: "standard-list",
        label: "通常一覧",
        titleSuffix: "赤シート版 通常一覧",
        printStyle: "standard",
      },
      {
        role: "redsheet-list",
        label: "日本語赤字一覧",
        titleSuffix: "赤シート版（日本語赤字）",
        printStyle: "red-japanese",
      },
    ],
  },
  RRS: {
    code: "RRS",
    label: "ランダム赤シート",
    randomized: true,
    documents: [
      {
        role: "standard-list-random",
        label: "通常一覧（ランダム）",
        titleSuffix: "ランダム赤シート版 通常一覧",
        printStyle: "standard",
      },
      {
        role: "redsheet-list-random",
        label: "日本語赤字一覧（ランダム）",
        titleSuffix: "ランダム赤シート版（日本語赤字）",
        printStyle: "red-japanese",
      },
    ],
  },
  E: {
    code: "E",
    label: "英語空欄",
    randomized: false,
    documents: [
      {
        role: "english-blank-test",
        label: "英語空欄テスト",
        titleSuffix: "英語空欄テスト",
        printStyle: "blank-english",
      },
      {
        role: "answer",
        label: "解答",
        titleSuffix: "英語空欄テスト 解答",
        printStyle: "standard",
      },
    ],
  },
};

const ALL_ARTICLE_CODES = Object.keys(ARTICLE_SPECS) as ArticleCode[];

function printUsage() {
  console.log(`Usage:
  node --experimental-strip-types scripts/generate-note-artifacts.ts [options]

Options:
  --source local|api        Data source (default: local)
  --source-file PATH        Local JSON source
  --catalog-file PATH       API catalog JSON
  --output PATH             Output directory
  --books all|ID,ID         Wordbooks to generate (required unless --list)
  --articles all|N,R,...    Article bundles (required unless --list)
  --plan-file PATH          Per-book bundle plan; skips existing article types
  --seed TEXT               Stable random seed
  --max-words N             Limit words for a test run
  --force                   Regenerate existing artifacts
  --refresh-source          Refresh the cached API snapshot
  --list                    List source wordbooks and article codes

Each article bundle produces two full PDFs, two one-page sample PDFs,
two first-page PNG previews, manifest.json, and upload-queue.csv.`);
}

function parseCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function requireValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    source: "local",
    sourceFile: join(REPO_ROOT, "data", "generated-official-wordbooks.json"),
    catalogFile: join(SCRIPT_DIR, "note-artifact-catalog.json"),
    output: join(REPO_ROOT, "outputs", "note-artifacts"),
    books: [],
    articles: [],
    planFile: null,
    seed: "vpp-note-artifacts-v1",
    maxWords: null,
    force: false,
    refreshSource: false,
    list: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--source") {
      const value = requireValue(argv, index, arg);
      if (value !== "local" && value !== "api") throw new Error("--source must be local or api.");
      options.source = value;
      index += 1;
    } else if (arg === "--source-file") {
      options.sourceFile = resolve(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === "--catalog-file") {
      options.catalogFile = resolve(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === "--output") {
      options.output = resolve(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === "--books") {
      const value = requireValue(argv, index, arg);
      options.books = value === "all" ? "all" : parseCsv(value);
      index += 1;
    } else if (arg === "--articles") {
      const value = requireValue(argv, index, arg);
      if (value === "all") {
        options.articles = "all";
      } else {
        const codes = parseCsv(value).map((item) => item.toUpperCase());
        for (const code of codes) {
          if (!ALL_ARTICLE_CODES.includes(code as ArticleCode)) {
            throw new Error(`Unknown article code: ${code}`);
          }
        }
        options.articles = codes as ArticleCode[];
      }
      index += 1;
    } else if (arg === "--plan-file") {
      options.planFile = resolve(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === "--seed") {
      options.seed = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--max-words") {
      const parsed = Number(requireValue(argv, index, arg));
      if (!Number.isInteger(parsed) || parsed < 1) throw new Error("--max-words must be a positive integer.");
      options.maxWords = parsed;
      index += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--refresh-source") {
      options.refreshSource = true;
    } else if (arg === "--list") {
      options.list = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.planFile) {
    const rawPlan = readJson<{ books?: Record<string, string[]> }>(options.planFile);
    const planIds = Object.keys(rawPlan.books ?? {});
    if (planIds.length === 0) throw new Error("--plan-file has no books.");
    if (Array.isArray(options.books) && options.books.length === 0) options.books = planIds;
  }

  if (!options.list) {
    if (Array.isArray(options.books) && options.books.length === 0) {
      throw new Error("Specify --books all or a comma-separated ID list.");
    }
    if (!options.planFile && Array.isArray(options.articles) && options.articles.length === 0) {
      throw new Error("Specify --articles all or one or more of N,R,RS,RRS,E.");
    }
  }
  return options;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadArticlePlan(path: string | null) {
  if (!path) return null;
  const raw = readFileSync(path);
  const parsed = JSON.parse(raw.toString("utf8")) as { books?: Record<string, string[]> };
  const books: Record<string, ArticleCode[]> = {};
  for (const [bookId, rawCodes] of Object.entries(parsed.books ?? {})) {
    const codes = rawCodes.map((code) => (code.toUpperCase() === "N-J" ? "N" : code.toUpperCase()));
    for (const code of codes) {
      if (!ALL_ARTICLE_CODES.includes(code as ArticleCode)) {
        throw new Error(`Unknown article code ${code} in plan for ${bookId}.`);
      }
    }
    books[bookId] = [...new Set(codes as ArticleCode[])];
  }
  return {
    path,
    sha256: createHash("sha256").update(raw).digest("hex"),
    books,
  };
}

function normalizeWordbook(raw: unknown): Wordbook {
  const source = raw as Record<string, unknown>;
  const words = Array.isArray(source.words) ? source.words : [];
  return {
    id: String(source.id ?? ""),
    title: String(source.title ?? "").trim(),
    words: words.map((entry, index) => {
      const word = entry as Record<string, unknown>;
      return {
        no: Number(word.no) || index + 1,
        english: String(word.english ?? "").trim(),
        japanese: String(word.japanese ?? "").trim(),
      };
    }).filter((word) => word.english || word.japanese),
  };
}

function validateWordbooks(books: Wordbook[]) {
  const seen = new Set<string>();
  for (const book of books) {
    if (!book.id || !book.title) throw new Error("Every wordbook must have an id and title.");
    if (seen.has(book.id)) throw new Error(`Duplicate wordbook id: ${book.id}`);
    if (book.words.length === 0) throw new Error(`Wordbook ${book.id} has no words.`);
    seen.add(book.id);
  }
}

async function fetchApiBook(apiBaseUrl: string, id: string): Promise<Wordbook> {
  const url = new URL(apiBaseUrl);
  url.searchParams.set("id", id);
  url.searchParams.set("includeWords", "1");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`API ${response.status} for wordbook ${id}`);
  const payload = await response.json() as { ok?: boolean; wordbooks?: unknown[] };
  const match = payload.wordbooks?.find((entry) => String((entry as { id?: unknown }).id) === id)
    ?? payload.wordbooks?.[0];
  if (!payload.ok || !match) throw new Error(`API returned no wordbook for ${id}`);
  return normalizeWordbook(match);
}

async function loadWordbooks(options: CliOptions): Promise<{ books: Wordbook[]; sourceHash: string; sourceLabel: string }> {
  if (options.source === "local") {
    const raw = readFileSync(options.sourceFile);
    const books = (JSON.parse(raw.toString("utf8")) as unknown[]).map(normalizeWordbook);
    validateWordbooks(books);
    return {
      books,
      sourceHash: createHash("sha256").update(raw).digest("hex"),
      sourceLabel: relative(REPO_ROOT, options.sourceFile).replaceAll("\\", "/"),
    };
  }

  const catalog = readJson<{ apiBaseUrl: string; wordbookIds: string[] }>(options.catalogFile);
  const wantedIds = options.books === "all" ? catalog.wordbookIds : options.books;
  const snapshotPath = join(options.output, "source-snapshot.json");
  let snapshotBooks: Wordbook[] = [];
  if (!options.refreshSource && existsSync(snapshotPath)) {
    const snapshot = readJson<{ books?: unknown[] }>(snapshotPath);
    snapshotBooks = (snapshot.books ?? []).map(normalizeWordbook);
  }
  const byId = new Map(snapshotBooks.map((book) => [book.id, book]));
  for (const id of wantedIds) {
    if (byId.has(id)) continue;
    console.log(`[source] fetching wordbook ${id}`);
    const book = await fetchApiBook(catalog.apiBaseUrl, id);
    byId.set(book.id, book);
  }
  const books = wantedIds.map((id) => byId.get(id)).filter((book): book is Wordbook => Boolean(book));
  validateWordbooks(books);
  mkdirSync(options.output, { recursive: true });
  const snapshot = {
    schemaVersion: 1,
    apiBaseUrl: catalog.apiBaseUrl,
    fetchedBookIds: books.map((book) => book.id),
    books,
  };
  const snapshotJson = JSON.stringify(snapshot, null, 2) + "\n";
  atomicWrite(snapshotPath, snapshotJson);
  return {
    books,
    sourceHash: createHash("sha256").update(snapshotJson).digest("hex"),
    sourceLabel: relative(REPO_ROOT, snapshotPath).replaceAll("\\", "/"),
  };
}

function selectBooks(books: Wordbook[], requested: string[] | "all") {
  if (requested === "all") return books;
  const byId = new Map(books.map((book) => [book.id, book]));
  return requested.map((id) => {
    const book = byId.get(id);
    if (!book) throw new Error(`Unknown wordbook id: ${id}`);
    return book;
  });
}

function selectArticles(requested: ArticleCode[] | "all") {
  return (requested === "all" ? ALL_ARTICLE_CODES : requested).map((code) => ARTICLE_SPECS[code]);
}

function shuffledWords(words: Word[], bookId: string, seed: string) {
  return words.map((word, index) => ({
    word,
    key: createHash("sha256")
      .update(`${seed}\u0000${bookId}\u0000${index}\u0000${word.no}\u0000${word.english}\u0000${word.japanese}`)
      .digest("hex"),
  })).sort((left, right) => left.key.localeCompare(right.key)).map(({ word }) => word);
}

function slugPart(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifactFile(path: string, outputRoot: string): ArtifactFile {
  return {
    path: relative(outputRoot, path).replaceAll("\\", "/"),
    bytes: statSync(path).size,
    sha256: sha256File(path),
  };
}

function atomicWrite(path: string, contents: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents);
  renameSync(temporary, path);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function writeUploadQueue(path: string, articles: ArticleManifest[]) {
  const header = [
    "book_id", "book_title", "article_code", "article_label", "word_count", "status",
    "document_1_label", "document_1_full_pdf", "document_1_sample_pdf", "document_1_preview_png",
    "document_2_label", "document_2_full_pdf", "document_2_sample_pdf", "document_2_preview_png",
    "note_draft_url", "upload_status",
  ];
  const rows = articles.map((article) => {
    const [first, second] = article.documents;
    return [
      article.bookId, article.bookTitle, article.articleCode, article.articleLabel, article.wordCount, article.status,
      first?.label, first?.fullPdf.path, first?.samplePdf.path, first?.previewPng.path,
      second?.label, second?.fullPdf.path, second?.samplePdf.path, second?.previewPng.path,
      "", article.status === "ready" ? "ready-for-note-draft" : "blocked",
    ].map(csvCell).join(",");
  });
  atomicWrite(path, [header.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n");
}

function findBrowser() {
  const candidates = [
    process.env.VPP_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find(existsSync);
  if (!found) throw new Error("Chrome/Edge not found. Set VPP_CHROME_PATH.");
  return found;
}

function run(command: string, args: string[], timeoutMs: number) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function unwrapWindowsCommand(path: string, depth = 0): string {
  if (depth > 3 || !path.toLowerCase().endsWith(".cmd")) return path;
  const contents = readFileSync(path, "utf8");
  const match = contents.match(/(?:call\s+)?"(?:%~dp0|%SCRIPT_DIR%)([^"\r\n]+\.(?:exe|cmd))"/i);
  if (!match) return path;
  const target = resolve(dirname(path), match[1]);
  return existsSync(target) ? unwrapWindowsCommand(target, depth + 1) : path;
}

function findOnPath(command: string) {
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true });
    const path = result.status === 0 ? (result.stdout || "").split(/\r?\n/).find(Boolean) : undefined;
    return path ? unwrapWindowsCommand(path.trim()) : null;
  }
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

function printHtmlToPdf(browser: string, htmlPath: string, pdfPath: string, profileDir: string) {
  mkdirSync(dirname(pdfPath), { recursive: true });
  run(browser, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    "--run-all-compositor-stages-before-draw",
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], 180_000);
  if (!existsSync(pdfPath) || statSync(pdfPath).size < 1_000) {
    throw new Error(`Browser did not create a usable PDF: ${pdfPath}`);
  }
}

function extractFirstPage(fullPdf: string, samplePdf: string) {
  const python = process.env.VPP_PYTHON_PATH || "python";
  const output = run(python, [join(SCRIPT_DIR, "pdf_first_page.py"), fullPdf, samplePdf], 60_000);
  return JSON.parse(output.split(/\r?\n/).at(-1) || "{}") as {
    fullPages: number;
    samplePages: number;
    widthPoints: number;
    heightPoints: number;
    firstPageText: string;
  };
}

function renderPreview(samplePdf: string, previewPng: string) {
  const configured = process.env.VPP_PDFTOPPM_PATH;
  const pdftoppm = configured
    ? (isAbsolute(configured) ? unwrapWindowsCommand(configured) : configured)
    : findOnPath("pdftoppm");
  if (!pdftoppm) throw new Error("pdftoppm not found. Set VPP_PDFTOPPM_PATH.");
  const prefix = previewPng.replace(/\.png$/i, "");
  run(pdftoppm, ["-f", "1", "-l", "1", "-singlefile", "-png", "-r", "160", samplePdf, prefix], 90_000);
  if (!existsSync(previewPng) || statSync(previewPng).size < 5_000) {
    throw new Error(`PNG preview was not created: ${previewPng}`);
  }
}

function readPngSize(path: string) {
  const buffer = readFileSync(path);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) throw new Error(`Invalid PNG: ${path}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function buildDocumentHtml(bodyHtml: string, title: string) {
  const safeTitle = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${safeTitle}</title><style>html,body{margin:0;background:#fff}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body><div id="print-root">${bodyHtml}</div></body></html>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.output, { recursive: true });
  const source = await loadWordbooks(options);

  if (options.list) {
    for (const book of source.books) console.log(`${book.id}\t${book.words.length}\t${book.title}`);
    console.log(`Articles: ${ALL_ARTICLE_CODES.map((code) => `${code}=${ARTICLE_SPECS[code].label}`).join(", ")}`);
    return;
  }

  const articlePlan = loadArticlePlan(options.planFile);
  const selectedBooks = selectBooks(source.books, options.books);
  const sharedArticles = articlePlan ? null : selectArticles(options.articles);
  const articleFilter = options.articles === "all" || options.articles.length === 0
    ? null
    : new Set(options.articles);
  const articlesForBook = (bookId: string) => {
    if (!articlePlan) return sharedArticles ?? [];
    return (articlePlan.books[bookId] ?? [])
      .filter((code) => !articleFilter || articleFilter.has(code))
      .map((code) => ARTICLE_SPECS[code]);
  };
  const expectedArticleBundles = selectedBooks.reduce(
    (total, book) => total + articlesForBook(book.id).length,
    0,
  );
  if (expectedArticleBundles === 0) throw new Error("The selection contains no article bundles.");
  const browser = findBrowser();
  const printBuilder = await import(new URL("../lib/print/full-builder.ts", import.meta.url).href) as typeof import("../lib/print/full-builder");
  const tempRoot = mkdtempSync(join(tmpdir(), "vpp-note-artifacts-"));
  const browserProfile = join(tempRoot, "browser-profile");
  const manifestPath = join(options.output, "manifest.json");
  const queuePath = join(options.output, "upload-queue.csv");
  const articles: ArticleManifest[] = [];
  const manifestBase = {
    schemaVersion: 1,
    state: "running",
    source: { label: source.sourceLabel, sha256: source.sourceHash },
    plan: articlePlan ? {
      label: relative(REPO_ROOT, articlePlan.path).replaceAll("\\", "/"),
      sha256: articlePlan.sha256,
    } : null,
    settings: {
      includeDate: false,
      showPageNumbers: true,
      footerText: FOOTER_TEXT,
      wordsPerPage: WORDS_PER_PAGE,
      randomSeed: options.seed,
      maxWords: options.maxWords,
    },
    articles,
  };

  const persist = (state: "running" | "ready" | "partial") => {
    const readyArticleBundles = articles.filter((article) => article.status === "ready").length;
    const failedArticleBundles = articles.filter((article) => article.status === "failed").length;
    const documentCount = articles.reduce((total, article) => total + article.documents.length, 0);
    atomicWrite(manifestPath, JSON.stringify({
      ...manifestBase,
      state,
      summary: {
        expectedArticleBundles,
        generatedArticleBundles: articles.length,
        readyArticleBundles,
        failedArticleBundles,
        expectedDocuments: expectedArticleBundles * 2,
        readyDocuments: documentCount,
        expectedArtifactFiles: expectedArticleBundles * 6,
        readyArtifactFiles: documentCount * 3,
        countMatchesPlan: articles.length === expectedArticleBundles,
      },
    }, null, 2) + "\n");
    writeUploadQueue(queuePath, articles);
  };
  persist("running");

  try {
    for (const book of selectedBooks) {
      const limitedWords = options.maxWords ? book.words.slice(0, options.maxWords) : book.words;
      for (const article of articlesForBook(book.id)) {
        const randomSeed = article.randomized ? `${options.seed}:${book.id}` : null;
        const words = article.randomized ? shuffledWords(limitedWords, book.id, options.seed) : [...limitedWords];
        const articleManifest: ArticleManifest = {
          bookId: book.id,
          bookTitle: book.title,
          articleCode: article.code,
          articleLabel: article.label,
          randomized: article.randomized,
          randomSeed,
          wordCount: words.length,
          status: "ready",
          documents: [],
        };
        articles.push(articleManifest);
        const articleDir = join(options.output, slugPart(book.id), article.code.toLowerCase());
        mkdirSync(articleDir, { recursive: true });

        console.log(`[generate] ${book.id} ${article.code} (${words.length} words)`);
        try {
          for (const documentSpec of article.documents) {
            const stem = `${slugPart(book.id)}__${article.code.toLowerCase()}__${slugPart(documentSpec.role)}`;
            const fullPdf = join(articleDir, `${stem}__full.pdf`);
            const samplePdf = join(articleDir, `${stem}__sample.pdf`);
            const previewPng = join(articleDir, `${stem}__preview.png`);
            const title = `${book.title}｜${documentSpec.titleSuffix}`;

            let inspection: ReturnType<typeof extractFirstPage>;
            if (!options.force && existsSync(fullPdf) && existsSync(samplePdf) && existsSync(previewPng)) {
              inspection = extractFirstPage(fullPdf, samplePdf);
            } else {
              const html = printBuilder.buildPrintHtml({
                title,
                words,
                type: "list",
                showPageNo: true,
                makeQuestion: (word) => printBuilder.makeQuestion(word, "en-ja"),
                plan: "admin",
                printStyle: documentSpec.printStyle,
                includeWatermark: false,
                showRecordFields: false,
                showClassField: false,
                showNumberField: false,
                showNameField: false,
                studentClass: "",
                studentNumber: "",
                studentName: "",
                includeDate: false,
                generatedAt: FIXED_GENERATED_AT,
                footerText: FOOTER_TEXT,
              });
              const htmlPath = join(tempRoot, `${stem}.html`);
              writeFileSync(htmlPath, buildDocumentHtml(html, title), "utf8");
              printHtmlToPdf(browser, htmlPath, fullPdf, browserProfile);
              inspection = extractFirstPage(fullPdf, samplePdf);
              renderPreview(samplePdf, previewPng);
            }

            const expectedPages = Math.ceil(words.length / WORDS_PER_PAGE);
            const a4Portrait = Math.abs(inspection.widthPoints - 595.28) < 3
              && Math.abs(inspection.heightPoints - 841.89) < 3;
            // Chromium may map Japanese glyphs to CJK compatibility code points in
            // the PDF text layer. NFKC keeps the visual check strict without false
            // negatives from those equivalent code points.
            const normalizedText = inspection.firstPageText.normalize("NFKC");
            const titleFound = normalizedText.includes(book.title.normalize("NFKC"))
              && normalizedText.includes(documentSpec.titleSuffix.normalize("NFKC"));
            const footerFound = normalizedText.includes(FOOTER_TEXT);
            const pageNumberFound = normalizedText.includes(`1/${expectedPages}`);
            if (inspection.fullPages !== expectedPages) {
              throw new Error(`${documentSpec.role}: expected ${expectedPages} pages, got ${inspection.fullPages}`);
            }
            if (inspection.samplePages !== 1) throw new Error(`${documentSpec.role}: sample is not one page.`);
            if (!a4Portrait) throw new Error(`${documentSpec.role}: PDF is not A4 portrait.`);
            if (!titleFound || !footerFound || !pageNumberFound) {
              throw new Error(`${documentSpec.role}: title/footer/page number validation failed.`);
            }
            const pngSize = readPngSize(previewPng);
            articleManifest.documents.push({
              role: documentSpec.role,
              label: documentSpec.label,
              title,
              printStyle: documentSpec.printStyle,
              fullPdf: artifactFile(fullPdf, options.output),
              samplePdf: artifactFile(samplePdf, options.output),
              previewPng: { ...artifactFile(previewPng, options.output), ...pngSize },
              validation: {
                expectedPages,
                fullPages: inspection.fullPages,
                samplePages: inspection.samplePages,
                a4Portrait,
                titleFound,
                footerFound,
                pageNumberFound,
              },
            });
          }
        } catch (error) {
          articleManifest.status = "failed";
          articleManifest.error = error instanceof Error ? error.message : String(error);
          console.error(`[failed] ${book.id} ${article.code}: ${articleManifest.error}`);
        }
        persist("running");
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  const failures = articles.filter((article) => article.status === "failed");
  const countMismatch = articles.length !== expectedArticleBundles;
  persist(failures.length || countMismatch ? "partial" : "ready");
  console.log(`[done] ${articles.length - failures.length}/${articles.length} article bundles ready`);
  console.log(`[manifest] ${manifestPath}`);
  console.log(`[queue] ${queuePath}`);
  if (failures.length || countMismatch) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
