# ENVIRONMENT.md — 必要な環境変数一覧

**重要: このファイルには変数名のみ記載します。値（APIキー・シークレット）は絶対に書かないでください。**

値はVercelダッシュボードまたはローカルの `.env.local`（gitignore済み）で管理してください。

---

## Supabase（必須）

| 変数名 | 種別 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 公開 | SupabaseプロジェクトのURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開 | Supabase匿名キー（ブラウザから使用） |
| `SUPABASE_SERVICE_ROLE_KEY` | **秘密** | Supabaseサービスロールキー（サーバーのみ） |

## Stripe（必須・課金を使う場合）

| 変数名 | 種別 | 説明 |
|---|---|---|
| `STRIPE_SECRET_KEY` | **秘密** | Stripeシークレットキー（サーバーのみ） |
| `STRIPE_WEBHOOK_SECRET` | **秘密** | Stripe Webhookの署名シークレット |
| `STRIPE_PRICE_PERSONAL` | **秘密** | PersonalプランのStripe Price ID |
| `STRIPE_PRICE_TEACHER` | **秘密** | TeacherプランのStripe Price ID |
| `NEXT_PUBLIC_STRIPE_PRICE_PERSONAL` | 公開 | PersonalプランのStripe Price ID（ブラウザ用） |
| `NEXT_PUBLIC_STRIPE_PRICE_TEACHER` | 公開 | TeacherプランのStripe Price ID（ブラウザ用） |

## アプリ設定

| 変数名 | 種別 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 公開 | アプリのベースURL（例: `https://newvp.vercel.app`） |
| `ADMIN_PASSWORD` | **秘密** | 管理画面のパスワード |

---

## 設定の確認方法

1. ブラウザで `/check` ページを開く — 各変数の設定状況が表示される
2. ローカル開発: `cp .env.local.example .env.local` して値を入力（`.env.local.example`が存在しない場合は上記の変数名を元に作成）
3. Vercel本番: Vercelダッシュボード → Project Settings → Environment Variables

## ローカル開発用テンプレート（`.env.local`）

```
# SupabaseプロジェクトのURLとキー（Supabaseダッシュボードから取得）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe（Stripeダッシュボードから取得）
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PERSONAL=
STRIPE_PRICE_TEACHER=
NEXT_PUBLIC_STRIPE_PRICE_PERSONAL=
NEXT_PUBLIC_STRIPE_PRICE_TEACHER=

# アプリURL（ローカルは http://localhost:3000）
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 管理画面パスワード（任意の文字列）
ADMIN_PASSWORD=
```

値は空欄のままにしてあります。**このテンプレートをそのままコミットしても安全です。**
