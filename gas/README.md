# gas/ — Google Apps Script ソース（本番ミラー）

> 最終更新: 2026-06 ／ ここが**編集の起点**。本番（GASエディタ）を直接編集せず、ここを変更して clasp で反映する。

## これは何か

経営指標dashboard スプレッドシートにバインドされた GAS プロジェクトのソース一式（28ファイル）。
CSV自動取込・帳票再構築・WebApp API（ダッシュボードへのJSON配信）を担う。

- バインド先スプシ: 経営指標dashboard `1175R2Ow8Wr8GBk8bYzuWBQQ49zhmDp26sHF6PKwFGn0`
- scriptId: `1Ci20w_cUzW-PGyJ1nvY5EaHBI0Z8fnHzM_HFXS7PfBmTFIFuuRg5AxYk`
- オーナー: info@cozoru.com
- 各ファイルの役割・API仕様: [../docs/handover/02_gas.md](../docs/handover/02_gas.md)

## 開発フロー（要点）

```bash
npm i -g @google/clasp
clasp login            # cozoruドメインのアカウントで（deployまで可能になる）
# 作業フォルダに .clasp.json を作る: {"scriptId":"1Ci20w_cUzW-PGyJ1nvY5EaHBI0Z8fnHzM_HFXS7PfBmTFIFuuRg5AxYk"}
clasp pull             # 本番との差分確認（このgas/と一致するはず）
# gas/ を編集して作業フォルダにコピー
clasp push             # 本番のHEADへ反映
```

push のあと、**Webアプリの再デプロイ**が必要（doGet/doPost の変更を本番URLに反映する操作）:

> スプシ → 拡張機能 → Apps Script → デプロイ → **デプロイを管理** → 鉛筆 → バージョン「**新バージョン**」を選択 → デプロイ（URLは変わらない）

⚠️ 「新バージョン」を選ばずにデプロイを押しても**何も反映されない**（実際にやらかした事例あり → docs/handover/05_troubleshooting.md の1番）。

## ⚠️ 危険操作

- **`clasp push --force` 禁止**: ローカルに無いファイルを本番から**削除**する。必ず `clasp pull` → 編集 → `clasp push` の順で
- `.clasp.json` はコミットしない（個人の認証コンテキストに依存するため）

## バナイベ集計を変更するとき

`20_WebApp.js` のバナイベ集計関数（`parseBannerRows_` / `aggregateBanners_` / `aggregateBannersMonthly_`）は、
[../tools/banner_aggregate.mjs](../tools/banner_aggregate.mjs)（Node.js・テスト付き）と**同一ロジックを維持**する決まり。

変更手順: ① `tools/` 側をテスト先行で修正 → ② `gas/20_WebApp.js` に同じ変更 → ③ `node tools/test_gas_banner_sync.mjs` で両者の出力一致を機械検証
