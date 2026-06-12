// CONFIG: 全ての定数を集約。運用変更時はこのファイルのみ編集
// 2026-04-30 MTG結果反映版（4源泉モデル + ダイヤボーナス対応）
var CONFIG = {
  // Google Drive フォルダ名（親→子の2階層で検索）
  PARENT_FOLDER: 'cozoru_sales management',
  INPUT_FOLDER: 'dashboard_input',
  ARCHIVE_FOLDER: 'dashboard_archive',

  // Sheets タブ名（マスタ層）
  SHEET_M_OFFICE: 'M_事務所',
  SHEET_M_MONTHLY_BONUS: 'M_月次ボーナス',  // NEW: 月次×事務所×成長判定区分
  SHEET_M_TIER: 'M_Tier',
  SHEET_M_CPN: 'M_CPN',
  // SHEET_M_RATE: 廃止（4/30 MTG後）、固定値70は loadRateMaster_ にハードコード
  SHEET_M_TAX: 'M_税率',
  SHEET_M_DIA_RATE: 'M_換算レート',
  SHEET_M_COLMAP: 'M_列マッピング',
  SHEET_M_LABEL: 'M_レーベル',

  // Sheets タブ名（データ層）
  SHEET_RAW: 'RAW_ライバー月次',

  // Sheets タブ名（データ層追加）
  SHEET_RAW_DAILY: 'RAW_日次',

  // Sheets タブ名（プレゼン層）
  SHEET_DB_SUMMARY: 'PL（個社別）',
  SHEET_DB_BY_OFFICE: 'DB_事務所別',
  SHEET_DB_GROWTH_FORECAST: 'DB_成長予測',
  SHEET_DB_PROGRESS: 'DB_成長進捗',
  SHEET_DB_LIVER_MONTHLY: 'DB_ライバー月次',
  SHEET_DB_SEGMENT: 'DB_セグメント',
  SHEET_LOG: '取込ログ',
  SHEET_GUIDE: '📋 使い方',

  // RAW_ライバー月次 の列順（36列）
  RAW_COLUMNS: [
    '対象月', '事務所名', 'User ID', 'アカウント名', 'レーベル名',
    'オーガナイザー登録日', '初回配信日時',
    '応援ポイント', '獲得ポイント',
    '配信回数', '配信日数', '総配信時間', '平均視聴数', '課金者数',
    '時間ダイヤ', '応援ダイヤ', '合計ダイヤ',
    'ランク', 'ダイヤボーナス',
    '30日50時間C5報酬', 'A1ランク到達CPN報酬', 'S1ランク到達CPN報酬',
    'デビューイラストCPN報酬', 'デビューランクCPN報酬',
    '事務所ダイヤ', 'ライバーダイヤ', 'ライバーダイヤ料率',
    '配信者種別',
    'Tier判定', 'アクティブ判定', 'デビュー判定', '新規獲得判定', 'レベシェア対象',
    'MF理論値',
    '取込日時', 'ソースファイル名',
    'カテゴリ表示名'
  ],

  // ダイヤボーナス対象の配信者種別（4/30 MTG確定: 新規 + 移籍）
  DIA_BONUS_TARGET_TYPES: ['新規', '移籍'],

  // ダイヤボーナス月上限（円、4/30 MTG確定）
  DIA_BONUS_MONTHLY_CAP: 25000000,

  // 消費税率（M_税率より参照、ハードコードしない）
  // 4源泉モデル：総売上(税抜) = (事務所ダイヤ + ダイヤボーナス + CPN) ÷ (1 + 税率)
};
