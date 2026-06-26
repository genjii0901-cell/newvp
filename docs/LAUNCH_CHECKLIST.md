# 公開準備チェックリスト

コード側で対応済みの項目と、**あなた（運営者）が手動で行う必要がある項目**を分けています。

## ✅ コード側で対応済み

- 利用規約 `/legal/terms`
- プライバシーポリシー `/legal/privacy`
- 特定商取引法に基づく表記 `/legal/tokushoho`
- フッターに各法的ページへのリンク
- SEOメタデータ（title / description / OGP / Twitter カード）
- `robots.txt` / `sitemap.xml`
- フリー/パーソナルのプラン差別化（1ページ制限・マイ単語帳保存制限）
- 初月無料トライアル（カード登録必須・乱用防止）

## ⚠️ あなたが手動で行う必要がある項目

### 1. 法的ページの確認（公開前に必須）
- [x] `/legal/tokushoho` の販売事業者名・運営責任者・連絡先を記入
- [x] `/legal/privacy` の連絡先メールアドレスを記入
- [ ] 利用規約・プライバシーの内容を確認（可能なら専門家のチェック）

### 2. Supabase（本番）
- [ ] `docs/migrations/add-trial-used.sql` を Supabase SQL Editor で実行
- [ ] 本番プロジェクトの URL / anon key / service role key を確認

### 3. Stripe（本番モード）
- [ ] テストモードで動作確認 → 本番モードに切替
- [ ] 本番の Price ID（Personal / Teacher）を取得
- [ ] Webhook エンドポイントを登録: `https://<本番ドメイン>/api/stripe/webhook`
      （イベント: checkout.session.completed / customer.subscription.updated / customer.subscription.deleted）
- [ ] Webhook signing secret を環境変数に設定

### 4. 独自ドメイン
- [ ] ドメインを取得（お名前.com / Cloudflare / Google Domains 等）
- [ ] Vercel のプロジェクト → Settings → Domains にドメインを追加
- [ ] 表示される DNS レコード（A / CNAME）をドメイン側に設定
- [ ] 反映後、`NEXT_PUBLIC_APP_URL` を独自ドメインに更新

### 5. Vercel 環境変数（本番）
`docs/ENVIRONMENT.md` の一覧をすべて本番値で設定:
- [ ] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
- [ ] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
- [ ] STRIPE_PRICE_PERSONAL / STRIPE_PRICE_TEACHER（本番Price ID）
- [ ] NEXT_PUBLIC_APP_URL（独自ドメイン）
- [ ] ADMIN_PASSWORD

### 6. 最終確認
- [ ] 本番URLで新規登録 → ログイン
- [ ] 無料プランで印刷（1ページ制限）を確認
- [ ] テストカードでトライアル登録 → プランが Personal になるか
- [ ] 解約 → Free に戻るか
- [ ] フッターの法的ページがすべて開くか
