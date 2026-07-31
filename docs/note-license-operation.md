# Note購入者向けライセンスの運用

通常のVocab Print Pro本体にはライセンスキー入力欄を出しません。購入者には、Note記事に載せた専用URLだけを案内します。

## 初回設定

1. Supabase SQL Editorで `docs/note-license-schema.sql` を実行する。
2. Vercelの `newvp` プロジェクトに、サーバー専用環境変数 `LICENSE_CODE_SECRET` を追加する。
   - 32文字以上のランダムな文字列を使う。
   - コード・Note本文・チャットには書かない。
3. Vercelを再デプロイする。
4. `/admin` の `Noteライセンス` タブを開く。

## 単語帳専用ライセンス

1. `ライセンス商品を作成・更新` で、対象の単語帳を選ぶ。
2. URL用IDを決める。例: `system-eitango`。
3. `この単語帳だけ無料` を選び、保存する。
4. `ライセンスキーを発行` して、表示されたキーを安全に購入者へ渡す。
5. Noteには次のように案内する。

```
システム英単語の購入者用ページ: https://www.vocabprint.com/note/system-eitango
上のページでメールアドレス・パスワードを登録後、購入後にお渡しするライセンスキーを入力してください。
```

このURLはサイト内の通常メニュー、サイトマップ、検索結果には掲載しません。ただしURLだけでは利用できず、1回限りのライセンスキーと購入者自身のアカウント登録の両方が必要です。

## Note版Personalライセンス

1. 商品の `付与する内容` を `本体Personal相当（全単語帳）` にして保存する。
2. URL用IDの例は `note-personal`。
3. Noteには `https://www.vocabprint.com/access/note-personal` を案内する。

Note版PersonalはStripeの契約情報を書き換えません。別の利用権として扱うため、StripeのPersonal解約・返金処理と混ざらず、安全に併用できます。

## サンプル画面

購入前に見せる、機能を絞った例は次のURLです。

`https://www.vocabprint.com/access/sample`

このサンプルには実際のライセンス登録や印刷権限はありません。
