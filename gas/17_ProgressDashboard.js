// 17_ProgressDashboard.gs
// DB_成長進捗シート構築
//
// レイアウト:
//   行1: ヘッダー
//   行2〜: 事務所ごとに1行
//
// 列:
//   A: 事務所名
//   B: 対象月
//   C: 経過日 / 月日数
//   D: 進捗率
//   E: 現在累積ダイヤ（RAW_日次の最新スナップショット）
//   F: 3ヶ月基準（目標）
//   G: 月末予測
//   H: 予測判定（◎/○/✖）
//   I: 基準日（最新集計終了日）

function rebuildProgressDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var dailySh = ss.getSheetByName(CONFIG.SHEET_RAW_DAILY);
  var officeSh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);

  // ── 対象事務所 ──
  var lastOfficeRow = officeSh.getLastRow();
  var officeRows = officeSh.getRange(2, 1, lastOfficeRow - 1, 3).getValues();
  var offices = [];
  officeRows.forEach(function(r) {
    if (r[0] && (r[2] === true || r[2] === 'TRUE')) offices.push(String(r[0]));
  });

  // ── 今月・経過日数 ──
  var today = new Date();
  var currentYear = today.getFullYear();
  var currentMonth = today.getMonth() + 1;
  var currentMonthStr = currentYear + '-' + (currentMonth < 10 ? '0' + currentMonth : currentMonth);
  var daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  var elapsedDays = today.getDate();

  // ── RAW_月次から3ヶ月基準を算出 ──
  var req3mByOffice = calcReq3m_(rawSh, currentMonthStr, offices);

  // ── RAW_日次から事務所別・今月の最新累積ダイヤを取得 ──
  var currentByOffice = {};
  var latestDateByOffice = {};
  if (dailySh) {
    var dailyLastRow = dailySh.getLastRow();
    if (dailyLastRow > 1) {
      var dailyData = dailySh.getRange(2, 1, dailyLastRow - 1, 7).getValues();
      // 集計終了日が今月のもののみ集計
      var officeAccum = {};
      var officeLatest = {};
      dailyData.forEach(function(r) {
        var endDateStr = r[0] instanceof Date
          ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM-dd')
          : String(r[0]).substring(0, 10);
        var month = endDateStr.substring(0, 7);
        if (month !== currentMonthStr) return;
        var office = String(r[1]);
        var oenDia = parseFloat(r[4]) || 0;
        var endDate = endDateStr;
        // 事務所ごとの最新日付を追跡してその日付のデータだけ集計
        if (!officeLatest[office] || endDate > officeLatest[office]) {
          officeLatest[office] = endDate;
          officeAccum[office] = 0;
        }
        // 最新日付のデータのみ
      });
      // 2パス: 最新日付のみ合計
      dailyData.forEach(function(r) {
        var endDateStr = r[0] instanceof Date
          ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM-dd')
          : String(r[0]).substring(0, 10);
        var month = endDateStr.substring(0, 7);
        if (month !== currentMonthStr) return;
        var office = String(r[1]);
        if (endDateStr !== officeLatest[office]) return;
        var oenDia = parseFloat(r[4]) || 0;
        officeAccum[office] = (officeAccum[office] || 0) + oenDia;
      });
      offices.forEach(function(o) {
        currentByOffice[o] = officeAccum[o] || 0;
        latestDateByOffice[o] = officeLatest[o] || '';
      });
    }
  }

  // ── シート構築 ──
  var sh = ss.getSheetByName(CONFIG.SHEET_DB_PROGRESS);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_DB_PROGRESS);
  sh.clear();
  sh.clearConditionalFormatRules();

  var BG_HEADER = '#1C4E80';
  var FG_WHITE  = '#FFFFFF';
  var FG_DARK   = '#212529';
  var BG_BEST   = '#D5F5E3';
  var BG_LOW    = '#FADBD8';
  var FG_GRAY   = '#888888';

  // ヘッダー
  var headers = ['事務所名', '対象月', '経過日/月日数', '進捗率', '現在累積ダイヤ', '3ヶ月基準（目標）', '月末予測', '予測判定', '基準日'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground(BG_HEADER).setFontColor(FG_WHITE).setFontWeight('bold')
    .setHorizontalAlignment('CENTER');

  // 列幅
  [160, 90, 110, 80, 140, 160, 140, 80, 110].forEach(function(w, i) {
    sh.setColumnWidth(i + 1, w);
  });
  sh.setFrozenRows(1);

  // データ行
  var dataRows = [];
  offices.forEach(function(office) {
    var current = currentByOffice[office] || 0;
    var req3m   = req3mByOffice[office] || 0;
    var latestDate = latestDateByOffice[office] || '（データなし）';

    // 月末予測: 経過日=0の場合は0
    var forecast = elapsedDays > 0 ? Math.round(current / elapsedDays * daysInMonth) : 0;

    // 進捗率: 目標 > 0 の場合のみ
    var progressRate = req3m > 0 ? current / req3m : null;

    // 判定
    var judge = '';
    if (current > 0 && req3m > 0) {
      if (forecast >= req3m) {
        judge = '◎';
      } else if (current < req3m * (elapsedDays / daysInMonth) * 0.8) {
        judge = '✖';
      } else {
        judge = '○';
      }
    }

    dataRows.push([
      office,
      currentMonthStr,
      elapsedDays + ' / ' + daysInMonth,
      progressRate !== null ? progressRate : '',
      current,
      req3m,
      forecast,
      judge,
      latestDate
    ]);
  });

  if (dataRows.length > 0) {
    sh.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);

    // 数値フォーマット
    sh.getRange(2, 4, dataRows.length, 1).setNumberFormat('0.0%');
    sh.getRange(2, 5, dataRows.length, 1).setNumberFormat('#,##0');
    sh.getRange(2, 6, dataRows.length, 1).setNumberFormat('#,##0');
    sh.getRange(2, 7, dataRows.length, 1).setNumberFormat('#,##0');

    // 判定列の色付け
    for (var ri = 0; ri < dataRows.length; ri++) {
      var judge = dataRows[ri][7];
      var rowRange = sh.getRange(ri + 2, 1, 1, headers.length);
      if (judge === '◎') {
        rowRange.setBackground(BG_BEST);
      } else if (judge === '✖') {
        rowRange.setBackground(BG_LOW);
      }
    }

    // 判定列センタリング
    sh.getRange(2, 8, dataRows.length, 1).setHorizontalAlignment('CENTER').setFontWeight('bold');
  }

  // 更新日時
  sh.getRange(dataRows.length + 3, 1)
    .setValue('更新: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm'))
    .setFontColor(FG_GRAY).setFontStyle('italic');

  Logger.log('rebuildProgressDashboard: ' + offices.length + '事務所, 対象月=' + currentMonthStr);
}

// ── RAW_月次から事務所別 3ヶ月基準を算出 ──
// 3ヶ月基準 = MAX(過去3か月合計ダイヤ) - 前月ダイヤ - 前々月ダイヤ
function calcReq3m_(rawSh, currentMonthStr, offices) {
  var result = {};
  if (!rawSh || rawSh.getLastRow() <= 1) {
    offices.forEach(function(o) { result[o] = 0; });
    return result;
  }

  // currentMonth の前月・前々月・前3-8ヶ月を計算
  var p = currentMonthStr.split('-');
  var cy = parseInt(p[0]), cm = parseInt(p[1]);

  function prevMonth(y, m, n) {
    for (var i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } }
    return y + '-' + (m < 10 ? '0' + m : m);
  }

  // 過去12ヶ月のRAWを集計
  var months = [];
  for (var i = 1; i <= 12; i++) months.push(prevMonth(cy, cm, i));

  var rawData = rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 17).getValues();

  // office × month のダイヤ合計
  var diaMap = {}; // key = office + '|' + month
  rawData.forEach(function(r) {
    var mo = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    var office = String(r[1]);
    var dia = parseFloat(r[15]) || 0; // C16 = 応援ダイヤ (0-based index 15)
    var key = office + '|' + mo;
    diaMap[key] = (diaMap[key] || 0) + dia;
  });

  offices.forEach(function(office) {
    var prev1 = diaMap[office + '|' + prevMonth(cy, cm, 1)] || 0;
    var prev2 = diaMap[office + '|' + prevMonth(cy, cm, 2)] || 0;

    // 過去12ヶ月の3か月合計を計算してMAXを求める
    var max3m = 0;
    for (var i = 1; i <= 10; i++) {
      var m1 = diaMap[office + '|' + prevMonth(cy, cm, i)]   || 0;
      var m2 = diaMap[office + '|' + prevMonth(cy, cm, i+1)] || 0;
      var m3 = diaMap[office + '|' + prevMonth(cy, cm, i+2)] || 0;
      var s = m1 + m2 + m3;
      if (s > max3m) max3m = s;
    }

    var req3m = max3m - prev1 - prev2;
    result[office] = req3m > 0 ? Math.round(req3m) : 0;
  });

  return result;
}
