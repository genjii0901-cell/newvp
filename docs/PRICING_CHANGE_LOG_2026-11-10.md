# 料金改定・Teacher再開 作業記録（2026-11-10〜）

## 着手前の状態（記録）
- HEAD: 08ac12d（2026-11-02）。origin/main と差なし。未コミット65件（コード37＋新規2＋docs/outputs等）。
- 退避: タグ `backup-head-20261110`（HEAD）、タグ `backup-wip-20261110` ＋ブランチ `backup/wip-20261110-pricing`（未コミットのコード39ファイルのスナップショット）。
- 復元: `git checkout backup-wip-20261110 -- <ファイル>`
- HEAD の料金: Personal 初回7日間¥380→月¥1,580 / Teacher ¥2,980（新規停止 `TEACHER_PUBLIC_ENABLED=false` 2か所）。
- 未コミット: A/B案（trial780 / intro280）に書き換え済み、`app/pricing/page.tsx` は Teacher 関連を削除済み。

## 決定料金（2026-11-10 ユーザー確定、税込）
- Personal: 7日間¥380（以降 自動で月¥1,580）／年間「¥980/月」表示・年一括¥11,800
- Teacher（塾プランと同一）: 月¥3,980／年間 月換算¥2,080（年¥24,960）
- A/B案は廃止。既存契約者は据え置き。

## 作業ログ
- 2026-11-10: 現状調査・バックアップ・UI改善案の作成。
- 2026-11-10 実装（未コミット）: A/B案関連ファイルをHEADへ戻し（lib/pricing-experiment*, api/stripe/*, admin metrics 等）、api/pricing と personal-intro-subscription を削除。`lib/personal-pricing.ts` に新料金・personalOfferText・appendInlinePlanPrice を追加。create-checkout-session は interval(month/year) 対応・Teacher再開（金額は決済ページへ直接渡す方式、Stripe側Price作成不要）。料金ページを3カード＋登録ポップアップ(components/auth-dialog.tsx)→確認ポップアップ→Stripe に作り直し。特商法・規約・アカウント画面・/teacher の文言を更新。
- 確認: tsc OK / 料金ページのPC・スマホ表示OK / テスト49件中45件OK（失敗4件は speech.ts・wordbook-meta.ts＝Claude 1側の未コミット変更で、料金とは無関係）。
- 未確認: Stripeテスト決済（ローカルにキー無し）、ポップアップ実動作、本番の既存契約者。

## UI改善（提案）
- 現状: 料金ページの「始める」→ `/?print_auth=personal` へ画面遷移（トップに飛ぶ）。登録モーダルは app/page.tsx の中にしかない。
- 案: 料金ページ上でそのまま (1) 登録/ログインのポップアップ → (2) 決済内容の確認ポップアップ → (3) Stripe へ、と遷移なしで進める。登録部品を共通化。
- 2026-11-11 実装（未コミット）: 管理者の試用モード。/account の「管理者の試用」で Free/Personal/Teacher と「初回7日間アクセス 対象/体験済み」、「購入者ビュー」を切替。購入者と同じ DB 項目（profiles.plan / trial_used）を書き換えるだけで専用処理なし。購入者ビューON中は Cookie `vpp_customer_view` により管理者の全機能開放（Teacher扱い）を外す（/api/me/profile, /api/usage/check, /api/wordbooks/export）。管理者はStripe契約が無くてもplanをfreeへ自動で戻さない。
- 未確認: 実ブラウザでの切替動作（ローカルに .env が無く Supabase に接続できない）。Stripeテスト決済も同じ理由で未実施。

- 2026-11-11 Teacher: /teacher に「機能の提供状況」と自作単語帳のCSV出力・列名設定(app/teacher/csv-tool.tsx)を追加。公式単語帳CSVは会員に開放しない(教材流出防止)。未検証: Teacher会員でのログイン後の動作。

- 2026-11-11 管理画面に「ユーザー調査」タブ(app/admin/user-lookup-panel.tsx, app/api/admin/user-lookup/route.ts)を追加。メールからSupabase会員・プロフィール・Stripe契約を照合し原因の手がかりを表示(読み取りのみ)。テスト4件を新仕様へ更新(speech.test / community-samples.test)。未検証: ローカルに環境変数が無く実データでの照会は未実施。

- 2026-11-11 レスポンシブ整理: 全体の日本語改行設定(globals.css)、ホーム下にプラン欄(components/home-plan-section.tsx)、CSVツールのロック表示、フッターのタップ領域拡大、料金ページのスマホ縮小。375/768pxで横はみ出しなし。未検証: 実機Mac/iPhone/iPad。

## 2026-11-11（続き）
- 退避: タグ `backup-wip-20261111` ＋ブランチ `backup/wip-20261111-teacher-ui`（app/components/lib/tests/docs/tsconfig の作業中スナップショット。作業ツリーは未変更）。復元: `git checkout backup-wip-20261111 -- <ファイル>`、作業前に戻す: `git checkout backup-wip-20261110 -- <ファイル>`。
- トップの旧プランカード（無料会員/Personal）を削除し「プランと料金」に一本化。
- 赤字の対象を「自動更新」→「都度課金・都度購入・都度お支払い」に変更（料金ページ、トップ、登録画面、登録理由の文）。
- 鍵つき「CSV出力」ボタン（components/locked-feature-button.tsx）を単語テスト印刷とマイ単語帳に追加。未ログイン→登録画面、無料/Personal→Teacher案内、Teacher→CSV画面。
- 表記の矛盾修正: 単語帳の「（Pro）」→「（Personal）」、アカウント画面のTeacher説明、Teacherページの説明文、登録画面のTeacher料金を定数参照に。
- 登録画面の方式変更（本人決定 2026-11-11）: 普通の登録はアカウント作成だけ（プランの選択肢を出さない）。料金ページ等で申し込みを押して来た場合だけ「選択中のプラン: Personal／Teacher」を表示し、登録後に決済へ。「プランはあとで選ぶ」で無料登録に切替可。見出しを「アカウントを作成（無料）」に変更。11/2のコミット 08ac12d で戻したラジオ選択はこれで置き換え（戻す場合は `git checkout backup-wip-20261111 -- components/registration-plan-picker.tsx app/page.tsx`）。
- トップ下「プランと料金」に「機能を詳しく比べる（無料・Personal・Teacher）」の比較表を追加（Personalカードの「Personalの機能を詳しく見る」から開く）。未ログインの人に無料会員の「利用中」が出ていたのを修正。
- TEACHER_FEATURES（料金ページ）の誤り修正: 「クラス名・番号・氏名欄」（Personalでも可）と「複数教材・クラス別教材の管理」（未実装）を外し、「20ページ超」「CSV出力と列名」に。
- 不具合修正: メール認証から戻ったとき（/?auth=confirmed）の「認証が完了しました」が閉じた枠の中にあり見えなかった → ログイン画面を自動で開いて表示。未ログイン時のお知らせは枠が閉じていても表示。
