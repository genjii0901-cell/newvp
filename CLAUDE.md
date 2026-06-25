# CLAUDE.md — Vocab Print Pro 作業方針

このファイルはClaude Codeが毎回読む方針書です。作業前に必ず読んでください。

## プロジェクト概要

単語帳データから「一覧PDF・テストPDF・解答PDF」を生成するSaaSサービス。
Next.js + Supabase（認証・DB）+ Stripe（課金）+ Vercel（デプロイ）で構成。

- 本番URL: https://newvp.vercel.app/
- 元サイト: https://vocab-print-pro.vercel.app/
- 詳細: `docs/AI_HANDOFF.md`

## 絶対に守るルール

1. **既存機能を勝手に削らない** — PDF生成・Supabase Auth・Stripe課金フローは現状維持
2. **秘密鍵・トークンの値をコードやMarkdownに書かない** — 環境変数名だけ扱う
3. **変更前に対象ファイルを必ず読む** — 構造を確認してから編集する
4. **変更前に「何を・なぜ・どのファイルを触るか」を説明する**
5. **大きく作り替える前に現在の構造を読む**

## 作業前の確認手順

```
1. 関連ファイルをReadで読む
2. 何を変更するか・なぜ変更するかを説明する
3. ユーザーの承認を得てから編集する
4. 変更後に動作確認（ビルド or ブラウザ確認）
```

## 優先順位（現在のフェーズ）

詳細は `docs/ROADMAP.md` を参照。

1. ビルドエラーをなくす（`next build` が通る状態にする）
2. 既存のPDF生成機能を壊さない
3. Supabaseのログイン・会員機能を確認する
4. Stripe課金を接続する
5. 管理画面・ユーザー管理・PDF履歴を整える
6. Vercel本番環境で動くようにする
7. UIを見やすく改善する

## 技術スタック

- **フレームワーク**: Next.js 16.2.7（App Router）/ React 19 / TypeScript strict
- **スタイル**: TailwindCSS v4
- **認証・DB**: Supabase (`@supabase/supabase-js` v2)
- **課金**: Stripe
- **PDF生成**: `window.print()` + CSS印刷スタイル（外部ライブラリなし）
- **デプロイ**: Vercel

## 重要ファイル

| ファイル | 役割 |
|---|---|
| `app/page.tsx` | メイン画面・PDF生成・認証UI（大きなファイル） |
| `lib/supabase/admin.ts` | サーバー用Supabaseクライアント・認証ユーティリティ |
| `lib/supabase/client.ts` | ブラウザ用Supabaseクライアント |
| `app/api/stripe/webhook/route.ts` | Stripe Webhookハンドラ |
| `app/api/usage/check/route.ts` | 使用量チェックAPI |
| `app/check/page.tsx` | 環境変数・設定確認ページ |

## 環境変数

必要な環境変数名の一覧: `docs/ENVIRONMENT.md`
値は絶対にコードやMarkdownに書かない。

## 注意事項

- `next.config.ts` で `ignoreBuildErrors: true` になっているため、TypeScriptエラーがビルドを止めない。`npx tsc --noEmit` で型エラーを確認すること。
- Next.js 16はトレーニングデータと異なるAPIを持つ可能性がある。`node_modules/next/dist/docs/` を参照。
- `AGENTS.md` に記載の通り、このNext.jsはトレーニングデータと異なるバージョンの可能性がある。
