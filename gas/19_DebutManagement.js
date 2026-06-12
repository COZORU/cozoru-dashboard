// 17_DebutManagement.gs
// DB_デビュー管理 — Phase 3
//
//  Section A: レーベル別デビュー数 月次トレンド + 3ヶ月予測
//  Section B: デビュー後コホート分析（+1/+3/+6/+12M 平均ダイヤ、C5達成率）
//  Section C: 直近3ヶ月デビュー組リスト（個人）
//
// RAW_COLUMNS 参照インデックス:
//   [0] 対象月  [1] 事務所名  [2] UserID  [3] アカウント名  [4] レーベル名
//   [15] 応援ダイヤ  [17] ランク  [19] C5報酬  [30] デビュー判定

// ランク順序（クロスファイル依存を避けローカル定義）
var DEBUT_RANK_ORD = {
  'D': 0,
  'C1': 1, 'C2': 2, 'C3': 3, 'C4': 4, 'C5': 5,
  'B1': 6, 'B2': 7, 'B3': 8,
  'A1': 9, 'A2': 10, 'A3': 11,
  'S1': 12, 'S2': 13, 'S3': 14
};

// "yyyy-MM" に n ヶ月加減した文字列を返す
function addM17_(ym, n) {
  var y = parseInt(ym.substring(0, 4), 10);
  var m = parseInt(ym.substring(5, 7), 10) + n;
  while (m > 12) { m -= 12; y++; }
  while (m <  1) { m += 12; y--; }
  return y + '-' + ('0' + m).slice(-2);
}

// calcForecast と同ロジック（デビュー数・ダイヤ両用）
// 直近3ヶ月の1ヶ月あたり変化率 × 経過月数 n、±30%/月クリップ
function forecast17_(history, n) {
  if (!history || history.length === 0) return 0;
  if (history.every(function(v) { return v === 0; })) return 0;
  var recent = history.slice(-3);
  var m0 = recent[recent.length - 1] || 0;
  if (m0 <= 0) return 0;
  var m2 = recent[0] || 0;
  var span = recent.length - 1;
  var rate = (span > 0 && m2 > 0) ? (m0 - m2) / m2 / span : 0;
  rate = Math.max(-0.3, Math.min(0.3, rate));
  return Math.round(m0 * (1 + rate * n));
}

function rebuildDebutManagement() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var sh    = ss.getSheetByName('DB_デビュー管理');
  if (!sh) sh = ss.insertSheet('DB_デビュー管理');

  if (!rawSh) { Logger.log('rebuildDebutManagement: RAWシートなし'); return; }
  var lastRow = rawSh.getLastRow();
  if (lastRow < 2) { Logger.log('rebuildDebutManagement: RAWが空'); return; }

  sh.clearContents();
  sh.clearFormats();

  var rawData = rawSh.getRange(2, 1, lastRow - 1, CONFIG.RAW_COLUMNS.length).getValues();

  // ──────────────────────────────────────────────
  // 1. データ集計
  // ──────────────────────────────────────────────
  var allMonthsSet = {};
  var officeLabels = {};   // office → { label: true }
  // uid → { name, office, label, debutMonth, monthlyData: { month: {dia, rank, c5} } }
  var uidMap = {};

  rawData.forEach(function(r) {
    var rawM = r[0];
    var month = (rawM instanceof Date)
      ? Utilities.formatDate(rawM, 'Asia/Tokyo', 'yyyy-MM')
      : String(rawM || '').trim().substring(0, 7);
    if (!month || month.length < 7) return;

    var uid    = String(r[2]  || '').trim(); if (!uid) return;
    var office = String(r[1]  || '').trim();
    var label  = String(r[4]  || '').trim() || office;
    var name   = String(r[3]  || '').trim();
    var dia    = Number(r[15]) || 0;
    var rank   = String(r[17] || '').trim();
    var ro     = DEBUT_RANK_ORD[rank] !== undefined ? DEBUT_RANK_ORD[rank] : -1;
    var c5     = (Number(r[19]) > 0) || ro >= 5;  // C5報酬獲得 or ランクC5以上
    var isD    = (r[30] == true || String(r[30]).toUpperCase() === 'TRUE');

    allMonthsSet[month] = true;
    if (office) {
      if (!officeLabels[office]) officeLabels[office] = {};
      officeLabels[office][label] = true;
    }
    if (!uidMap[uid]) {
      uidMap[uid] = { name: name, office: office, label: label, debutMonth: null, monthlyData: {} };
    }
    uidMap[uid].monthlyData[month] = { dia: dia, rank: rank, c5: c5 };
    // デビュー月は最初の出現のみ記録
    if (isD && !uidMap[uid].debutMonth) uidMap[uid].debutMonth = month;
  });

  var months      = Object.keys(allMonthsSet).sort();
  var latestMonth = months[months.length - 1] || '';

  // デビュー数集計（月 × グループキー）
  var debutCount = {};  // month → { groupKey → count }
  Object.keys(uidMap).forEach(function(uid) {
    var a = uidMap[uid];
    if (!a.debutMonth) return;
    var m = a.debutMonth;
    if (!debutCount[m]) debutCount[m] = {};
    debutCount[m]['全社']   = (debutCount[m]['全社']   || 0) + 1;
    debutCount[m][a.office] = (debutCount[m][a.office] || 0) + 1;
    debutCount[m][a.label]  = (debutCount[m][a.label]  || 0) + 1;
  });

  // ──────────────────────────────────────────────
  // 2. グループリスト（全社 → 事務所 → レーベル）
  // ──────────────────────────────────────────────
  var groups = [{ key: '全社', label: '全社合計', isTotal: true, isSub: false }];
  Object.keys(officeLabels).sort().forEach(function(office) {
    var labels = Object.keys(officeLabels[office]).sort().filter(function(l) { return l !== office; });
    groups.push({ key: office, label: office, isTotal: false, isSub: false });
    if (labels.length > 1) {
      labels.forEach(function(lbl) {
        groups.push({ key: lbl, label: '┗ ' + lbl, isTotal: false, isSub: true });
      });
    }
  });

  // ──────────────────────────────────────────────
  // 3. 書き出し
  // ──────────────────────────────────────────────
  var rowPtr  = 1;
  var BG_NAVY = '#1a1a2e', BG_BLUE  = '#1565c0', BG_BLUE2 = '#0d47a1';
  var WHITE   = '#ffffff';

  // KPIバー（Row 1）
  var totalDeb  = Object.keys(uidMap).filter(function(uid) { return uidMap[uid].debutMonth; }).length;
  var latestDeb = (debutCount[latestMonth] && debutCount[latestMonth]['全社']) || 0;
  var kpi = [['📊 DB_デビュー管理', '', '累計デビュー数', totalDeb,
              '直近月 (' + latestMonth + ')', latestDeb, '更新日',
              Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd'), '', '']];
  sh.getRange(rowPtr, 1, 1, kpi[0].length).setValues(kpi)
    .setBackground(BG_NAVY).setFontColor(WHITE).setFontWeight('bold').setFontSize(11);
  rowPtr++;

  // ── Section A ──────────────────────────────────
  sh.getRange(rowPtr, 1).setValue(
    '【Section A】 レーベル別デビュー数 月次トレンド（直近3ヶ月から+1/+2/+3M予測）'
  ).setBackground(BG_BLUE).setFontColor(WHITE).setFontWeight('bold');
  rowPtr++;

  var trendCols   = months.concat(['+1M予測', '+2M予測', '+3M予測']);
  var trendHeader = [['レーベル'].concat(trendCols)];
  sh.getRange(rowPtr, 1, 1, trendHeader[0].length).setValues(trendHeader)
    .setBackground(BG_BLUE2).setFontColor(WHITE).setFontWeight('bold').setFontSize(10);
  rowPtr++;

  groups.forEach(function(g) {
    var history = months.map(function(m) { return (debutCount[m] && debutCount[m][g.key]) || 0; });
    var row = [g.label].concat(history, [
      forecast17_(history, 1),
      forecast17_(history, 2),
      forecast17_(history, 3)
    ]);
    var r = sh.getRange(rowPtr, 1, 1, row.length);
    r.setValues([row]);
    r.setBackground(g.isTotal ? '#e3f2fd' : (g.isSub ? '#f5f5f5' : '#e8f5e9'));
    if (!g.isSub) sh.getRange(rowPtr, 1).setFontWeight('bold');
    sh.getRange(rowPtr, months.length + 2, 1, 3).setBackground('#ede7f6'); // 予測列
    rowPtr++;
  });
  rowPtr++;

  // ── Section B ──────────────────────────────────
  sh.getRange(rowPtr, 1).setValue(
    '【Section B】 デビュー後コホート分析 ─ N月後の平均ダイヤ & C5達成率'
  ).setBackground(BG_BLUE).setFontColor(WHITE).setFontWeight('bold');
  rowPtr++;

  var cohHdr = [['デビュー月', 'デビュー人数', '+1M 平均ダイヤ', '+3M 平均ダイヤ',
                 '+6M 平均ダイヤ', '+12M 平均ダイヤ', 'C5達成率（6M以内）', '状態']];
  sh.getRange(rowPtr, 1, 1, cohHdr[0].length).setValues(cohHdr)
    .setBackground(BG_BLUE2).setFontColor(WHITE).setFontWeight('bold').setFontSize(10);
  rowPtr++;

  months.slice().reverse().forEach(function(debutMonth) {
    var cohortUids = Object.keys(uidMap).filter(function(uid) {
      return uidMap[uid].debutMonth === debutMonth;
    });
    if (cohortUids.length === 0) return;

    function avgDia(n) {
      var target = addM17_(debutMonth, n);
      if (target > latestMonth) return '未到達';
      var sum = 0, cnt = 0;
      cohortUids.forEach(function(uid) {
        var md = uidMap[uid].monthlyData[target];
        if (md) { sum += md.dia; cnt++; }
      });
      return cnt > 0 ? Math.round(sum / cnt) : 0;
    }

    var c5Cnt = 0;
    cohortUids.forEach(function(uid) {
      for (var n = 0; n <= 6; n++) {
        var tm = addM17_(debutMonth, n);
        if (tm > latestMonth) break;
        var md = uidMap[uid].monthlyData[tm];
        if (md && md.c5) { c5Cnt++; break; }
      }
    });
    var c5Rate = Math.round(c5Cnt / cohortUids.length * 100) + '%';
    var status = addM17_(debutMonth, 6) > latestMonth ? '追跡中' : '完了';

    var row = [debutMonth, cohortUids.length, avgDia(1), avgDia(3), avgDia(6), avgDia(12), c5Rate, status];
    var r = sh.getRange(rowPtr, 1, 1, row.length);
    r.setValues([row]);
    r.setBackground(debutMonth === latestMonth ? '#e3f2fd' : WHITE);
    sh.getRange(rowPtr, 1).setFontWeight('bold');
    rowPtr++;
  });
  rowPtr++;

  // ── Section C ──────────────────────────────────
  sh.getRange(rowPtr, 1).setValue('【Section C】 デビュー組リスト（直近3ヶ月）')
    .setBackground(BG_BLUE).setFontColor(WHITE).setFontWeight('bold');
  rowPtr++;

  var listHdr = [['アカウント名', '事務所', 'レーベル', 'デビュー月', '活動月数',
                  '今月ダイヤ', 'Tier', 'ランク', '+1M目標ダイヤ', '備考']];
  sh.getRange(rowPtr, 1, 1, listHdr[0].length).setValues(listHdr)
    .setBackground(BG_BLUE2).setFontColor(WHITE).setFontWeight('bold').setFontSize(10);
  rowPtr++;

  var recent3 = months.slice(-3);   // [oldest, ..., newest]
  var debutList = Object.keys(uidMap).filter(function(uid) {
    return uidMap[uid].debutMonth && recent3.indexOf(uidMap[uid].debutMonth) >= 0;
  });
  debutList.sort(function(a, b) {
    // デビュー月の新しい順 → 今月ダイヤの降順
    if (uidMap[a].debutMonth !== uidMap[b].debutMonth)
      return uidMap[a].debutMonth < uidMap[b].debutMonth ? 1 : -1;
    var da = (uidMap[a].monthlyData[latestMonth] || { dia: 0 }).dia;
    var db = (uidMap[b].monthlyData[latestMonth] || { dia: 0 }).dia;
    return db - da;
  });

  debutList.forEach(function(uid) {
    var a      = uidMap[uid];
    var dIdx   = months.indexOf(a.debutMonth);
    var activeM = dIdx >= 0 ? months.length - dIdx : 0;
    var ld     = a.monthlyData[latestMonth] || { dia: 0, rank: '—', c5: false };
    var tier   = ld.dia >= 30000 ? 'T1' : (ld.dia >= 10000 ? 'T2' : 'T3');
    var diaHist = months
      .filter(function(m) { return m >= a.debutMonth; })
      .map(function(m) { return (a.monthlyData[m] || { dia: 0 }).dia; });
    var fc1  = forecast17_(diaHist, 1);
    var note = ld.c5 ? 'C5達成済' : '';

    var row = [a.name, a.office, a.label, a.debutMonth, activeM,
               ld.dia, tier, ld.rank || '—', fc1, note];
    var r   = sh.getRange(rowPtr, 1, 1, row.length);
    r.setValues([row]);
    // 色: 最新月=黄, -1M=緑, -2M=薄紫（recent3[2]が最新）
    var bi = recent3.indexOf(a.debutMonth);
    r.setBackground(bi === 2 ? '#fff9c4' : (bi === 1 ? '#e8f5e9' : '#f3e5f5'));
    rowPtr++;
  });

  // 列幅調整
  sh.setColumnWidth(1, 160);
  for (var c = 2; c <= months.length + 4; c++) sh.setColumnWidth(c, 85);

  Logger.log('rebuildDebutManagement 完了: ' + debutList.length + '名(直近3M) / '
    + 'コホート' + months.length + 'ヶ月 / 累計' + totalDeb + '名');
}
