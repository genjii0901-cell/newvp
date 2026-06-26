# Codex 引き継ぎ文書 — Vocab Print Pro

最終更新: 2026-06-27 / 作成: Claude Code セッションより

このファイルは、別のAIアシスタント（Codex等）が作業を引き継ぐための要約です。
作業前に `CLAUDE.md` と `docs/LAUNCH_CHECKLIST.md` も必ず読んでください。

---

## 1. プロジェクト概要

単語帳データから「一覧・問題・解答のA4 PDF（小テスト）」を生成するSaaS。
英検・大学受験・資格試験の単語テスト作成が主用途。先生・塾・自学者向け。

- 本番URL: https://newvp.vercel.app/
- GitHub: https://github.com/genjii0901-cell/newvp （ブランチ: `main`）
- ローカル: `C:\Users\genji\Documents\Codex\2026-06-23\vocab-print-pro-newvp-url-https\work\newvp`
- 現在のフェーズ: **公開準備中**（コードはほぼ完成、残りはアカウント設定）

## 2. 技術スタック

- Next.js 16.2.7（App Router）/ React 19 / TypeScript strict / TailwindCSS v4
- 認証・DB: Supabase（`@supabase/supabase-js` v2）
- 課金: Stripe（サブスク。Personal ¥780/月、Teacher ¥2,980/月）
- デプロイ: Vercel
- PDF生成: **`window.print()` + CSS印刷スタイル**（隠しiframeで印刷ダイアログを直接表示）

## 3. このセッションで実装した内容（重要）

1. **管理者画面のSupabase同期修正**
   - `wordbooks` テーブルの `id` は **整数（serial int）**。UUID前提のコードを整数も受け付けるよう修正（PATCH/DELETE）
   - `wordbooks` に `created_at` 列が**無い** → `ORDER BY created_at` を撤去
   - `cover_image` schema cache エラー対応（列が無くてもスキップして保存）
   - `app/api/admin/official-wordbooks/route.ts`, `app/api/admin/all-wordbooks/route.ts`
2. **フリー/パーソナル差別化**
   - フリーは印刷1ページ（50語）まで（`plan === "free" ? slice(0,50)`）
   - フリーはマイ単語帳の保存不可（`addCustomBook` でプランガード）
   - 画面コピー防止（user-select無効・右クリック禁止）
3. **印刷有効期限の表示は撤去**（`window.print()` では強制できず誤解を招くため）
4. **1ヶ月無料トライアル**（Personalのみ・カード登録必須・30日無料→自動課金）
   - `app/api/stripe/create-checkout-session/route.ts` に `trial_period_days=30`
   - 乱用防止: `profiles.trial_used` フラグ（**SQL未実行**: `docs/migrations/add-trial-used.sql`）
   - 解約→Freeは既存webhookで対応済み（`app/api/stripe/webhook/route.ts`）
5. **透かし（ウォーターマーク）**: ページ全体にタイル状。有料は**購入者メールを埋め込み**（流出抑止）
6. **公開ライブラリ = Supabase単一の真実**
   - `app/api/wordbooks/official/route.ts`: 管理者で削除すれば公開側からも消える
   - `is_official` の有無はスキーマで一度だけ判断（取得セットがぶれない＝件数が安定）
   - JSONフォールバック（`lib/official-wordbooks.ts`）は **Supabaseが空/未設定のときだけ**
7. **法的ページ**（公開フッターにリンク済み）
   - `app/legal/terms/page.tsx`（利用規約）
   - `app/legal/privacy/page.tsx`（プライバシー、連絡先 vocabprint@gmail.com）
   - `app/legal/tokushoho/page.tsx`（特商法: 事業者 神谷 元輝 / メール vocabprint@gmail.com / 住所・電話は請求次第開示）
8. **SEO**: `app/layout.tsx`（metadata/OGP/Twitter）、`app/robots.ts`、`app/sitemap.ts`

## 4. 重要な落とし穴（GOTCHAS）

- **`wordbooks.id` は整数**（UUIDではない）。ID比較・型変換に注意。
- **`wordbooks` に `created_at` 列が無い**。ORDER BY しないこと。
- `cover_image` / `visibility` / `is_official` 列は環境により無い場合がある → フォールバック前提で書く。
- `next.config.ts` は `ignoreBuildErrors: true`。**TS型エラーはビルドを止めない**。必ず `npx tsc --noEmit` で確認。
- `npm run build` はローカルWindowsで静的生成中にOOM（メモリ不足）で落ちることがあるが、**コンパイル成功していればVercel（Linux）では問題なし**。
- `lib/pdf/locked-pdf.ts`（画像化+暗号化PDF）は**未使用**。レイアウト崩れのため見送り。`jspdf`/`html2canvas` は入っているが現状未使用。
- 秘密鍵・トークンの値はコード/Markdownに書かない（環境変数名のみ）。

## 5. 未完了タスク（公開まで）— ユーザー側のアカウント操作

`docs/LAUNCH_CHECKLIST.md` 参照。順番：

1. [ ] Gmail `vocabprint@gmail.com` を実際に作成（取れなければ別名→法的ページ修正）
2. [ ] Supabaseで `docs/migrations/add-trial-used.sql` を実行（トライアル乱用防止）
3. [ ] ドメイン取得（候補 `vocabprint.com`、Vercelで直接購入が最も簡単）
4. [ ] Vercelにドメイン追加・DNS自動設定
5. [ ] 環境変数 `NEXT_PUBLIC_APP_URL` を独自ドメインに更新
6. [ ] Stripe本番モード切替＋Webhook登録（`https://<本番ドメイン>/api/stripe/webhook`、イベント: checkout.session.completed / customer.subscription.updated / customer.subscription.deleted）
7. [ ] 本番Price ID（Personal/Teacher）を環境変数に設定
8. [ ] 最終動作確認（登録→トライアル→解約→Free）

## 6. 状態メモ（追記候補）

秘密情報そのものは書かず、状態だけを更新してください。

| 項目 | 現在の記録 |
|---|---|
| Supabase | 本番/開発の別、主要テーブル件数は未記録。`docs/migrations/add-trial-used.sql` は未実行。 |
| Stripe | 本番Price ID、Webhook本番設定の完了状況は未記録。 |
| Vercel | `NEXT_PUBLIC_APP_URL` は現状 `https://newvp.vercel.app` 前提。独自ドメイン移行後に更新。 |
| ドメイン | 候補は `vocabprint.com`。取得/接続状況は未記録。 |
| Search Console / Analytics | 設定状況は未記録。 |
| 管理者 | `ADMIN_PASSWORD` は環境変数で管理。値は文書に書かない。 |
| 最終確認 | 2026-06-27 時点で `npm run typecheck` は成功。外部サービス連携の本番確認は未完了。 |

## 7. 今後の構想（ユーザー方針）

- **同一ブランド・同一ドメインで横展開**する方針（別ドメインに分けない）
- 将来追加したい機能: 「聞き流し（リスニング）」「テスト」
- 構成イメージ: `/print`（今のPDF）, `/listening`, `/test` を同じSupabase認証・同じサブスクで提供
- 個人事業主として有料化する（特商法は本名表示で対応済み）

## 8. 守るべきルール（CLAUDE.md より）

1. 既存機能を勝手に削らない（PDF生成・Auth・課金フロー）
2. 秘密鍵・トークンの値を書かない（環境変数名のみ）
3. 変更前に対象ファイルを必ず読む
4. 何を・なぜ・どのファイルを触るか説明してから変更
5. 大きく作り替える前に現在の構造を読む

## 9. ビルド・確認コマンド

```bash
npx tsc --noEmit      # 型チェック（最重要。ビルドは型エラーを無視するため）
npm run dev           # 開発サーバ（port 3000）
npm run build         # 本番ビルド（ローカルOOMはVercelに影響なし）
```

## 10. 重要ファイル一覧

| ファイル | 役割 |
|---|---|
| `app/page.tsx` | メイン画面・PDF生成・印刷・認証UI（巨大ファイル） |
| `app/admin/page.tsx` | 管理者パネル（公式単語帳CRUD） |
| `app/api/wordbooks/official/route.ts` | 公開単語帳API（Supabase単一の真実） |
| `app/api/admin/official-wordbooks/route.ts` | 管理者用 単語帳 CRUD API |
| `app/api/admin/all-wordbooks/route.ts` | 管理者一覧API |
| `app/api/stripe/create-checkout-session/route.ts` | チェックアウト（トライアル付与） |
| `app/api/stripe/webhook/route.ts` | Stripe Webhook（プラン更新・解約→Free） |
| `app/legal/*` | 法的3ページ |
| `lib/official-wordbooks.ts` | JSONフォールバック単語帳 |
| `lib/supabase/admin.ts` | サーバー用Supabaseクライアント |
| `docs/LAUNCH_CHECKLIST.md` | 公開チェックリスト |
| `docs/migrations/add-trial-used.sql` | 未実行のSQL |
