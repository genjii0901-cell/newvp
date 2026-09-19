import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/genji/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { buildPrintHtml, makeQuestion, previewCss } = await import(pathToFileURL(resolve("lib/print/full-builder.ts")));

const BASE_URL = "https://www.vocabprint.com";
const PYTHON = "C:/Users/genji/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const ENCRYPT_WORKER = resolve("scripts/pdf-encrypt-worker.py");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const VARIANTS = [
  ["list", "単語一覧", "list", "en-ja", "standard", false, true],
  ["translation-test", "和訳テスト 問題", "test", "en-ja", "standard", false, true],
  ["translation-answer", "和訳テスト 解答", "answer", "en-ja", "standard", false, true],
  ["spelling-hint-test", "スペルテスト 頭文字あり 問題", "test", "spelling", "standard", false, true],
  ["spelling-blank-test", "スペルテスト 頭文字なし 問題", "test", "spelling", "standard", false, false],
  ["spelling-answer", "スペルテスト 解答", "answer", "spelling", "standard", false, true],
  ["random-list", "ランダム 単語一覧", "list", "en-ja", "standard", true, true],
  ["random-translation-test", "ランダム 和訳テスト 問題", "test", "en-ja", "standard", true, true],
  ["random-translation-answer", "ランダム 和訳テスト 解答", "answer", "en-ja", "standard", true, true],
  ["random-spelling-hint-test", "ランダム スペルテスト 頭文字あり 問題", "test", "spelling", "standard", true, true],
  ["random-spelling-blank-test", "ランダム スペルテスト 頭文字なし 問題", "test", "spelling", "standard", true, false],
  ["random-spelling-answer", "ランダム スペルテスト 解答", "answer", "spelling", "standard", true, true],
  ["red-japanese-list", "赤シート一覧 日本語赤字", "list", "en-ja", "red-japanese", false, true],
  ["red-english-list", "赤シート一覧 英語赤字", "list", "ja-en", "red-english", false, true],
].map(([id, label, type, direction, printStyle, random, showSpellingHint]) => ({
  id, label, type, direction, printStyle, random, showSpellingHint,
}));

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const cleanLayout = hasFlag("clean-layout");

function seededShuffle(items, seedText) {
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const next = () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function randomOrderKey(variant) {
  if (!variant.random) return "";
  if (variant.direction === "spelling") return "random-spelling";
  if (variant.type === "list") return "random-list";
  return "random-translation";
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function makeDocument(book, variant) {
  const baseWords = book.words.map((word) => ({
    no: Number(word.no) || 0,
    label: String(word.no ?? ""),
    english: String(word.english ?? ""),
    japanese: String(word.japanese ?? ""),
  }));
  const words = variant.random ? seededShuffle(baseWords, `${book.id}:${randomOrderKey(variant)}`) : baseWords;
  const title = `${book.title} ${variant.type === "list" ? "一覧" : variant.type === "test" ? "問題" : "解答"}`;
  const body = buildPrintHtml({
    title,
    words,
    type: variant.type,
    makeQuestion: (word) => makeQuestion(word, variant.direction),
    direction: variant.direction,
    showPageNo: true,
    plan: "admin",
    printStyle: variant.printStyle,
    includeWatermark: false,
    showRecordFields: !cleanLayout,
    showClassField: false,
    showNumberField: false,
    showNameField: !cleanLayout,
    studentClass: "",
    studentNumber: "",
    studentName: "",
    includeDate: !cleanLayout,
    generatedAt: new Date(),
    userEmail: "",
    footerText: "Created by Vocab Print Pro",
    fontScale: 1,
    layoutColumns: "two",
    wordsPerPage: 50,
    wordColumnWidth: 26,
    showSpellingHint: variant.showSpellingHint,
  });
  const head = `<meta charset="utf-8"><title>${escapeHtml(book.title)} ${escapeHtml(variant.label)}</title>`;
  return {
    print: `<!doctype html><html lang="ja"><head>${head}</head><body style="margin:0"><div id="print-root">${body}</div></body></html>`,
    preview: `<!doctype html><html lang="ja"><head>${head}<style>${previewCss}</style></head><body><div id="print-root">${body}</div></body></html>`,
  };
}

function createEncryptWorker() {
  const child = spawn(PYTHON, [ENCRYPT_WORKER], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  const pending = [];
  lines.on("line", (line) => pending.shift()?.(JSON.parse(line)));
  return {
    run(request) {
      return new Promise((resolveRequest, rejectRequest) => {
        pending.push((result) => result.ok ? resolveRequest(result) : rejectRequest(new Error(result.message)));
        child.stdin.write(`${JSON.stringify(request)}\n`);
      });
    },
    close() { child.stdin.end(); },
  };
}

async function api(adminToken, path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), "x-pdf-batch-token": adminToken },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `${path} failed (${response.status}).`);
  return body;
}

async function upload(adminToken, blob, metadata) {
  const prepared = await api(adminToken, "/api/admin/pdf-assets/direct-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare", mimeType: metadata.mimeType, sizeBytes: blob.byteLength }),
  });
  const uploadResponse = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": metadata.mimeType },
    body: blob,
  });
  if (!uploadResponse.ok) throw new Error(`R2 upload failed (${uploadResponse.status}).`);
  await api(adminToken, "/api/admin/pdf-assets/direct-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "finalize", id: prepared.id, storagePath: prepared.storagePath, ...metadata }),
  });
}

const passwordFile = option("password-file");
const adminTokenFile = option("admin-token-file");
const workerCount = Math.max(1, Math.min(6, Number(option("workers", "4")) || 4));
const limit = Math.max(0, Number(option("limit", "0")) || 0);
const selectedBookIds = new Set(option("books").split(",").map((value) => value.trim()).filter(Boolean));
const selectedVariantIds = new Set(option("variants").split(",").map((value) => value.trim()).filter(Boolean));
const force = hasFlag("force");
const qaOutput = option("qa-output") ? resolve(option("qa-output")) : "";
const refreshDirectory = option("refresh-directory") ? resolve(option("refresh-directory")) : "";
const completed = new Set();
if (refreshDirectory) {
  await mkdir(join(refreshDirectory, "before"), { recursive: true });
  const lines = await readFile(join(refreshDirectory, "completed.jsonl"), "utf8").catch(() => "");
  for (const line of lines.split("\n").filter(Boolean)) completed.add(JSON.parse(line).assetKey);
}
if (!adminTokenFile || !passwordFile) throw new Error("--admin-token-file and --password-file are required.");
const passwordLines = (await readFile(passwordFile, "utf8")).split(/\r?\n/);
const ownerPassword = passwordLines[3] ?? "";
const adminToken = (await readFile(adminTokenFile, "utf8")).trim();
if (!adminToken || ownerPassword.length < 24) throw new Error("Required credentials are not available.");

const catalog = await api(adminToken, "/api/admin/pdf-assets");
const priorAssets = new Map((catalog.assets ?? []).map((asset) => [asset.assetKey, asset]));
if (refreshDirectory) await writeFile(join(refreshDirectory, "before", "catalog.json"), JSON.stringify(catalog, null, 2), { flag: "wx" }).catch((error) => { if (error.code !== "EEXIST") throw error; });
const existing = new Set((catalog.assets ?? []).map((asset) => asset.assetKey).filter(Boolean));
const bookList = await api(adminToken, "/api/admin/all-wordbooks?includeWords=0&includeWordStats=1");
const listedBooks = Array.isArray(bookList.wordbooks) ? bookList.wordbooks : [];
const books = [];
let nextBook = 0;
await Promise.all(Array.from({ length: Math.min(6, listedBooks.length) }, async () => {
  while (nextBook < listedBooks.length) {
    const index = nextBook++;
    const id = listedBooks[index].id;
    if (selectedBookIds.size && !selectedBookIds.has(String(id))) continue;
    try {
      const detail = await api(adminToken, `/api/admin/all-wordbooks?includeWords=1&includeWordStats=1&id=${encodeURIComponent(id)}`);
      const book = detail.wordbooks?.find((item) => item.id === id);
      if (book?.words?.length) books.push(book);
    } catch (error) {
      console.error(`Book ${id} could not be loaded: ${error.message}`);
    }
  }
}));
books.sort((a, b) => a.title.localeCompare(b.title, "ja"));

const targetBooks = selectedBookIds.size ? books.filter((book) => selectedBookIds.has(String(book.id))) : books;
if (selectedBookIds.size && targetBooks.length !== selectedBookIds.size) {
  const found = new Set(targetBooks.map((book) => String(book.id)));
  const missing = [...selectedBookIds].filter((id) => !found.has(id));
  throw new Error(`Selected wordbooks were not found: ${missing.join(", ")}`);
}

let tasks = targetBooks.flatMap((book) => VARIANTS.map((variant) => ({ book, variant })))
  .filter(({ variant }) => !selectedVariantIds.size || selectedVariantIds.has(variant.id))
  .filter(({ book, variant }) => {
  return force || ["full-pdf::sale", "sample-pdf::public", "sample-image::public"].some((suffix) => !existing.has(`${book.id}::${variant.id}::${suffix}`));
});
if (limit) tasks = tasks.slice(0, limit);
console.log(`Fast catalog: ${books.length} books, ${tasks.length} pending variants, ${workerCount} workers.`);

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
let nextTask = 0;
let saved = 0;
let failed = 0;
const startedAt = Date.now();

await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
  const page = await browser.newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 1.5 });
  const encryptor = createEncryptWorker();
  try {
    while (nextTask < tasks.length) {
      const taskIndex = nextTask++;
      const { book, variant } = tasks[taskIndex];
      const baseKey = `${book.id}::${variant.id}`;
      const pending = [
        ["full-pdf", "sale", "application/pdf", "pdf"],
        ["sample-pdf", "public", "application/pdf", "pdf"],
        ["sample-image", "public", "image/jpeg", "jpg"],
        ...(catalog.assets ?? []).filter((asset) => asset.wordbookId === String(book.id) && asset.variant === variant.id && asset.visibility === "admin")
          .map((asset) => [asset.outputKind, "admin", asset.mimeType, asset.mimeType === "application/pdf" ? "pdf" : "jpg"]),
      ].filter(([output, visibility]) => !completed.has(`${baseKey}::${output}::${visibility}`) && (force || !existing.has(`${baseKey}::${output}::${visibility}`)));
      if (!pending.length) continue;
      const token = `${process.pid}-${workerIndex}-${taskIndex}`;
      const sourcePath = resolve(tmpdir(), `vpp-${token}-source.pdf`);
      const fullPath = resolve(tmpdir(), `vpp-${token}-full.pdf`);
      const samplePath = resolve(tmpdir(), `vpp-${token}-sample.pdf`);
      try {
        const document = makeDocument(book, variant);
        await page.emulateMedia({ media: "print" });
        await page.setContent(document.print, { waitUntil: "load" });
        await page.evaluate(() => document.fonts?.ready);
        const rawPdf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
        await writeFile(sourcePath, rawPdf);
        await encryptor.run({ source: sourcePath, full: fullPath, sample: samplePath, password: ownerPassword });

        await page.emulateMedia({ media: "screen" });
        await page.setContent(document.preview, { waitUntil: "load" });
        await page.evaluate(() => document.fonts?.ready);
        const sampleImage = await page.locator(".print-page").first().screenshot({ type: "jpeg", quality: 91 });
        const files = {
          "full-pdf": await readFile(fullPath),
          "sample-pdf": await readFile(samplePath),
          "sample-image": sampleImage,
        };
        if (qaOutput) {
          const bookDirectory = join(qaOutput, String(book.id));
          await mkdir(bookDirectory, { recursive: true });
          await Promise.all([
            writeFile(join(bookDirectory, `${variant.id}__full.pdf`), files["full-pdf"]),
            writeFile(join(bookDirectory, `${variant.id}__sample.pdf`), files["sample-pdf"]),
            writeFile(join(bookDirectory, `${variant.id}__sample.jpg`), files["sample-image"]),
          ]);
        }
        await Promise.all(pending.map(async ([output, visibility, mimeType, extension]) => {
          const assetKey = `${baseKey}::${output}::${visibility}`;
          const prior = priorAssets.get(assetKey);
          if (refreshDirectory && prior) {
            const backupPath = join(refreshDirectory, "before", `${prior.id}.${extension}`);
            const backupExists = await readFile(backupPath).then((buffer) => buffer.length === prior.sizeBytes).catch(() => false);
            if (!backupExists) {
              const response = await fetch(`${BASE_URL}/api/admin/pdf-assets/${prior.id}`, { headers: { "x-pdf-batch-token": adminToken } });
              if (!response.ok) throw new Error(`Backup failed (${response.status}).`);
              const buffer = Buffer.from(await response.arrayBuffer());
              if (buffer.length !== prior.sizeBytes) throw new Error("Backup size mismatch.");
              await writeFile(backupPath, buffer);
            }
          }
          const isSample = output !== "full-pdf";
          const title = `${book.title} ${variant.label}${isSample ? " サンプル" : ""}`;
          const randomOrderNote = variant.random ? "問題と解答は同じランダム順で、番号を見ながら照合できます。" : "";
          const defaultDescription = `${book.title}の${variant.label}。${isSample ? "購入前に仕上がりを確認できる先頭1ページのサンプルです。" : "A4印刷用の完全版PDFです。購入後は何度でもダウンロードできます。"}`;
          const priorDescription = String(prior?.description ?? defaultDescription).replace(/問題と解答は同じランダム順で、番号を見ながら照合できます。/g, "");
          await upload(adminToken, files[output], {
            title: prior?.title ?? title,
            description: `${priorDescription}${randomOrderNote}`,
            wordbookId: book.id,
            wordbookTitle: book.title,
            kind: "generated",
            visibility,
            variant: variant.id,
            outputKind: output,
            assetKey: `${baseKey}::${output}::${visibility}`,
            priceJpy: prior?.priceJpy ?? 500,
            bundlePriceJpy: prior?.bundlePriceJpy ?? 980,
            mimeType,
            fileName: prior?.fileName ?? `${title.replace(/[\\/:*?"<>|]+/g, "_")}.${extension}`,
          });
          if (refreshDirectory) await appendFile(join(refreshDirectory, "completed.jsonl"), JSON.stringify({ assetKey, sizeBytes: files[output].length, completedAt: new Date().toISOString() }) + "\n");
          existing.add(`${baseKey}::${output}::${visibility}`);
          saved += 1;
        }));
        const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
        console.log(`[${taskIndex + 1}/${tasks.length}] ${book.title} / ${variant.label} - saved ${saved}, failed ${failed}, ${Math.round(saved / elapsed * 60)} files/min`);
      } catch (error) {
        failed += pending.length;
        console.error(`[${taskIndex + 1}/${tasks.length}] ${book.title} / ${variant.label}: ${error.message}`);
      } finally {
        await Promise.all([sourcePath, fullPath, samplePath].map((path) => rm(path, { force: true }).catch(() => null)));
      }
    }
  } finally {
    encryptor.close();
    await page.close();
  }
}));

await browser.close();
console.log(`Fast catalog complete: saved ${saved}, failed ${failed}.`);
if (failed) process.exitCode = 1;
