const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>古典単語315 | Vocab Print Pro</title>
    <link rel="stylesheet" href="/note-koten315/styles.css" />
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/note/k315-7xq9m-vpnote-42f8">Vocab Print Pro</a>
      <nav>
        <a href="/note/k315-7xq9m-vpnote-42f8">単語帳</a>
        <a href="/note/k315-7xq9m-vpnote-42f8/activate">購入者登録</a>
      </nav>
    </header>
    <main id="app" class="shell"><div class="loading">読み込み中...</div></main>
    <script src="/note-koten315/app.js"></script>
  </body>
</html>`;

export const dynamic = "force-static";

export function GET() {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
