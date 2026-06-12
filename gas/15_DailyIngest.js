// 15_DailyIngest.gs
// 日次CSV取込: YYYYMMDD_YYYYMMDD_streaming_report_<office>.csv → RAW_日次 にupsert
//
// CSVフォーマット（0始まりインデックス）:
//   0: 集計開始日  1: 集計終了日  2: アカウント名  3: User ID
//   4: オーガナイザー名  18: ランク  21: 応援ダイヤ
//
// RAW_日次 スキーマ（7列）:
//   A: 集計終了日  B: 事務所名  C: User ID  D: アカウント名
//   E: 応援ダイヤ  F: ランク  G: 取込日時
//
// Upsertキー: 集計終了日 × 事務所名 × User ID

function processDailyCsvs() {
  var items = findUnprocessedDailyCsvs();
  if (items.length === 0) {
    appendLog_('INFO', '-', '-', '日次CSV: 処理対象なし');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_RAW_DAILY);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_RAW_DAILY);
  ensureRawDailyHeader_(sh);

  for (var i = 0; i < items.length; i++) {
    try {
      var count = processDailyCsv_(sh, items[i]);
      appendLog_('SUCCESS', items[i].targetMonth, items[i].office, '日次 ' + count + '件をupsert');
      moveToArchive_(items[i].file, items[i].targetMonth);
    } catch (e) {
      appendLog_('ERROR', items[i].targetMonth, items[i].office, '日次取込失敗: ' + e.message);
    }
  }
}

function processDailyCsv_(sh, item) {
  var text = item.file.getBlob().getDataAsString('UTF-8');
  var rows = parseCsv(text);
  if (rows.length === 0) return 0;

  // 既存データを一括読み込み → キーマップ化
  var lastRow = sh.getLastRow();
  var existing = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 7).getValues() : [];
  var keyToIdx = {};
  existing.forEach(function(r, i) {
    var d = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM-dd')
      : String(r[0]).substring(0, 10);
    keyToIdx[d + '|' + r[1] + '|' + r[2]] = i;
  });

  var now = new Date();
  var appended = [];
  var upsertCount = 0;

  for (var ri = 0; ri < rows.length; ri++) {
    var obj = rows[ri];
    var endDate     = String(obj['集計終了日']    || '').trim().replace(/\//g, '-').substring(0, 10);
    var accountName = String(obj['アカウント名'] || '').trim();
    var userId      = String(obj['User ID']      || '').trim();
    var rank        = String(obj['ランク']        || '').trim();
    var oenDia      = parseFloat(String(obj['応援ダイヤ'] || '0').replace(/,/g, '')) || 0;
    var office      = item.office;

    if (!endDate || !userId) continue;

    // 文字列 "yyyy-MM-dd" → Date型（Sheetsの日付関数で正しく比較するため）
    var dParts = endDate.split('-');
    var dateObj = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));

    var key = endDate + '|' + office + '|' + userId;
    var newRow = [dateObj, office, userId, accountName, oenDia, rank, now];

    if (keyToIdx[key] !== undefined) {
      existing[keyToIdx[key]] = newRow; // メモリ内で更新
    } else {
      keyToIdx[key] = existing.length + appended.length;
      appended.push(newRow);
    }
    upsertCount++;
  }

  // 一括書き込み（API呼び出しを最小化）
  if (existing.length > 0) {
    sh.getRange(2, 1, existing.length, 7).setValues(existing);
  }
  if (appended.length > 0) {
    sh.getRange(existing.length + 2, 1, appended.length, 7).setValues(appended);
  }

  return upsertCount;
}

function ensureRawDailyHeader_(sh) {
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== '集計終了日') {
    sh.getRange(1, 1, 1, 7).setValues([[
      '集計終了日', '事務所名', 'User ID', 'アカウント名', '応援ダイヤ', 'ランク', '取込日時'
    ]]);
    sh.getRange(1, 1, 1, 7)
      .setBackground('#1C4E80').setFontColor('#FFFFFF').setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-MM-dd');
    sh.setColumnWidth(1, 110);
    sh.setColumnWidth(2, 160);
    sh.setColumnWidth(3, 290);
    sh.setColumnWidth(4, 160);
    sh.setColumnWidth(5, 100);
    sh.setColumnWidth(6, 80);
    sh.setColumnWidth(7, 140);
  }
}
