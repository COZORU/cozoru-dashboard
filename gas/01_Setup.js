// 初回セットアップ: 全シートを作成し、マスタに初期値を投入
// 2026-04-30 MTG結果反映版（4源泉モデル + ダイヤボーナス対応）
// 既にデータがあるシートは上書きしない（getLastRow() > 0 で保護）
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  createSheetIfMissing_(ss, CONFIG.SHEET_M_OFFICE);
  createSheetIfMissing_(ss, CONFIG.SHEET_M_MONTHLY_BONUS);  // NEW
  createSheetIfMissing_(ss, CONFIG.SHEET_M_TIER);
  createSheetIfMissing_(ss, CONFIG.SHEET_M_CPN);
  createSheetIfMissing_(ss, CONFIG.SHEET_M_TAX);
  createSheetIfMissing_(ss, CONFIG.SHEET_M_DIA_RATE);
  createSheetIfMissing_(ss, CONFIG.SHEET_M_COLMAP);
  createSheetIfMissing_(ss, CONFIG.SHEET_RAW);
  createSheetIfMissing_(ss, CONFIG.SHEET_DB_SUMMARY);
  createSheetIfMissing_(ss, CONFIG.SHEET_DB_BY_OFFICE);
  createSheetIfMissing_(ss, CONFIG.SHEET_LOG);

  seedMasters_(ss);
  initRawHeader_(ss);
  initLogHeader_(ss);
  Logger.log('initSheets() done');
}

function createSheetIfMissing_(ss, name) {
  if (!ss.getSheetByName(name)) ss.insertSheet(name);
}

function seedMasters_(ss) {
  // M_事務所: 4/30 MTG確定の8列構造（3社共通 80/70/30+ボーナス補正±40/-30）
  var officeSheet = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  if (officeSheet.getLastRow() === 0) {
    officeSheet.getRange('A1:H1').setValues([[
      '事務所名', '表示名', 'アクティブ', 'MF率_Tier1', 'MF率_Tier2', 'MF率_Tier3',
      'ボーナス補正_最高', 'ボーナス補正_最低'
    ]]);
    officeSheet.getRange('A2:H4').setValues([
      ['株式会社cozoru', 'cozoru',      true, 0.80, 0.70, 0.30, 0.40, -0.30],
      ['ライブナウV',    'ライブナウV', true, 0.80, 0.70, 0.30, 0.40, -0.30],
      ['Tolance',         'Tolance',     true, 0.80, 0.70, 0.30, 0.40, -0.30]
    ]);
  }

  // M_月次ボーナス: 月×事務所×成長判定区分（最高/基本/最低）
  var bonusSheet = ss.getSheetByName(CONFIG.SHEET_M_MONTHLY_BONUS);
  if (bonusSheet.getLastRow() === 0) {
    bonusSheet.getRange('A1:D1').setValues([[
      '年月', '事務所名', '区分', 'iriam実額（任意・検算用）'
    ]]);
    // 区分プルダウン
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['最高', '基本', '最低'], true)
      .setAllowInvalid(false)
      .build();
    bonusSheet.getRange('C2:C100').setDataValidation(rule);
  }

  var tierSheet = ss.getSheetByName(CONFIG.SHEET_M_TIER);
  if (tierSheet.getLastRow() === 0) {
    tierSheet.getRange('A1:B1').setValues([['閾値項目', '値']]);
    tierSheet.getRange('A2:B4').setValues([
      ['Tier1_合計ダイヤ以上', 30000],
      ['Tier2_合計ダイヤ以上', 10000],
      ['Tier3_合計ダイヤ超',   0]
    ]);
  }

  // M_CPN: 4/30 MTG確定の5列構造（適用期間・備考列追加）
  var cpnSheet = ss.getSheetByName(CONFIG.SHEET_M_CPN);
  if (cpnSheet.getLastRow() === 0) {
    cpnSheet.getRange('A1:E1').setValues([['CPN種別', '単価', '状態', '適用期間', '備考']]);
    cpnSheet.getRange('A2:E5').setValues([
      ['C5', 60000, '現行', '2025-01〜', '30日50時間達成キャンペーン'],
      ['B2', 75000, '廃止', '発生〜2025-12 / 支払〜2026-02', '60日後支払い'],
      ['A',  40000, '現行', '2025-01〜', 'A/S分離表示'],
      ['S',  60000, '現行', '2025-01〜', 'A/S分離表示']
    ]);
  }

  var taxSheet = ss.getSheetByName(CONFIG.SHEET_M_TAX);
  if (taxSheet.getLastRow() === 0) {
    taxSheet.getRange('A1:B1').setValues([['項目', '値']]);
    taxSheet.getRange('A2:B2').setValues([['消費税率', 0.10]]);
  }

  var diaSheet = ss.getSheetByName(CONFIG.SHEET_M_DIA_RATE);
  if (diaSheet.getLastRow() === 0) {
    diaSheet.getRange('A1:B1').setValues([['項目', '値']]);
    diaSheet.getRange('A2:B2').setValues([['1ダイヤの円換算', 1]]);
  }

  // M_料率は廃止（CSV料率列で自動判定、固定値70は loadRateMaster_ にハードコード）
}

function initRawHeader_(ss) {
  var rawSheet = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (rawSheet.getLastRow() === 0) {
    rawSheet.getRange(1, 1, 1, CONFIG.RAW_COLUMNS.length).setValues([CONFIG.RAW_COLUMNS]);
    rawSheet.setFrozenRows(1);
  }
}

function initLogHeader_(ss) {
  var logSheet = ss.getSheetByName(CONFIG.SHEET_LOG);
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange('A1:E1').setValues([['実行日時', '種別', 'ファイル名/対象月', '事務所', 'メッセージ']]);
    logSheet.setFrozenRows(1);
  }
}
