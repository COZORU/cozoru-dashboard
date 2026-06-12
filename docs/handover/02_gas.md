# 02. GAS バックエンド

> 最終更新: 2026-06 ／ ソースの正はこのリポジトリの [gas/](../../gas/)。開発フローの要点は [gas/README.md](../../gas/README.md) にもある。

## 概要

- バインド先: スプシ「経営指標dashboard」`1175R2Ow8Wr8GBk8bYzuWBQQ49zhmDp26sHF6PKwFGn0`
- scriptId: `1Ci20w_cUzW-PGyJ1nvY5EaHBI0Z8fnHzM_HFXS7PfBmTFIFuuRg5AxYk`／オーナー: info@cozoru.com
- 設計思想: **取込はGAS、集計はSheets関数**。GASの役割は「CSV→RAW書込」「帳票シートの再構築」「WebApp APIでのJSON配信」「PL（個社別）への値同期」

## ファイル役割マップ（28本）

### 設定・エントリポイント
| ファイル | 役割 |
|---|---|
| `00_Config.js` | **全定数を集約**（フォルダ名・シート名・列定義等）。運用変更はまずここ |
| `01_Setup.js` | シート初期化・マスタ初期値（初回構築用） |
| `02_Main.js` | エントリポイント。`runMonthlyProcess`（メニュー①）→ `processAll()` = CSV取込→各ダッシュボード再構築の本体 |
| `11_Menu.js` | スプシのメニュー「📊 ダッシュボード」定義 |
| `14_SheetProtect.js` | シート保護（移管時に一度実行） |

### CSV取込パイプライン
| ファイル | 役割 |
|---|---|
| `03_DrivePoller.js` | Drive `dashboard_input/` から未処理CSVペアを検出・処理後 archive へ移動 |
| `04_CsvParser.js` | streaming / invoice CSV のパース |
| `05_Joiner.js` | 2種CSVの結合（ライバー単位） |
| `06_Classifier.js` | 配信者種別（新規/移籍/既存）等の判定 |
| `07_MfCalculator.js` | マネジメントフィー（ダイヤボーナス）計算・Tier判定 |
| `08_RawWriter.js` | `RAW_ライバー月次` への upsert（重複防止） |
| `15_DailyIngest.js` | 日次CSV → `RAW_日次` への upsert |

### ダッシュボード再構築（スプシ内の DB_* シート生成）
| ファイル | 役割 |
|---|---|
| `09_Dashboard.js` | DB_サマリ（17セクション×53KPI×月列） |
| `10_LiverProfile.js` | ライバープロファイル |
| `12_C5Dashboard.js` | DB_新人C5達成率（レーベル別月次） |
| `13_GrowthForecast.js` | 成長ボーナス予測 |
| `16_LiverMonthly.js` | DB_ライバー月次（KPI・支援優先度・Tier移動・ROI・セグメント統合） |
| `17_ProgressDashboard.js` | DB_成長進捗 |
| `18_SegmentChart.js` | DB_セグメント（配信時間×応援ダイヤ4象限） |
| `19_DebutManagement.js` | DB_デビュー管理 |
| `banner_summary.js` | DB_バナー実績集計（スプシ内向け。**ダッシュボードAPIとは別物**・入賞判定が元フラグ由来な点に注意 → 05の5番） |

### PL（個社別）同期・保守
| ファイル | 役割 |
|---|---|
| `10_SyncToPL.js` | **M_月次ボーナスD列（iriam実額）→ PL売上への書込み**ほかリーフセル同期。`syncToPLAllMonths` / 月別関数もここ |
| `21_FullPLSync.js` | PL(全社)の数式診断・修正 |
| `23_FixOfficeName.js` | RAW の office 名正規化（一度実行系） |
| `24_RecalcMfTheoretical.js` | RAW の MF理論値再計算（一度実行系） |
| `99_Helper.js` | 経営指標スプシの精緻化関数群（数式適用・品質監査・検算）。`経営指標を全自動精緻化()` 等 |

### API
| ファイル | 役割 |
|---|---|
| `20_WebApp.js` | **doGet（JSON配信API）/ doPost（CSVアップロード受け口）**。バナイベ集計（`parseBannerRows_` / `aggregateBanners_` / `aggregateBannersMonthly_`）もこのファイル末尾 |

## WebApp API 仕様

- エンドポイント: `https://script.google.com/macros/s/AKfycbx97ckfoqqvD7Ozl834rPVChYmPuNBmbWlwnJMMLKWfYXB0ktgsE3kKznpvw7OjRjeg/exec`
- デプロイ設定: ウェブアプリ／アクセス「全員」／実行ユーザー「自分（オーナー）」
- レスポンス共通形: `{ "status": "ok", "data": { … } }`（エラー時 `{ "status": "error", "message": … }`）

### action 一覧（`?action=X`）

| action | 返すもの |
|---|---|
| `all`（既定） | summary + livers + debut |
| `summary` | 財務サマリ（`month` パラメータで月指定） |
| `livers` | ライバー一覧（Tier・ランク・3ヶ月系列） |
| `debut` | デビュー管理 |
| `fullpl` | PL(全社)系列 |
| `banners` | **バナイベ実績（回別＋月次）**。下記 |
| `logs` | 取込ログ直近30行 |
| `runsync` | syncToPL 単独実行（書込み系・取扱注意） |
| `debug` | デバッグ情報 |

### action=banners 詳細

パラメータ: `base=YYYYMMDD`（回別の基準日・省略時最新）／`basem=YYYYMM`（月次の基準月・省略時最新）

```jsonc
{
  "baseDate": "20260602",
  "weeks": ["20260602", "20260526", "20260519", "20260512"],   // 直近4回（新しい順）
  "byOrg":   [{ "name": "株式会社cozoru", "weekly": [{ "week": "...", "ptSum": 0, "avgPt": 0, "winCount": 0, "joinCount": 0 }], "totalPt": 0 }],
  "byLabel": [],            // byOrg と同型（レーベル別）
  "byLiver": [{ "name": "...", "office": "...", "label": "...", "weekly": [{ "week": "...", "rank": 0, "pt": 0, "win": false, "joined": true }] }],
  "events":  [],            // 回（EventId×Block）ごとの参加者リスト
  "summary": { "week": "...", "joinCount": 0, "winCount": 0, "winRate": 0, "avgPt": 0, "prev": {} },
  "noEventCount": 0,        // EventId未設定行の件数（最新回に帰属させて表示）
  "monthly": {              // ★2026-06追加。無い場合フロントは月次UIを出さない
    "baseMonth": "202606",
    "months": ["202606", "..."],      // 直近6ヶ月（新しい順）
    "allMonths": ["202405", "..."],   // 全期間（昇順）
    "byOrg": [{ "name": "...", "monthly": [{ "month": "...", "ptSum": 0, "avgPt": 0, "winCount": 0, "joinCount": 0 }], "totalPt": 0 }],
    "byLabel": [],
    "byLiver": [{ "name": "...", "office": "...", "label": "...", "monthly": [{ "month": "...", "joinCount": 0, "winCount": 0, "ptSum": 0, "bestRank": 0 }] }],
    "summary": { "month": "...", "joinCount": 0, "winCount": 0, "winRate": 0, "avgPt": 0, "eventCount": 0, "prev": {} },
    "trend": [{ "month": "...", "ptSum": 0, "avgPt": 0, "joinCount": 0, "winCount": 0, "winRate": 0, "eventCount": 0 }],  // 全期間
    "noEventCount": 0
  }
}
```

集計ルール: 入賞 = **rank 1〜100**（元データの入賞フラグは使わない）／期間キー = **EventId 先頭8桁**（月次はその年月）／同一ライバーの月内複数参加は合算、`bestRank` は月内最高順位。

## 開発フロー

1. **このリポジトリの `gas/` を編集**（本番GASエディタを直接いじらない）
2. clasp 準備（初回のみ）:
   ```bash
   npm i -g @google/clasp
   clasp login    # cozoruドメインのアカウントで → 再デプロイ含め全部CLI外でも操作可能
   # 作業フォルダに .clasp.json: {"scriptId":"1Ci20w_cUzW-PGyJ1nvY5EaHBI0Z8fnHzM_HFXS7PfBmTFIFuuRg5AxYk"}
   ```
3. `clasp pull` で本番との差分確認（`gas/` と一致しているはず。違ったら先に原因を確認）
4. 編集 → `clasp push`（HEADに反映される。**この時点ではWebアプリは旧版のまま**）
5. **Webアプリ再デプロイ**: スプシ → 拡張機能 → Apps Script → デプロイ → デプロイを管理 → 鉛筆 → バージョン「**新バージョン**」→ デプロイ（URL不変）
6. `gas/` の変更をコミット（本番とリポジトリの同期を保つ）

### ⚠️ 危険操作

- **`clasp push --force` 禁止**: ローカルに無い本番ファイルを削除する。必ず pull → 編集 → push
- `runsync` 等の書込み系 action・一度実行系スクリプト（23/24）は本番データを書き換える。実行前にスプシのバージョン履歴があることを確認

## バナイベ集計の変更手順（GAS↔Node 同期の流儀）

`gas/20_WebApp.js` のバナイベ集計関数は [tools/banner_aggregate.mjs](../../tools/banner_aggregate.mjs) と**同一ロジックを維持**する。
GASは単体テストしづらいため、Node側でテストを書き、両者の出力一致を機械検証する仕組みになっている。

1. `tools/banner_aggregate.mjs` をテスト先行で修正（`tools/test_banner_aggregate.mjs` にケース追加 → 実装）
2. `gas/20_WebApp.js` に同じ変更を反映（ES5風の書き方に合わせる）
3. `node tools/test_gas_banner_sync.mjs` — GASファイルを読み込んで両者の出力を deepEqual 比較。**これが通らないうちは push しない**
4. push → 再デプロイ後、`node tools/verify_banners_monthly.mjs` で本番レスポンスを検証

## トリガー・doPost

- **毎日10時台**: CSV自動取込トリガー（コードではなく**GASエディタの時計アイコン（トリガー）画面で手動設定**されている。移行・変更時はそこを確認）
- `doPost`: `/upload` ページからのCSVテキスト受け口（office・targetMonth・csvText を受けて RAW へ書込み）
