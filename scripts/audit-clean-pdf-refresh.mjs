import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const directory = resolve(process.argv[2]);
const token = (await readFile(process.argv[3], "utf8")).trim();
const base = "https://www.vocabprint.com";
const headers = { "x-pdf-batch-token": token };
const before = JSON.parse(await readFile(join(directory, "before/catalog.json"), "utf8")).assets;
const completed = new Map((await readFile(join(directory, "completed.jsonl"), "utf8")).trim().split("\n").map((line) => {
  const item = JSON.parse(line);
  return [item.assetKey, item];
}));
const response = await fetch(`${base}/api/admin/pdf-assets`, { headers });
if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
const catalog = await response.json();
await writeFile(join(directory, "after-catalog.json"), JSON.stringify(catalog, null, 2));
const current = new Map(catalog.assets.map((asset) => [asset.assetKey, asset]));
const errors = [];
const preservedFields = ["id", "title", "description", "visibility", "variant", "outputKind", "priceJpy", "bundlePriceJpy", "fileName"];
for (const old of before) {
  const item = current.get(old.assetKey);
  if (!item) { errors.push(`Missing ${old.assetKey}`); continue; }
  if (!completed.has(old.assetKey)) errors.push(`Not completed ${old.assetKey}`);
  if (completed.get(old.assetKey)?.sizeBytes !== item.sizeBytes) errors.push(`Size mismatch ${old.assetKey}`);
  for (const field of preservedFields) if (old[field] !== item[field]) errors.push(`Changed ${field}: ${old.assetKey}`);
}
// Download one public sample per book to verify actual served bytes, not only metadata.
const samples = catalog.assets.filter((asset) => asset.assetKey === `${asset.wordbookId}::list::sample-image::public`);
let next = 0;
let verifiedSamples = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < samples.length) {
    const item = samples[next++];
    const localPath = join(directory, "after", item.wordbookId, "list__sample.jpg");
    const local = await readFile(localPath).catch(() => readFile(join("outputs/pdf-refresh-20260913/after", item.wordbookId, "list__sample.jpg")));
    const res = await fetch(`${base}/api/pdf-assets/${item.id}`);
    if (!res.ok) { errors.push(`Download HTTP ${res.status}: ${item.assetKey}`); continue; }
    const remote = Buffer.from(await res.arrayBuffer());
    const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
    if (sha(local) !== sha(remote)) errors.push(`Content mismatch ${item.assetKey}`);
    else verifiedSamples++;
  }
}));
const report = { before: before.length, after: catalog.assets.length, completed: completed.size, verifiedSamples, errors };
await writeFile(join(directory, "audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (errors.length) process.exitCode = 1;
