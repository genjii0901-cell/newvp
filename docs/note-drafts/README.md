# Note 販売記事の下書き

このフォルダの2本は、Noteエディタに貼り付けて使う販売記事の原稿です。

- `system-eitango-note.md`: システム英単語向け
- `koten-315-note.md`: 古典単語315向け

`[画像: ...]` は、運営者が用意した実際の画面・印刷例を挿入する場所です。画像は説明に対応する実画像だけを使い、表紙画像や書籍本文をそのまま転載しません。

## 公開前の必須設定

1. Supabase SQL Editor で `docs/note-license-schema.sql` を実行する。
2. Vercel の Production に、サーバー専用の `LICENSE_CODE_SECRET` を登録して再デプロイする。
3. `/admin` の **Noteライセンス** で、対象単語帳を選んで商品を作成する。
   - システム英単語: URL用ID `system-eitango`
   - 古典単語315: URL用ID `koten-315`
4. 同画面で購入者ごとに1回だけ使えるライセンスキーを発行し、Note記事の有料部分へ貼る。

既存のNote用URLも維持しますが、現在はサーバー側で検証する `/access/商品ID` へ移動します。旧試作の「任意の文字で通る」動作は廃止しました。
