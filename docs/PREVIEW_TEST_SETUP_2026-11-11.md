# プレビューで「登録 → ログイン → 決済」を試す手順（2026-11-11）

鍵の値は、このファイル・チャット・コードに書かない。Vercel と Stripe の画面に直接入れる。

## 0. いまの状態
- GitHub のブランチ `preview/pricing-teacher-20261111` に、作業中の内容（料金改定・Teacher・登録画面の変更）を送った。
- main と本番（vocabprint.com）は変えていない。
- Vercel がこのブランチのプレビューを自動で作る。住所は Vercel の Deployments 画面に出る（例: `newvp-git-preview-…vercel.app`）。

## 1. Stripe（テストモード）で用意するもの
1. Stripe ダッシュボード右上の「テストモード」をオンにする。
2. 開発者 → API キー → **テスト用のシークレットキー**（`sk_test_` で始まる）を控える。
3. 開発者 → Webhook → エンドポイントを追加:
   - URL: `https://<プレビューの住所>/api/stripe/webhook`
   - プレビューに Vercel の保護（Deployment Protection）がかかっている場合は、手順3の「保護の回避」を先に済ませ、URL の末尾に `?x-vercel-protection-bypass=<回避用の値>` を付ける。
   - 送るイベント（サイトが処理する4つ）: `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`customer.subscription.updated`、`customer.subscription.deleted`
4. 作ったエンドポイントの **署名シークレット**（`whsec_` で始まる）を控える。

## 2. Vercel の環境変数（Preview だけに入れる）
Vercel → newvp → Settings → Environment Variables。**環境は「Preview」だけにチェック**（Production には入れない）。

| 名前 | 入れる値 |
|---|---|
| `STRIPE_SECRET_KEY` | 手順1-2 のテスト用シークレットキー |
| `STRIPE_WEBHOOK_SECRET` | 手順1-4 の署名シークレット |
| `NEXT_PUBLIC_APP_URL` | Preview には入れない（入っていたら Preview からは外す。入っていると決済後に本番へ戻ってしまう） |

Supabase の3つ（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）が Preview にも入っているか確認する。
入れたら、Deployments からこのブランチのプレビューを **Redeploy** する（環境変数は作り直さないと反映されない）。

## 3. 保護の回避（必要なときだけ）
Vercel → Settings → Deployment Protection。プレビューに保護がかかっていると Stripe の Webhook が届かない。
「Protection Bypass for Automation」で回避用の値を作り、手順1-3 の URL に付ける。

## 4. Supabase（ログインの戻り先）
Supabase → Authentication → URL Configuration → Redirect URLs に、プレビューの住所を追加:
`https://newvp-git-preview-*.vercel.app/**`（実際の住所に合わせる）
これがないと、確認メールのリンクを開いたときに本番へ戻ってしまう。

## 5. 試す順番
1. プレビューの料金ページを開く → 紫の「テストモードです」の表示を確認。
2. 自分のメール（例: Gmail の `+test` 付き）で新規登録 → 確認メール → ログイン画面に「メール認証が完了しました」。
3. 次の3つを順に申し込む。カードは `4242 4242 4242 4242`、有効期限は未来の日付、セキュリティコードは任意の3桁:
   - Personal（7日間アクセス 380円 → 以降 月1,580円）
   - Personal 年間（11,800円）
   - Teacher 月間（3,980円）／年間（24,960円）
4. 決済後、トップとアカウント画面でプランが切り替わっているか確認する。
5. Teacher になったら、単語テスト印刷の「CSV出力」の鍵が外れているか確認する。

## 注意
- Supabase は本番と同じデータベースの可能性が高い。テストで作ったアカウントは本番の会員一覧に入る。終わったら管理画面で消すか、テスト用と分かるメールアドレスを使う。
- テストモードの決済は、実際の請求にならない。
- 本番では今までどおり、本番用の鍵（`sk_live_`）のときだけ申し込みができる（`VERCEL_ENV=production` のときはテスト鍵を使わない）。
