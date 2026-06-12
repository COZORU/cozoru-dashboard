// 23_FixOfficeName.gs
// 既存 RAW の office 名を正規化（一度実行すればOK）

function fixLivenowOfficeNameInRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!sh) {
    Logger.log('!! RAW シートが見つかりません');
    return;
  }

  var lastRow = sh.getLastRow();
  if (lastRow < 2) {
    Logger.log('データなし');
    return;
  }

  // B列（office）を読み取り → 「株式会社ライブナウ」（および文字化けバリアント）を「ライブナウV」に書換
  var range = sh.getRange(2, 2, lastRow - 1, 1);  // B2:B最終行
  var values = range.getValues();

  var fixed = 0;
  var variants = {};
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][0] || '');
    if (v === '株式会社ライブナウ') {
      values[i][0] = 'ライブナウV';
      fixed++;
    } else if (v.indexOf('ライブナウ') >= 0 && v !== 'ライブナウV') {
      // 文字化けバリアント（例：「株式会���社ライブナウ」など）
      variants[v] = (variants[v] || 0) + 1;
      values[i][0] = 'ライブナウV';
      fixed++;
    }
  }

  if (fixed > 0) {
    range.setValues(values);
  }

  Logger.log('書換行数: ' + fixed);
  if (Object.keys(variants).length > 0) {
    Logger.log('文字化けバリアント検出:');
    Object.keys(variants).forEach(function(k) {
      Logger.log('  「' + k + '」: ' + variants[k] + '行');
    });
  }
}
