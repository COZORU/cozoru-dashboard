# cozoru 経営ダッシュボード

uyet社グループ3事務所（cozoru / ライブナウV / Tolance）のIRIAMライバー事業の経営KPIを自動集計・可視化するシステム。

- 本番: https://cozoru-dashboard.vercel.app （パスワード認証）
- **引き継ぎ資料・システムドキュメント: [docs/handover/00_overview.md](docs/handover/00_overview.md) から読む**

## 全体像（5行版）

```
iriam CSV（月6枚・手動投入）→ Drive → GAS自動取込 → スプシ（RAW + Sheets関数で集計）
                                          ├→ スプシ「経営指標」PL（個社別）＝メイン帳票
                                          └→ GAS WebApp API（JSON）→ このリポジトリ（Next.js on Vercel）
バナイベ実績は OMNIAスプシ → IMPORTRANGE で自動連携（手作業なし）
```

## クイックスタート（ローカル開発）

```bash
npm i
# .env.local を作成: GAS_API_URL=<GAS exec URL（Vercel環境変数と同じ値）>
npm run dev   # http://localhost:3000
```

詳細は [docs/handover/01_frontend.md](docs/handover/01_frontend.md)。

## リポジトリ構成

| ディレクトリ | 内容 |
|---|---|
| `app/` | Next.js App Router（ページ・/api/data GASプロキシ・認証） |
| `components/` | UI部品（`banner/` = バナイベ実績タブ一式） |
| `gas/` | **GASソースのミラー（編集の起点）**。開発フロー: [gas/README.md](gas/README.md) |
| `tools/` | バナイベ集計のテスト・検証スクリプト（Node.js） |
| `docs/handover/` | 引き継ぎ資料一式（00〜07 + KPI定義書） |

## デプロイ

- **フロント**: main へ push → Vercel 自動デプロイ
- **GAS**: `gas/` を編集 → clasp push → Webアプリ再デプロイ（**「新バージョン」選択必須**）。手順: [docs/handover/02_gas.md](docs/handover/02_gas.md)

## テスト

```bash
node components/banner/format.test.mjs
node tools/test_banner_aggregate.mjs
node tools/test_gas_banner_sync.mjs   # GASとNodeの集計ロジック一致を機械検証
```
