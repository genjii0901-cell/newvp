# note用単語テスト素材のバッチ生成

現行の `lib/print/full-builder.ts` をそのまま利用し、noteの記事1本につき次をまとめて作ります。

- 2種類のフルPDF
- 各PDFの先頭1ページだけを抜き出したサンプルPDF（2ファイル）
- 各サンプルPDFのPNGプレビュー（2ファイル）
- 後日アップロードするための `manifest.json` と `upload-queue.csv`

すべてのPDFは日付なし、タイトルあり、ページ番号あり、フッターは厳密に `Created by motoki` です。ランダム版はseed固定なので、同じ単語データとseedなら何度実行しても同じ並びになります。

## 記事コード

| コード | 1つ目のPDF | 2つ目のPDF | 並び |
| --- | --- | --- | --- |
| `N` | 日本語空欄テスト | 解答 | 単語帳順 |
| `R` | 日本語空欄テスト | 解答 | ランダム |
| `RS` | 通常一覧 | 日本語赤字一覧 | 単語帳順 |
| `RRS` | 通常一覧 | 日本語赤字一覧 | ランダム |
| `E` | 英語空欄テスト | 解答 | 単語帳順 |

## 代表テスト

PowerShellでリポジトリ直下から実行します。

```powershell
node --experimental-strip-types scripts/generate-note-artifacts.ts `
  --source local `
  --books leap-basic `
  --articles RRS `
  --max-words 60 `
  --output outputs/note-artifacts-test `
  --force
```

## 公開中の24単語帳を生成

公開APIの取得結果は出力先の `source-snapshot.json` に保存されます。通常の再実行ではsnapshotを使い、追加取得や更新が必要な場合だけ `--refresh-source` を指定します。

```powershell
node --experimental-strip-types scripts/generate-note-artifacts.ts `
  --source api `
  --plan-file scripts/note-missing-plan.json `
  --output outputs/note-artifacts
```

`note-missing-plan.json` はnote未完成・素材補充対象の102記事（新規93件＋既存下書き更新9件）だけを指定します。最終manifestの `summary.expectedArticleBundles`、`generatedArticleBundles`、`readyArticleBundles` がすべて102で、`countMatchesPlan` がtrueなら件数検証も完了です。

一部だけ作る場合は、例として `--books 70,71 --articles R,RS,RRS --plan-file scripts/note-missing-plan.json` のように絞れます。既に6ファイルが揃っている記事は再生成しません。作り直す場合は `--force` を付けます。

`upload-queue.csv` は1行がnote記事1本です。ファイル制限などでアップロードを後回しにするときも、`note_draft_url` と `upload_status` を更新すれば続きから管理できます。

全件生成後は、manifestの件数・全612ファイルのSHA-256・validation・キュー行数・debugファイル混入をまとめて監査できます。

```powershell
python -B scripts/audit-note-artifacts.py outputs/note-artifacts `
  --plan-file scripts/note-missing-plan.json `
  --expected-bundles 102
```

## 必要なローカル実行環境

- Node.js 24（TypeScriptの型除去実行に使用）
- Google Chrome または Microsoft Edge
- Python 3 + `pypdf`
- Popplerの `pdftoppm`

自動検出できない場合は `VPP_CHROME_PATH`、`VPP_PYTHON_PATH`、`VPP_PDFTOPPM_PATH` で実行ファイルを指定できます。
