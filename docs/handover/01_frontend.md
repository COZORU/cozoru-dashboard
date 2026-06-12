# 01. フロントエンド（Next.js / Vercel）

> 最終更新: 2026-06 ／ 画面・APIプロキシ・認証・ローカル開発・デプロイを扱う。

## 技術スタック

| 項目 | バージョン |
|---|---|
| Next.js | 16.2.6（App Router） |
| React | 19.2.4 |
| TypeScript | 5系 |
| Tailwind CSS | v4 |
| recharts | 3.8.1（グラフ） |
| lucide-react | アイコン |

ビルド/実行: `npm run dev` / `npm run build` / `npm run lint`

## ページ構成（app/）

| パス | 内容 |
|---|---|
| `/dashboard` | ０ 財務管理（売上・PL系） |
| `/total-dashboard` | 総ダッシュボード |
| `/livers` | １ ライバー管理。タブ「① ライバー基盤」「② バナイベ実績」 |
| `/debut` | ２ デビュー管理 |
| `/marketing` | ３ マーケ管理 |
| `/upload` | CSVアップロード（GAS doPost へ送信） |
| `/login` | パスワード認証 |
| `/api/data` | **GASプロキシ**（下記） |
| `/api/auth` | 認証API（cookie発行） |

## データの流れ

```
ブラウザ → GET /api/data?action=X&base=…&basem=…
         → (サーバー側で) GAS exec URL へ転送 → JSONを返す
```

- 実装: [app/api/data/route.ts](../../app/api/data/route.ts)。クエリ `action` / `month` / `base` / `basem` をそのままGASへ転送する
- **60秒キャッシュ**（`s-maxage=60`）。GAS側を更新しても最大1分は古いデータが返ることがある
- GASのURLは環境変数 **`GAS_API_URL`**（Vercelの設定画面 → Settings → Environment Variables）

## 認証

- `POST /api/auth` にパスワードを送ると `cozoru_auth` cookie（httpOnly・30日）が発行される
- [middleware.ts](../../middleware.ts) が `/login` と `/api/auth` 以外の全パスを保護。cookie不一致なら `/login` へリダイレクト
- パスワードの正: Vercel 環境変数 **`DASHBOARD_PASSWORD`**（未設定時のフォールバック値はコード [app/api/auth/route.ts](../../app/api/auth/route.ts) 参照）

## バナイベ実績タブ（/livers 内・2026-06実装）

コンポーネントは `components/banner/` に分離されている。

| ファイル | 役割 |
|---|---|
| `BannerView.tsx` | 親。データフェッチ・**回別/月次の切替**・基準日/基準月セレクタ |
| `BannerKpiHeader.tsx` | 回別の全社サマリカード（`Delta`=前回比バッジを export） |
| `BannerMonthlyKpiHeader.tsx` | 月次の全社サマリ5カード（開催回数・前月比つき） |
| `BannerMonthlyTrend.tsx` | 全期間の月次トレンドグラフ2枚（recharts） |
| `BannerMatrix.tsx` | ①個社別・②レーベル別の期間×4指標マトリクス。**回別と月次で共用**（`labelFn`/`baseBadge` propsで期間ラベルを差替え） |
| `BannerLiverTable.tsx` | ③ライバー別（回別: 順位・pt） |
| `BannerLiverMonthlyTable.tsx` | ③ライバー別（月次: 参加回数・100位内回数・pt合計・最高位） |
| `types.ts` | API レスポンスの型定義（`BannerData` / `BannerMonthlyData`） |
| `format.ts` | 表示フォーマッタ（`fmt`/`ymdToLabel`/`ymToLabel`）。テスト: `format.test.mjs` |

設計上の決め事:

- 回別=直近4回、月次=直近6ヶ月＋全期間トレンド。期間の帰属は「EventId先頭8桁（イベント開始日）」基準（詳細: [03_spreadsheets.md](03_spreadsheets.md)）
- **APIレスポンスに `monthly` が無ければ月次UIを出さない**（旧GASとの互換のためのフォールバック。GASとフロントのデプロイ順序を気にしなくてよい）

## ローカル開発

```bash
git clone git@github.com:COZORU/cozoru-dashboard.git
cd cozoru-dashboard
npm i
# .env.local を作成（gitignore済み）:
#   GAS_API_URL=<GAS exec URL（Vercel環境変数と同じ値）>
npm run dev   # http://localhost:3000 → /login → パスワード
```

- 本番GASに繋がず月次UIを動かしたいとき: `node tools/mock_gas_server.mjs` で擬似GAS（port 3999）を起動し、`.env.local` を `GAS_API_URL=http://localhost:3999` に

## デプロイ

- **main へ push すると Vercel が自動デプロイ**（1〜2分）。本番: https://cozoru-dashboard.vercel.app
- Vercel プロジェクト: cozoru-s-projects（info@cozoru.com）
- プレビューデプロイ（PRごとのURL）は **Vercel SSO 保護**がかかっており外部から開けない。動作確認はローカル dev か本番で

## テスト

```bash
node components/banner/format.test.mjs   # フォーマッタ
node tools/test_banner_aggregate.mjs     # バナイベ集計ロジック
node tools/test_gas_banner_sync.mjs      # GAS↔Node 同期検証（02_gas.md 参照）
```
