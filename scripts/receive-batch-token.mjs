import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : "";
if (!outputPath) throw new Error("--output is required.");

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/vocab-print-token") {
    response.writeHead(404).end("Not found");
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", async () => {
    try {
      const token = new URLSearchParams(body).get("token")?.trim() ?? "";
      if (!token.startsWith("v2.") || token.length < 80) throw new Error("Invalid token.");
      await writeFile(outputPath, token, { encoding: "utf8", mode: 0o600 });
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><meta charset=\"utf-8\"><title>準備完了</title><p>高速作成の準備が完了しました。この画面は閉じて構いません。</p>");
      console.log(`Batch token saved to ${outputPath}`);
      setTimeout(() => server.close(), 100);
    } catch (error) {
      response.writeHead(400).end("Token handoff failed.");
      console.error(error.message);
      setTimeout(() => server.close(), 100);
    }
  });
});

server.listen(43117, "127.0.0.1", () => {
  console.log("Waiting for the authenticated admin handoff on 127.0.0.1:43117");
});
