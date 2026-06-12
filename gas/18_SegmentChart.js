// 18_SegmentChart.gs
// DB_セグメント: 配信時間 vs 応援ダイヤ の4象限分析
//
// パラメータ:
//   B1: 対象月 (yyyy-MM, 手入力)
//   D1: 事務所 (ドロップダウン: 全体 or 事務所名)
//   ※ B1/D1変更後は「⑤ セグメント分析を更新」を再実行
//
// 象限（閾値 = 当月平均）:
//   ◎ 配信時間多い × 応援ダイヤ多い
//   ○ 配信時間多い × 応援ダイヤ少ない
//   △ 配信時間少ない × 応援ダイヤ多い
//   ✗ 配信時間少ない × 応援ダイヤ少ない

function rebuildSegmentChart() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_DB_SEGMENT);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_DB_SEGMENT);

  // 既存のB1/D1を保存（ユーザーの設定を引き継ぐ）
  var prevMonthVal  = sh.getRange('B1').getValue();
  var prevOfficeVal = sh.getRange('D1').getValue();

  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getCharts().forEach(function(c) { sh.removeChart(c); });

  // 事務所リスト
  var officeSh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  var offices = ['全体'];
  if (officeSh && officeSh.getLastRow() > 1) {
    officeSh.getRange(2, 1, officeSh.getLastRow() - 1, 3).getValues().forEach(function(r) {
      if (r[0] && (r[2] === true || r[2] === 'TRUE')) offices.push(String(r[0]));
    });
  }

  var today = new Date();
  var currentMonth = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2);

  // 表示月・事務所の決定（前回設定があれば引き継ぐ）
  var displayMonth;
  if (prevMonthVal instanceof Date) {
    displayMonth = Utilities.formatDate(prevMonthVal, 'Asia/Tokyo', 'yyyy-MM');
  } else if (prevMonthVal && String(prevMonthVal).trim().length >= 7) {
    displayMonth = String(prevMonthVal).trim().substring(0, 7);
  } else {
    displayMonth = currentMonth;
  }
  var displayOffice = prevOfficeVal ? String(prevOfficeVal).trim() : '全体';

  var NAVY = '#1C4E80', FG_W = '#FFFFFF', BG_P = '#EBF5FB', FG_GY = '#888888';
  var C1 = '#1A7343', C2 = '#2980B9', C3 = '#E67E22', C4 = '#C0392B';

  var SEGS = [
    { sym: '◎', label: '◎ 配信時間多い × 応援ダイヤ多い',   color: C1 },
    { sym: '○', label: '○ 配信時間多い × 応援ダイヤ少ない',  color: C2 },
    { sym: '△', label: '△ 配信時間少ない × 応援ダイヤ多い',  color: C3 },
    { sym: '✗', label: '✗ 配信時間少ない × 応援ダイヤ少ない', color: C4 }
  ];

  // セグメント順序マップ（ソート用）
  var segOrder = {};
  SEGS.forEach(function(s, i) { segOrder[s.label] = i; });

  // ── パラメータ行 (row 1) ──
  sh.getRange(1, 1, 1, 5).setBackground(BG_P);
  sh.getRange('A1').setValue('対象月').setFontWeight('bold');
  sh.getRange('B1').setNumberFormat('@').setValue(displayMonth).setFontWeight('bold').setFontSize(12);
  sh.getRange('C1').setValue('事務所').setFontWeight('bold');
  sh.getRange('D1').setNumberFormat('@').setValue(displayOffice).setFontWeight('bold').setFontSize(12);
  sh.getRange('D1').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(offices, true).build()
  );
  sh.getRange('E1').setValue('← 変更後は⑤を再実行').setFontColor(FG_GY).setFontStyle('italic');

  // ── 集計 (row 3) ──
  sh.getRange('A3').setValue('平均配信時間(h)').setFontWeight('bold');
  sh.getRange('B3').setFormula('=IFERROR(AVERAGEIF(A7:A2000,"<>",C7:C2000),"")').setNumberFormat('0.0');
  sh.getRange('C3').setValue('平均応援ダイヤ').setFontWeight('bold');
  sh.getRange('D3').setFormula('=IFERROR(AVERAGEIF(A7:A2000,"<>",D7:D2000),"")').setNumberFormat('#,##0');

  // セグメント人数 (F,H,J,L 列)
  SEGS.forEach(function(seg, i) {
    var c = 6 + i * 2;
    sh.getRange(2, c).setValue(seg.label).setFontColor(seg.color).setFontWeight('bold');
    sh.getRange(3, c).setFormula('=COUNTIF(E7:E2000,"' + seg.sym + '*")&"人"')
      .setFontColor(seg.color).setFontWeight('bold').setFontSize(12);
  });

  // ── データテーブルヘッダー (row 5) ──
  sh.getRange(5, 1, 1, 5).setValues([['アカウント名', '事務所', '配信時間(h)', '応援ダイヤ', 'セグメント']])
    .setBackground(NAVY).setFontColor(FG_W).setFontWeight('bold');

  // ── RAWデータをGASで直接フィルタして値書き込み ──
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var dataRows = [];
  if (rawSh && rawSh.getLastRow() > 1) {
    var rawData = rawSh.getRange(2, 1, rawSh.getLastRow() - 1, CONFIG.RAW_COLUMNS.length).getValues();
    for (var ri = 0; ri < rawData.length; ri++) {
      var row = rawData[ri];
      var rowMonthRaw = row[0];
      var rowOffice   = String(row[1] || '').trim();

      var rowMonth;
      if (rowMonthRaw instanceof Date) {
        rowMonth = Utilities.formatDate(rowMonthRaw, 'Asia/Tokyo', 'yyyy-MM');
      } else {
        rowMonth = String(rowMonthRaw).trim().substring(0, 7);
      }

      if (rowMonth !== displayMonth) continue;
      if (!rowOffice) continue;
      if (displayOffice !== '全体' && rowOffice !== displayOffice) continue;

      dataRows.push([
        String(row[3]  || ''),   // アカウント名 (index 3 = 列D)
        rowOffice,               // 事務所名
        Number(row[11]) || 0,    // 総配信時間 (index 11 = 列L)
        Number(row[15]) || 0     // 応援ダイヤ  (index 15 = 列P)
      ]);
    }
  }

  // セグメント付与・ソート・書き込み
  var rows5 = [];
  if (dataRows.length > 0) {
    var sumT = 0, sumD = 0;
    dataRows.forEach(function(r) { sumT += r[2]; sumD += r[3]; });
    var avgT = sumT / dataRows.length;
    var avgD = sumD / dataRows.length;

    rows5 = dataRows.map(function(r) {
      var seg;
      if      (r[2] >= avgT && r[3] >= avgD) seg = SEGS[0].label;
      else if (r[2] >= avgT && r[3] <  avgD) seg = SEGS[1].label;
      else if (r[2] <  avgT && r[3] >= avgD) seg = SEGS[2].label;
      else                                   seg = SEGS[3].label;
      return [r[0], r[1], r[2], r[3], seg];
    });

    rows5.sort(function(a, b) {
      var diff = segOrder[a[4]] - segOrder[b[4]];
      return diff !== 0 ? diff : b[3] - a[3];
    });

    sh.getRange(7, 1, rows5.length, 5).setValues(rows5);
  } else {
    sh.getRange('A7').setValue('データなし');
  }

  // ── チャート用データ (G5:K) - wide format ──
  // 列構成: 配信時間(X) | ◎応援ダイヤ | ○応援ダイヤ | △応援ダイヤ | ✗応援ダイヤ
  // 各行は1系列の列のみ値あり、他は空（Sheetsが"no data"として扱う）
  var chartHdr = [['配信時間(h)', SEGS[0].label, SEGS[1].label, SEGS[2].label, SEGS[3].label]];
  var chartDataRows = rows5.map(function(r) {
    var row = [r[2], '', '', '', ''];
    var si = segOrder[r[4]];
    if (si !== undefined && r[3] > 0) row[si + 1] = r[3];
    return row;
  });
  var allChartData = chartHdr.concat(chartDataRows.length > 0 ? chartDataRows : [['', '', '', '', '']]);
  sh.getRange(5, 7, allChartData.length, 5).setValues(allChartData);

  // ── 散布図チャート ──
  var chartRange = sh.getRange(5, 7, allChartData.length, 5);
  var chartBuilder = sh.newChart()
    .setChartType(Charts.ChartType.SCATTER)
    .addRange(chartRange)
    .setNumHeaders(1)
    .setPosition(1, 13, 0, 0)
    .setOption('title', '配信時間 vs 応援ダイヤ  4象限セグメント')
    .setOption('hAxis', { title: '配信時間(h)', minValue: 0 })
    .setOption('vAxis', { title: '応援ダイヤ', scaleType: 'log', format: 'short' })
    .setOption('width', 720)
    .setOption('height', 520)
    .setOption('colors', [C1, C2, C3, C4])
    .setOption('pointSize', 8)
    .setOption('legend', { position: 'right' })
    .build();
  sh.insertChart(chartBuilder);

  // ── 書式 ──
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 140);
  sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 110);
  sh.setColumnWidth(5, 220);
  sh.getRange(7, 3, 2000, 1).setNumberFormat('0.0');
  sh.getRange(7, 4, 2000, 1).setNumberFormat('#,##0');
  sh.setFrozenRows(5);
  sh.setFrozenColumns(2);

  // E列の条件付き書式
  var eRange = sh.getRange('E7:E2006');
  sh.setConditionalFormatRules(SEGS.map(function(seg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith(seg.sym)
      .setFontColor(seg.color)
      .setRanges([eRange])
      .build();
  }));

  Logger.log('rebuildSegmentChart: ' + rows5.length + '件, ' + displayMonth + ', ' + displayOffice);
}
