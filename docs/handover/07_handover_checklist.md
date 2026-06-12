# 07. 引き継ぎチェックリスト

> 最終更新: 2026-06 ／ 引き継ぎMTGでこのページを開きながら進める。済んだら ☑ を入れてコミットする。

## A. 権限付与（付与する側: info@cozoru.com の管理者）

- [ ] GitHub: COZORU org へ招待し、`cozoru-dashboard` の write 権限を付与
- [ ] Vercel: プロジェクト（cozoru-s-projects / cozoru-dashboard）へメンバー追加。環境変数 `GAS_API_URL` / `DASHBOARD_PASSWORD` が閲覧できることを確認
- [ ] スプシ「経営指標dashboard」（`1175R2Ow…`）の編集権限
- [ ] スプシ「経営指標」（`1Bn8f2Gq…`）の編集権限
- [ ] Drive: `dashboard_input/`・archive フォルダの編集権限
- [ ] GASプロジェクトへのアクセス方針を決める（推奨: 引継先の個人アカウントをスクリプトの編集者に追加。clasp は cozoru ドメインのアカウントなら再デプロイまで可能）
- [ ] OMNIAスプシ（banner_active の IMPORTRANGE 元）の閲覧権限（バナイベ元データの調査時に必要。管理チームに依頼）

## B. 引き継ぎ完了の定義（全部チェックで完了）

- [ ] ローカルで `npm run dev` → ログイン → `/livers` のバナイベ実績（回別・月次）が表示できた（手順: [01_frontend.md](01_frontend.md)）
- [ ] テスト3本を実行できた: `node tools/test_banner_aggregate.mjs` / `node tools/test_gas_banner_sync.mjs` / `node components/banner/format.test.mjs`
- [ ] GASの変更を1回自走できた: `clasp pull` →（コメント追加など軽微な変更）→ `clasp push` → **再デプロイ（新バージョン）** → 反映確認（手順: [02_gas.md](02_gas.md)）
- [ ] 月次運用を1サイクル並走した（2026-07分を推奨。手順: [04_operations.md](04_operations.md)）
- [ ] [05_troubleshooting.md](05_troubleshooting.md) を通読し、不明点を質問会で解消した

## C. 質問対応（引き継ぎ元: 藤野）

- 窓口・連絡手段: ＿＿＿＿＿＿＿＿（MTGで記入）
- 対応期間: ＿＿＿＿年＿＿月末まで（MTGで合意して記入）
- 対応範囲の目安: 資料の不明点・障害時の助言。新機能開発は対象外

## D. 既知の未解決事項（このまま引き継ぐもの）

| 事項 | 状態 |
|---|---|
| バナイベの回内ブロック分離不可 | banner_active の BlockId（O列）が2026年分空のため。**OMNIA側でデータが入ればGAS側は対応済み**で即有効化（[05](05_troubleshooting.md)の6番） |
| ライブナウVの過去CSV未取込 | データ提供待ち。スプシ側の数式は準備済みで、CSVが入れば自動で埋まる |
| 「🌙②-3 全月自動同期」のタイムアウト | 既知。回避手順は [05](05_troubleshooting.md) の7番 |
| 旧・経営指標.xlsx との数値差（1〜2月で1%程度） | 「本システム（請求書ベース）が正」でクライアント合意済み（2026-05-02） |

## E. 引き継ぎ資料の更新ルール

- この `docs/handover/` がシステムドキュメントの正。**仕様を変えるPRでは関連資料も同時に更新**する
- `gas/` は本番GASのミラー。push したら必ずコミットして同期を保つ
