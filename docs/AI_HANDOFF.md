# AI_HANDOFF.md — Vocab Print Pro 引き継ぎ書

AIエージェントへの引き継ぎ用ドキュメントです。このプロジェクトを初めて触るAIはここを読んでください。

## サービスの目的

単語帳データ（番号・英単語・意味）から、教材用PDFを自動生成するSaaSサービス。
先生・学習者が単語帳を選び、「一覧・テスト・解答」の3種類のPDFを印刷できる。

- **本番URL**: https://newvp.vercel.app/
- **元サイト**: https://vocab-print-pro.vercel.app/

## 技術スタック

| 技術 | 用途 | バージョン |
|---|---|---|
| Next.js | フルスタックフレームワーク | 16.2.7（App Router） |
| React | UI | 19.2.4 |
| TypeScript | 型安全（strictモード） | ^5 |
| TailwindCSS | スタイリング | v4 |
| Supabase | 認証・データベース | @supabase/supabase-js ^2 |
| Stripe | サブスクリプション課金 | API経由 |
| Vercel | デプロイ・ホスティング | — |

## 実装済み機能

### PDF生成（コア機能）
- **場所**: `app/page.tsx` 内の `buildPrintHtml()` 関数と `printCss` 定数
- **仕組み**: HTML文字列を生成し `window.print()` で印刷（外部ライブラリなし）
- **種類**: 一覧PDF / 問題PDF / 解答PDF
- **方向**: 英→日 / 日→英 / スペルテスト
- **レイアウト**: A4縦・2列・50語/ページ・ページ番号付き
- **フォント**: Yu Gothic / Meiryo（日本語対応）

### 認証（Supabase Auth）
- メール+パスワードでログイン/新規登録
- `lib/supabase/client.ts`: ブラウザ用クライアント
- `lib/supabase/admin.ts`: サーバー用クライアント + `requireSupabaseUser()` / `ensureProfile()`

### プラン管理
| プラン | 料金 | 制限 |
|---|---|---|
| Free | 無料 | 1日3回・50語まで |
| Personal | ¥780/月 | 月300回・300語まで |
| Teacher | ¥2,980/月 | 月5000回・1900語まで |

### Stripe課金フロー
1. `/api/stripe/create-checkout-session` — Stripeチェックアウトセッション作成
2. Stripe決済完了後 → `?checkout=success&session_id=...` にリダイレクト
3. `/api/stripe/complete-checkout` — セッションIDを確認してプランを更新
4. `/api/stripe/webhook` — Stripe WebhookでDB更新（subscription作成/更新/削除）
5. `/api/stripe/create-portal-session` — 請求管理ポータル

### 使用量制限
- サーバー: `/api/usage/check`（DBに記録・上限チェック）
- フォールバック: `localStorage`（オフライン時）
- 記録: `/api/usage/record`（`pdf_generations`テーブルに保存）

### その他ページ
- `/check` — 環境変数・Supabase・Stripe設定の確認ページ
- `/pricing` — 料金プランページ
- `/admin` — 管理者パネル（パスワード保護）

## Supabaseテーブル設計（コードから推定）

コードを読んで推定したテーブル構造。**実際のテーブルはSupabaseダッシュボードで確認すること。**

### `profiles`
```sql
id          uuid (auth.users.id と対応)
email       text
plan        text  -- 'free' | 'personal' | 'teacher'
stripe_customer_id  text (nullable)
created_at  timestamptz
updated_at  timestamptz
```

### `subscriptions`
```sql
id                  uuid
user_id             uuid (profiles.id)
stripe_subscription_id  text
stripe_customer_id  text
status              text  -- 'active' | 'canceled' など
plan                text
current_period_start timestamptz
current_period_end   timestamptz
created_at          timestamptz
updated_at          timestamptz
```

### `pdf_generations`
```sql
id          uuid
user_id     uuid (profiles.id)
type        text  -- 'list' | 'test' | 'answer'
word_count  int
wordbook_id uuid (nullable)
created_at  timestamptz
```

### `wordbooks`（管理者が作成するオフィシャル単語帳）
```sql
id          uuid
title       text
level       text
premium     boolean
created_at  timestamptz
```

### `words`
```sql
id          uuid
wordbook_id uuid (wordbooks.id)
no          int
english     text
japanese    text
```

## 既知の課題・注意点

1. **`ignoreBuildErrors: true`**: `next.config.ts`でTypeScriptエラーがビルドを止めない設定になっている。`npx tsc --noEmit` で型エラーを確認すること。
2. **Supabaseテーブルが存在しない可能性**: テーブルが作られていないとAPIがエラーになる。`/check`ページで確認。
3. **Stripe Webhookの未設定**: VercelのURLを使ったWebhookエンドポイントをStripeダッシュボードに登録しないと、決済後のプラン更新が動かない。
4. **Next.js 16のAPI差異**: `AGENTS.md`に記載の通り、このNext.jsはトレーニングデータと異なるAPIを持つ可能性がある。

## 次にやること

`docs/ROADMAP.md` を参照。
