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

## 管理者認証（2026-07 セキュリティ更新）

| 変数名 | 種別 | 説明 |
|---|---|---|
| `ADMIN_SESSION_SECRET` | **秘密** | 管理者セッション署名とDB保存TOTPの暗号化に使う、32バイト以上のランダム値。新規環境では必ず設定してください。 |
| `ADMIN_TOTP_SECRET` | **秘密・任意** | UIではなく環境変数でTOTPを固定管理する場合のBase32シークレット。 |

`ADMIN_SESSION_SECRET` が未設定の既存環境では、互換性のため `ADMIN_PASSWORD`、次に
`SUPABASE_SERVICE_ROLE_KEY` を署名・暗号化キーとして使います。運用時は用途を分離した
`ADMIN_SESSION_SECRET` の設定を推奨します。値を変更すると既存の管理者セッションは失効し、
DB保存のTOTPシークレットを復号できなくなるため、無計画にローテーションしないでください。

この更新をデプロイする前に、Supabase SQL Editor で
`docs/migrations/harden-admin-auth.sql` を実行してください。未適用の場合は試行回数制限や
認証コード再利用防止を保証できないため、管理者ログインは安全側に失敗します。

値は空欄のままにしてあります。**このテンプレートをそのままコミットしても安全です。**
