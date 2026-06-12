// 16_LiverMonthly.gs
// DB_ライバー月次: KPIバー × 支援優先度リスト × Tier移動 × Tier収益 × ROI試算 × セグメント分析
// ※ DB_セグメントタブの機能を統合済み（散布図チャートも本シートに含む）
//
// ─────────────────────────────────────────────────────────────────
//  行1    : 月選択パラメータ行（B1でドロップダウン選択 → ⑥再実行）
//  行2    : KPIサマリーバー（全幅）
//  行3    : ヘッダー行
//  行4+   : 個人リスト（A〜Q列 = 17列, 支援優先度順）
//  右側(S〜W = cols 19〜23):
//    Section 1: Tier移動マトリクス（行3〜8）
//    Section 2: Tier別収益サマリー（行9〜17）
//    Section 2b: Tier内ランク構成比（行18〜22）
//    Section 3: 施策別ROI試算（行23〜27）
//    Section 4: 投資対象ピックアップ（行29〜36）
//    Section 6: 3ヶ月予測サマリー（行37〜）
// ─────────────────────────────────────────────────────────────────

// ランク順序（数値が大きいほど上位）
var RANK_ORDER = {
  'D': 0,
  'C1': 1, 'C2': 2, 'C3': 3, 'C4': 4, 'C5': 5,
  'B1': 6, 'B2': 7, 'B3': 8,
  'A1': 9, 'A2': 10, 'A3': 11,
  'S1': 12, 'S2': 13, 'S3': 14
};

// ランク → Tier マッピング（二段階管理用）
function rankToTierLabel(rank) {
  var o = RANK_ORDER[rank];
  if (o === undefined) return '不明';
  if (o >= 12) return 'T1(S)';
  if (o >= 9)  return 'T1(A)';
  if (o >= 6)  return 'T2(B)';
  if (o >= 1)  return 'T3(C)';
  return 'T3(D)';
}

// 予測ダイヤからTier文字列を返す
function diaToTier(dia) {
  if (dia >= 30000) return 'T1';
  if (dia >= 10000) return 'T2';
  return 'T3';
}

// 予測ダイヤ算出（直近3ヶ月の1ヶ月あたり変化率 × 経過月数）
// monthlyRate = (今月 - 3ヶ月前) / 3ヶ月前 / 3、±30%/月でクリップ
// forecast(n) = 今月 × (1 + monthlyRate × n)
function calcForecast(diaHistory, n) {
  if (!diaHistory || diaHistory.length === 0) return 0;
  if (diaHistory.every(function(v) { return v === 0; })) return 0;
  var recent = diaHistory.slice(-3);
  var m0 = recent[recent.length - 1] || 0;
  if (m0 <= 0) return 0;
  var m2 = recent[0] || 0;
  var span = recent.length - 1;
  var monthlyRate = (span > 0 && m2 > 0) ? (m0 - m2) / m2 / span : 0;
  monthlyRate = Math.max(-0.3, Math.min(0.3, monthlyRate));
  return Math.round(m0 * (1 + monthlyRate * n));
}

function rebuildLiverMonthly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var sh = ss.getSheetByName(CONFIG.SHEET_DB_LIVER_MONTHLY);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_DB_LIVER_MONTHLY);

  // 右側サマリーの開始列（個人リスト21列 + spacer2 = col24）
  var RC = 24;

  // 入力値を保存（clearより前に読む）
  var savedMonthRaw = sh.getRange('B1').getValue();
  var savedMonth    = (savedMonthRaw instanceof Date)
    ? Utilities.formatDate(savedMonthRaw, 'Asia/Tokyo', 'yyyy-MM')
    : String(savedMonthRaw || '').trim().substring(0, 7);
  // 施策別ROI入力値を保存（clearより前に読む）
  // T列(col20)=人件費, U列(col21)=変化数（ダイヤ）; row25=①T1, row26=②T2, row27=③T3
  var savedT1Cost  = Number(sh.getRange(25, RC + 1).getValue()) || 0;
  var savedT1Delta = Number(sh.getRange(25, RC + 2).getValue()) || 0;
  var savedT2Cost  = Number(sh.getRange(26, RC + 1).getValue()) || 0;
  var savedT2Delta = Number(sh.getRange(26, RC + 2).getValue()) || 0;
  var savedT3Cost  = Number(sh.getRange(27, RC + 1).getValue()) || 0;
  var savedT3Delta = Number(sh.getRange(27, RC + 2).getValue()) || 0;

  // RAWチェック（clearより前に実施 → エラー時に空白化しない）
  if (!rawSh) { Logger.log('rebuildLiverMonthly: RAWシートなし'); return; }
  var lastRow = rawSh.getLastRow();
  if (lastRow < 2) { Logger.log('rebuildLiverMonthly: RAWが空'); return; }

  var rawData = rawSh.getRange(2, 1, lastRow - 1, CONFIG.RAW_COLUMNS.length).getValues();

  // ── 1. アカウント別 × 月別 集計 ──
  var accountMap = {};
  var allMonthsSet = {};

  rawData.forEach(function(row) {
    var rawM  = row[0];
    var month = (rawM instanceof Date)
      ? Utilities.formatDate(rawM, 'Asia/Tokyo', 'yyyy-MM')
      : String(rawM || '').trim().substring(0, 7);
    if (!month || month.length < 7) return;

    var office  = String(row[1]  || '').trim();
    var userId  = String(row[2]  || '').trim();
    var name    = String(row[3]  || '').trim();
    var tierRaw = String(row[28] || '').trim();
    var oenDia  = Number(row[15]) || 0;
    var stTime  = Number(row[11]) || 0;
    var mf      = Number(row[33]) || 0;

    if (!userId) return;
    allMonthsSet[month] = true;

    var tg = tierRaw.indexOf('1') >= 0 ? 'T1' : (tierRaw.indexOf('2') >= 0 ? 'T2' : 'T3');

    if (!accountMap[userId]) {
      accountMap[userId] = { office: office, name: name, userId: userId, months: {} };
    }
    var rankVal = String(row[17] || '').trim(); // RAW_COLUMNS[17] = 'ランク'
    accountMap[userId].months[month] = { dia: oenDia, stTime: stTime, mf: mf, tier: tg, rank: rankVal };
  });

  var months      = Object.keys(allMonthsSet).sort();
  var latestMonth = months[months.length - 1] || '';

  // 表示月の決定（B1の選択 or 最新月）
  var displayMonth      = (savedMonth && months.indexOf(savedMonth) >= 0) ? savedMonth : latestMonth;
  var dIdx              = months.indexOf(displayMonth);
  var prevMonth         = dIdx >= 1 ? months[dIdx - 1] : null;
  var prevPrevMonth     = dIdx >= 2 ? months[dIdx - 2] : null;
  var prevPrevPrevMonth = dIdx >= 3 ? months[dIdx - 3] : null;

  // 各ライバーの時系列応援ダイヤを構築（予測計算用）
  Object.keys(accountMap).forEach(function(uid) {
    var a = accountMap[uid];
    var sortedMonths = Object.keys(a.months).sort().filter(function(m) { return m <= displayMonth; });
    a.diaHistory = sortedMonths.map(function(m) { return a.months[m].dia || 0; });
  });

  // バナイベ期待ダイヤ算出（全月で「前月デビュー組の当月ダイヤ平均」を集計）
  var banaibeExpectedDia = 0;
  var banaibeSamples = [];
  months.forEach(function(month, mi) {
    if (mi === 0) return; // 最初の月は前月がないためスキップ
    var prevM = months[mi - 1];

    // 前月にデビューしたUID一覧を取得
    var prevDebutUids = {};
    rawData.forEach(function(r) {
      var rowMonth = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy-MM')
        : String(r[0] || '').substring(0, 7);
      if (rowMonth !== prevM) return;
      if (r[30] == true || String(r[30]).toUpperCase() === 'TRUE') prevDebutUids[String(r[2])] = true;
    });
    if (Object.keys(prevDebutUids).length === 0) return;

    // 当月における前月デビュー組の応援ダイヤを集計
    var total = 0, count = 0;
    rawData.forEach(function(r) {
      var rowMonth = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy-MM')
        : String(r[0] || '').substring(0, 7);
      if (rowMonth !== month) return;
      if (prevDebutUids[String(r[2])]) { total += Number(r[15]) || 0; count++; }
    });
    if (count > 0) banaibeSamples.push(total / count);
  });
  if (banaibeSamples.length > 0) {
    banaibeExpectedDia = Math.round(
      banaibeSamples.reduce(function(s, v) { return s + v; }, 0) / banaibeSamples.length
    );
  }
  Logger.log('バナイベ期待ダイヤ: ¥' + banaibeExpectedDia + ' (サンプル' + banaibeSamples.length + 'ヶ月)');

  // ── 2. 個人メトリクス計算（displayMonth基準）──
  var tierGroups = {
    T1: { count: 0, totalDia: 0, totalMF: 0 },
    T2: { count: 0, totalDia: 0, totalMF: 0 },
    T3: { count: 0, totalDia: 0, totalMF: 0 }
  };
  var paretoArr    = [];
  var liverMetrics = [];

  function arwChr(from, to) {
    if (from <= 0) return '-';
    return to > from ? '↑' : (to < from ? '↓' : '→');
  }
  function monthLabel(m) { return m ? (parseInt(m.slice(5, 7)) + '月') : '-'; }

  Object.keys(accountMap).forEach(function(uid) {
    var a = accountMap[uid];
    var myMonths = Object.keys(a.months).sort().filter(function(m) { return m <= displayMonth; });
    if (myMonths.length === 0) return;

    var d0  = a.months[displayMonth]        ? (a.months[displayMonth].dia        || 0) : 0;
    var d1  = prevMonth         && a.months[prevMonth]         ? (a.months[prevMonth].dia         || 0) : 0;
    var d2  = prevPrevMonth     && a.months[prevPrevMonth]     ? (a.months[prevPrevMonth].dia     || 0) : 0;
    var d3  = prevPrevPrevMonth && a.months[prevPrevPrevMonth] ? (a.months[prevPrevPrevMonth].dia || 0) : 0;
    var mf0 = a.months[displayMonth] ? (a.months[displayMonth].mf     || 0) : 0;
    var st0 = a.months[displayMonth] ? (a.months[displayMonth].stTime || 0) : 0;
    var tg  = a.months[displayMonth] ? a.months[displayMonth].tier
              : a.months[myMonths[myMonths.length - 1]].tier;

    var totalDia = 0, totalMF = 0;
    myMonths.forEach(function(m) { totalDia += a.months[m].dia || 0; totalMF += a.months[m].mf || 0; });

    var mom     = d1 > 0 ? Math.round((d0 - d1) / d1 * 100) : null;
    var mom2    = d2 > 0 ? Math.round((d1 - d2) / d2 * 100) : null;
    var arrows3 = arwChr(d3, d2) + arwChr(d2, d1) + arwChr(d1, d0);
    var activeMonths = myMonths.filter(function(m) { return a.months[m].dia > 0; }).length;
    var diaPerH = st0 > 0 ? Math.round(d0 / st0) : 0;

    var priority;
    if (!d0)                                           priority = '⚫ 休眠';
    else if (activeMonths <= 3)                        priority = '🌱 新人育成';
    else if (d2 > 0 && d1 > 0 && d2 > d1 && d1 > d0) priority = '🔴 緊急支援';
    else if (mom !== null && mom <= -20)               priority = '🟡 要観察';
    else if (mom !== null && mom >= 50)                priority = '⭐ 急成長';
    else                                               priority = '🟢 順調';

    tierGroups[tg].count++;
    tierGroups[tg].totalDia += d0;
    tierGroups[tg].totalMF  += mf0;
    paretoArr.push({ uid: uid, totalDia: totalDia });

    var rankVal = '';
    if (a.months[displayMonth]) {
      rankVal = a.months[displayMonth].rank || '';
    } else if (myMonths.length > 0) {
      rankVal = a.months[myMonths[myMonths.length - 1]].rank || '';
    }

    // 予測計算（2要因モデル: トレンド付き自動算出）
    var forecast1 = calcForecast(a.diaHistory, 1);
    var forecast2 = calcForecast(a.diaHistory, 2);
    var forecast3 = calcForecast(a.diaHistory, 3);
    var forecastTier = diaToTier(forecast3);

    liverMetrics.push({
      uid: uid, office: a.office, name: a.name, tier: tg, rank: rankVal, priority: priority,
      latestMonth: displayMonth, latestDia: d0, dia1: d1, dia2: d2,
      mom: mom, mom2: mom2, arrows3: arrows3,
      stTime: st0, diaPerH: diaPerH, latestMF: mf0,
      totalDia: totalDia, activeMonths: activeMonths,
      forecast1: forecast1, forecast2: forecast2, forecast3: forecast3,
      forecastTier: forecastTier
    });
  });

  // ── 3. パレートランク ──
  paretoArr.sort(function(a, b) { return b.totalDia - a.totalDia; });
  var paretoRankMap = {};
  paretoArr.forEach(function(x, i) { paretoRankMap[x.uid] = i + 1; });
  var grandTotal = paretoArr.reduce(function(s, x) { return s + x.totalDia; }, 0);

  var pareto80count = 0, cumDia = 0;
  for (var pi = 0; pi < paretoArr.length; pi++) {
    cumDia += paretoArr[pi].totalDia;
    pareto80count++;
    if (cumDia >= grandTotal * 0.8) break;
  }
  var pareto80pct    = paretoArr.length > 0 ? Math.round(pareto80count / paretoArr.length * 100) : 0;
  var totalDiaLatest = tierGroups.T1.totalDia + tierGroups.T2.totalDia + tierGroups.T3.totalDia;
  var activeCount    = liverMetrics.filter(function(r) { return r.latestDia > 0; }).length;

  // ── 4. Tier移動マトリクス（prevMonth → displayMonth）──
  var matrix = {};
  ['T1','T2','T3','新規'].forEach(function(f) { matrix[f] = { T1:0, T2:0, T3:0, '離脱':0 }; });
  var tierUpCount = 0;
  var tierOrder   = { T1:1, T2:2, T3:3 };

  if (prevMonth) {
    Object.keys(accountMap).forEach(function(uid) {
      var a       = accountMap[uid];
      var hasCur  = !!a.months[displayMonth];
      var hasPrev = !!a.months[prevMonth];
      var fromKey, toKey;
      if (hasPrev && hasCur) {
        fromKey = a.months[prevMonth].tier;
        toKey   = a.months[displayMonth].tier;
        if (tierOrder[fromKey] > tierOrder[toKey]) tierUpCount++;
      } else if (!hasPrev && hasCur) {
        fromKey = '新規'; toKey = a.months[displayMonth].tier;
      } else if (hasPrev && !hasCur) {
        fromKey = a.months[prevMonth].tier; toKey = '離脱';
      } else { return; }
      if (matrix[fromKey] && matrix[fromKey][toKey] !== undefined) matrix[fromKey][toKey]++;
      else if (matrix[fromKey] && toKey === '離脱') matrix[fromKey]['離脱']++;
    });
  }

  function tierRowTotal(row) { return row.T1 + row.T2 + row.T3 + row['離脱']; }
  function mvRate(num, denom) { return denom > 0 ? Math.round(num / denom * 100) : null; }

  var t1Total    = tierRowTotal(matrix.T1);
  var t2Total    = tierRowTotal(matrix.T2);
  var t3Total    = tierRowTotal(matrix.T3);
  var t3UpRate   = mvRate(matrix.T3.T2 + matrix.T3.T1, t3Total);
  var totalExitN = matrix.T1['離脱'] + matrix.T2['離脱'] + matrix.T3['離脱'];

  // ── 5. セグメント計算（4象限: 配信時間 × 応援ダイヤ, 閾値=全体平均）──
  var segActive = liverMetrics.filter(function(r) { return r.latestDia > 0 || r.stTime > 0; });
  var avgSegT = 0, avgSegD = 0;
  if (segActive.length > 0) {
    var sumSegT = 0, sumSegD = 0;
    segActive.forEach(function(r) { sumSegT += r.stTime; sumSegD += r.latestDia; });
    avgSegT = sumSegT / segActive.length;
    avgSegD = sumSegD / segActive.length;
  }
  liverMetrics.forEach(function(r) {
    var t = r.stTime, d = r.latestDia;
    if (avgSegT > 0 || avgSegD > 0) {
      if      (t >= avgSegT && d >= avgSegD) r.segment = '◎';
      else if (t >= avgSegT && d <  avgSegD) r.segment = '○';
      else if (t <  avgSegT && d >= avgSegD) r.segment = '△';
      else                                   r.segment = '✗';
    } else {
      r.segment = '-';
    }
  });

  // ── 6. 支援優先度でソート ──
  var P_ORD = { '🔴 緊急支援':1, '🟡 要観察':2, '⭐ 急成長':3, '🟢 順調':4, '🌱 新人育成':5, '⚫ 休眠':6 };
  liverMetrics.sort(function(a, b) {
    var diff = (P_ORD[a.priority]||9) - (P_ORD[b.priority]||9);
    if (diff !== 0) return diff;
    if (a.tier !== b.tier) return a.tier < b.tier ? -1 : 1;
    return b.latestDia - a.latestDia;
  });

  // 予測Tier別集計（sort後に実行）
  var fcstGroups = {
    T1: { count1: 0, dia1: 0, count2: 0, dia2: 0, count3: 0, dia3: 0 },
    T2: { count1: 0, dia1: 0, count2: 0, dia2: 0, count3: 0, dia3: 0 },
    T3: { count1: 0, dia1: 0, count2: 0, dia2: 0, count3: 0, dia3: 0 }
  };
  liverMetrics.forEach(function(r) {
    var t3 = diaToTier(r.forecast3);
    var tBase = t3; // +3ヶ月時点のTier予測をメイン集計に使用
    if (fcstGroups[tBase]) {
      fcstGroups[tBase].count3++;
      fcstGroups[tBase].dia3 += r.forecast3 || 0;
    }
    // +1ヶ月（現Tier基準）
    var t = r.tier;
    if (fcstGroups[t]) {
      fcstGroups[t].count1++;  fcstGroups[t].dia1 += r.forecast1 || 0;
      fcstGroups[t].count2++;  fcstGroups[t].dia2 += r.forecast2 || 0;
    }
  });

  // 直近実績MF利率（予測売上算出用）
  var totalMfActual  = tierGroups.T1.totalMF + tierGroups.T2.totalMF + tierGroups.T3.totalMF;
  var totalDiaActual = tierGroups.T1.totalDia + tierGroups.T2.totalDia + tierGroups.T3.totalDia;
  var mfRate = totalDiaActual > 0 ? totalMfActual / totalDiaActual : 0;

  // ③ バナイベ貢献（今月デビュー数 × バナイベ期待ダイヤ）
  var debutCountThisMonth = liverMetrics.filter(function(r) {
    return r.activeMonths === 1 && r.latestDia > 0;
  }).length;
  var banaibeForecastDia = Math.round(debutCountThisMonth * banaibeExpectedDia);

  // バナイベ貢献は+1/+2/+3すべてに加算（+2/+3は新規デビューが毎月同数続く前提、設計上の簡素化）
  var fcstDia1 = fcstGroups.T1.dia1 + fcstGroups.T2.dia1 + fcstGroups.T3.dia1 + banaibeForecastDia;
  var fcstDia2 = fcstGroups.T1.dia2 + fcstGroups.T2.dia2 + fcstGroups.T3.dia2 + banaibeForecastDia;
  var fcstDia3 = fcstGroups.T1.dia3 + fcstGroups.T2.dia3 + fcstGroups.T3.dia3 + banaibeForecastDia;

  var fcstSales1 = Math.round(fcstDia1 * mfRate * 1.1); // 税込概算
  var fcstSales2 = Math.round(fcstDia2 * mfRate * 1.1);
  var fcstSales3 = Math.round(fcstDia3 * mfRate * 1.1);

  // Tier内ランク構成比（表示月の実績）
  var rankComp = {
    T1: { S: 0, A: 0, B: 0, C: 0 },
    T2: { S: 0, A: 0, B: 0, C: 0 },
    T3: { S: 0, A: 0, B: 0, C: 0 }
  };
  liverMetrics.forEach(function(r) {
    if (!r.latestDia || r.latestDia <= 0) return; // 休眠除外
    var t = r.tier;
    if (!rankComp[t]) return;
    var o = RANK_ORDER[r.rank];
    if (o === undefined) return;
    if (o >= 12)      rankComp[t].S++;
    else if (o >= 9)  rankComp[t].A++;
    else if (o >= 6)  rankComp[t].B++;
    else              rankComp[t].C++;
  });

  var dataRows = liverMetrics.map(function(r) {
    return [
      paretoRankMap[r.uid], r.office, r.name, r.tier, r.rank, r.latestMonth,
      r.dia2 > 0 ? r.dia2 : '', r.dia1 > 0 ? r.dia1 : '', r.latestDia > 0 ? r.latestDia : '',
      r.mom2 !== null ? r.mom2 : '', r.mom !== null ? r.mom : '', r.arrows3,
      r.stTime > 0 ? r.stTime : '',
      r.diaPerH, r.latestMF, r.totalDia, r.activeMonths,
      r.forecast1 > 0 ? r.forecast1 : '', r.forecast2 > 0 ? r.forecast2 : '',
      r.forecast3 > 0 ? r.forecast3 : '', r.forecast3 > 0 ? r.forecastTier : ''
    ];
  });

  // ================================================================
  // 書き込み（データ確認後にclear → エラーで空白化しない）
  // ================================================================
  var existingFilter = sh.getFilter();
  if (existingFilter) existingFilter.remove();
  sh.getCharts().forEach(function(c) { sh.removeChart(c); });
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  sh.getRange(1, 1, 2, 30).breakApart();

  var NAVY   = '#1C4E80';
  var DARK   = '#34495E';
  var FG_W   = '#FFFFFF';
  var FG_GY  = '#888888';
  var BG_P   = '#EBF5FB';
  var ORANGE = '#E67E22';
  var BG_Y   = '#FFF9C4';
  var BG_GY  = '#F2F2F2';
  var BG_GN  = '#D5F5E3';
  var BG_RD  = '#FADBD8';
  var BG_YL2 = '#FFF9C4';
  var T1_C   = '#1A7343';
  var T2_C   = '#2980B9';
  var T3_C   = '#C0392B';
  var nAcct  = dataRows.length;

  function avg(total, count) { return count > 0 ? Math.round(total / count) : 0; }
  function pct(part, whole)  { return whole > 0 ? Math.round(part / whole * 100) + '%' : '-'; }
  function fmtRate(r) { return r !== null ? r + '%' : '-'; }

  // ── ROW 1: 月選択パラメータ行 ──
  sh.setRowHeight(1, 32);
  sh.getRange(1, 1, 1, 23).setBackground(BG_P);
  sh.getRange('A1').setValue('対象月').setFontWeight('bold');
  sh.getRange('B1').setNumberFormat('@').setValue(displayMonth).setFontWeight('bold').setFontSize(12);
  sh.getRange('B1').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(months, true).build()
  );
  sh.getRange('C1').setValue('← 変更後は⑥を再実行').setFontColor(FG_GY).setFontStyle('italic');

  // ── ROW 2: KPIサマリーバー ──
  sh.setRowHeight(2, 52);
  // col1-5   : 識別情報（#/事務所名/アカウント名/Tier/ランク）← 列固定ゾーン
  // col5-8   : 最新月＋ダイヤ推移（最新月/2か月前/先月/当月ダイヤ）
  // col9-11  : 変化率/推移（前々月比/先月比/3ヶ月推移）
  // col12-16 : パフォーマンス（配信時間/ダイヤ/h/MF/累計/活動月数）
  // ※ KPIブロックの結合セルが setFrozenColumns(5) の境界をまたぐとエラーになるため
  //   アクティブを col1-5 に収め（ランク列を含む固定ゾーン全体）、今月ダイヤ合計を col6-8 に配置
  var kpiBlocks = [
    { col:1,  span:5,  label:'アクティブ',              val: activeCount + '人',                                bg: T2_C      },
    { col:6,  span:3,  label:'今月ダイヤ合計',           val: totalDiaLatest.toLocaleString(),                   bg: T1_C      },
    { col:9,  span:3,  label:'超重要顧客（80%ライン）',  val: pareto80count + '人 / 全体' + pareto80pct + '%',   bg: '#8E44AD' },
    { col:12, span:5,  label:'Tier上昇（今月）',         val: tierUpCount + '人',                                bg: ORANGE    }
  ];
  kpiBlocks.forEach(function(b) {
    sh.getRange(2, b.col, 1, b.span).merge()
      .setValue(b.label + '\n' + b.val)
      .setBackground(b.bg).setFontColor(FG_W).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setWrap(true).setFontSize(11);
  });

  // ── ROW 3: 個人リストヘッダー ──
  var d2HeaderLabel = prevPrevMonth ? monthLabel(prevPrevMonth) + 'ダイヤ' : '2か月前ダイヤ';
  var d1HeaderLabel = prevMonth     ? monthLabel(prevMonth)     + 'ダイヤ' : '先月ダイヤ';
  var d0HeaderLabel = monthLabel(displayMonth) + 'ダイヤ';
  var listHeaders = [
    '#', '事務所名', 'アカウント名', 'Tier', 'ランク', '最新月',
    d2HeaderLabel, d1HeaderLabel, d0HeaderLabel,
    '前々月比(%)', '先月比(%)', '3ヶ月推移',
    '配信時間(h)',
    '当月ダイヤ/h', '当月MF理論値', '累計ダイヤ(デビュー来)', '活動月数',
    '+1ヶ月予測ダイヤ', '+2ヶ月予測ダイヤ', '+3ヶ月予測ダイヤ', '予測Tier'
  ];
  sh.getRange(3, 1, 1, 21)
    .setValues([listHeaders])
    .setBackground(NAVY).setFontColor(FG_W).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(3, 18, 1, 4)
    .setBackground('#CE93D8').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');

  sh.getRange(3, 9).setNote(
    '前々月比: 2か月前→先月の変化率\n例: +12 → 先月は前々月比+12%\n（空欄はデータ不足）'
  );
  sh.getRange(3, 10).setNote(
    '先月比: 先月→当月の変化率\n例: -5 → 今月は先月比-5%\n（空欄はデータ不足）'
  );
  sh.getRange(3, 11).setNote(
    '直近3か月の推移矢印\n左: 3か月前→2か月前\n中: 2か月前→先月\n右: 先月→当月\n↑増加 / ↓減少 / →横ばい / -データなし\n緑=「↑↑」含む / 赤=「↓↓」含む'
  );
  sh.getRange(3, 12).setNote('当月の総配信時間（時間）');

  // ── ROW 4+: 個人リストデータ ──
  if (nAcct > 0) {
    sh.getRange(4, 1, nAcct, 21).setValues(dataRows);
    sh.getRange(4, 7,  nAcct, 3).setNumberFormat('#,##0'); // 7〜9: 2か月前/先月/当月ダイヤ
    sh.getRange(4, 10, nAcct, 2).setNumberFormat('0"%"'); // 10〜11: 前々月比/先月比
    sh.getRange(4, 13, nAcct, 1).setNumberFormat('0.0');  // 13: 配信時間(h)
    sh.getRange(4, 14, nAcct, 3).setNumberFormat('#,##0'); // 14〜16: ダイヤ/h, MF, 累計
    sh.getRange(4, 18, nAcct, 3).setNumberFormat('#,##0'); // 18〜20: 予測ダイヤ
  }

  // パレート80%超重要顧客ハイライト
  for (var ri = 0; ri < nAcct; ri++) {
    if (paretoRankMap[liverMetrics[ri].uid] <= pareto80count) {
      sh.getRange(ri + 4, 1, 1, 21).setBackground('#FDFDE7');
    }
  }

  // 予測列の色分け（全ライバー共通: 自動算出=薄紫、予測0=色なし）
  for (var fri = 0; fri < nAcct; fri++) {
    var fr = liverMetrics[fri];
    if (fr.forecast1 > 0) {
      sh.getRange(fri + 4, 18, 1, 3).setBackground('#ce93d8'); // 薄紫 = 自動算出
    }
  }

  // 条件付き書式（3ヶ月推移 + セグメント）
  var trendRange = sh.getRange(4, 12, Math.max(nAcct, 1), 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('↑↑').setBackground('#D5F5E3').setRanges([trendRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('↓↓').setBackground('#FADBD8').setRanges([trendRange]).build()
  ]);

  SpreadsheetApp.flush();

  // ================================================================
  // 右側 (S〜W = cols 19〜23)
  // ================================================================
  sh.getRange(3, RC, 50, 5).breakApart();

  // ────────────────────────────────────────────────────────────────
  // Section 1: Tier移動（行3〜8）
  // ────────────────────────────────────────────────────────────────
  sh.getRange(3, RC, 1, 5).merge()
    .setValue('Tier移動（' + (prevMonth || 'N/A') + ' → ' + (displayMonth || 'N/A') + '）')
    .setBackground(NAVY).setFontColor(FG_W).setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(4, RC, 1, 5)
    .setValues([['指標', '人数', '移動率', '前月人数（母数）', '備考']])
    .setBackground(BG_GY).setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);

  function fmtRateDetail(num, denom) {
    return denom > 0 ? Math.round(num / denom * 100) + '% (' + num + '/' + denom + ')' : '-';
  }
  var t1DegradeN = matrix.T1.T2 + matrix.T1.T3;
  var moveData = [
    ['T3 → T2 昇格', matrix.T3.T2 + matrix.T3.T1, fmtRateDetail(matrix.T3.T2 + matrix.T3.T1, t3Total), t3Total + '人', ''],
    ['T2 → T1 昇格', matrix.T2.T1,                 fmtRateDetail(matrix.T2.T1, t2Total),                t2Total + '人', ''],
    ['T1 → T2 降格', t1DegradeN,                   fmtRateDetail(t1DegradeN, t1Total),                  t1Total + '人', '']
  ];
  moveData.forEach(function(r, i) {
    var rowNum = 5 + i;
    sh.getRange(rowNum, RC, 1, 5).setValues([r]).setHorizontalAlignment('center').setFontSize(9);
    sh.getRange(rowNum, RC).setHorizontalAlignment('left').setFontWeight('bold');
    if (i < 2) sh.getRange(rowNum, RC+1).setBackground(BG_GN).setFontWeight('bold').setFontSize(11);
    if (i === 2) sh.getRange(rowNum, RC+1).setBackground(BG_RD).setFontWeight('bold').setFontSize(11);
  });

  // ────────────────────────────────────────────────────────────────
  // Section 2: Tier別収益（行9〜17）
  // ────────────────────────────────────────────────────────────────
  sh.getRange(9, RC, 1, 5).merge()
    .setValue('Tier別収益サマリー（' + displayMonth + '）')
    .setBackground(NAVY).setFontColor(FG_W).setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(10, RC, 1, 5)
    .setValues([['', 'T1（上位）', 'T2（中間）', 'T3（下位）', '全体']])
    .setBackground(BG_GY).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(10, RC+1).setFontColor(T1_C);
  sh.getRange(10, RC+2).setFontColor(T2_C);
  sh.getRange(10, RC+3).setFontColor(T3_C);

  var totalDiaAll = tierGroups.T1.totalDia + tierGroups.T2.totalDia + tierGroups.T3.totalDia;
  var totalMFAll  = tierGroups.T1.totalMF  + tierGroups.T2.totalMF  + tierGroups.T3.totalMF;

  var tierTableData = [
    ['人数',        tierGroups.T1.count, tierGroups.T2.count, tierGroups.T3.count, nAcct],
    ['平均応援ダイヤ', avg(tierGroups.T1.totalDia, tierGroups.T1.count), avg(tierGroups.T2.totalDia, tierGroups.T2.count), avg(tierGroups.T3.totalDia, tierGroups.T3.count), avg(totalDiaAll, nAcct)],
    ['総応援ダイヤ', tierGroups.T1.totalDia, tierGroups.T2.totalDia, tierGroups.T3.totalDia, totalDiaAll],
    ['ダイヤシェア', pct(tierGroups.T1.totalDia, totalDiaAll), pct(tierGroups.T2.totalDia, totalDiaAll), pct(tierGroups.T3.totalDia, totalDiaAll), '100%'],
    ['総MF理論値 ※', tierGroups.T1.totalMF, tierGroups.T2.totalMF, tierGroups.T3.totalMF, totalMFAll]
  ];
  sh.getRange(11, RC, 5, 5).setValues(tierTableData);
  sh.getRange(11, RC, 5, 1).setFontWeight('bold');
  sh.getRange(11, RC+1, 1, 4).setNumberFormat('#,##0');
  sh.getRange(12, RC+1, 1, 4).setNumberFormat('#,##0');
  sh.getRange(13, RC+1, 1, 4).setNumberFormat('#,##0');
  sh.getRange(15, RC+1, 1, 4).setNumberFormat('#,##0');

  sh.getRange(16, RC, 1, 5).merge()
    .setValue('超重要顧客（パレート分析）: 上位 ' + pareto80count + '人（全体の' + pareto80pct + '%）が総ダイヤの 80% を占める')
    .setBackground('#FFF9C4').setFontWeight('bold').setHorizontalAlignment('left').setFontSize(9).setWrap(true);
  sh.setRowHeight(16, 30);

  sh.getRange(17, RC, 1, 5).merge()
    .setValue('※ MF理論値 = 事務所の推定月次売上（応援ダイヤ × 換算レート × 事務所配分率）。請求書確定額とは差異が生じる場合あり。')
    .setFontColor(FG_GY).setFontStyle('italic').setFontSize(9).setWrap(true);
  sh.setRowHeight(17, 30);

  // ────────────────────────────────────────────────────────────────
  // Section 2b: Tier内ランク構成比（二段階管理）（行18〜22）
  // ────────────────────────────────────────────────────────────────
  var sec2bRow = 18; // Section 2の直後（Section 3の前）に挿入
  sh.getRange(sec2bRow, RC, 1, 5).merge()
    .setValue('Tier内ランク構成比（' + displayMonth + '、アクティブのみ）')
    .setBackground('#1A237E').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(sec2bRow + 1, RC, 1, 5)
    .setValues([['Tier', 'Sランク(S1-S3)', 'Aランク(A1-A3)', 'Bランク(B1-B3)', 'C以下(D含む)']])
    .setBackground('#EEEEEE').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);

  var rcData = [
    ['T1（' + tierGroups.T1.count + '人）',
      rankComp.T1.S + '人', rankComp.T1.A + '人', rankComp.T1.B + '人', rankComp.T1.C + '人'],
    ['T2（' + tierGroups.T2.count + '人）',
      rankComp.T2.S + '人', rankComp.T2.A + '人', rankComp.T2.B + '人', rankComp.T2.C + '人'],
    ['T3（' + tierGroups.T3.count + '人）',
      rankComp.T3.S + '人', rankComp.T3.A + '人', rankComp.T3.B + '人', rankComp.T3.C + '人']
  ];
  sh.getRange(sec2bRow + 2, RC, 3, 5).setValues(rcData).setFontSize(10).setHorizontalAlignment('center');
  sh.getRange(sec2bRow + 2, RC, 3, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(sec2bRow + 2, RC + 1, 3, 1).setFontColor('#7B1FA2').setFontWeight('bold'); // Sランク = 紫

  // ────────────────────────────────────────────────────────────────
  // Section 3: 施策別ROI試算（行23〜27）
  // T列(RC+1,col20)=人件費, U列(RC+2,col21)=変化数（黄色入力）
  // V列(RC+3,col22)=推計追加MF（自動）, W列(RC+4,col23)=ROI倍率（自動）
  // Tier table: T13=T1総ダイヤ, U13=T2総ダイヤ, V13=T3総ダイヤ
  //             T15=T1総MF,     U15=T2総MF,     V15=T3総MF
  // ────────────────────────────────────────────────────────────────
  sh.getRange(23, RC, 1, 5).merge()
    .setValue('施策別ROI試算（黄色セルに入力 → 自動計算）')
    .setBackground(DARK).setFontColor(FG_W).setFontWeight('bold').setHorizontalAlignment('left');

  sh.getRange(24, RC, 1, 5)
    .setValues([['施策', '人件費/月（円）', '変化数（ダイヤ）', '推計追加MF（自動）', 'ROI倍率']])
    .setBackground(BG_GY).setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
  sh.getRange(24, RC+2).setNote('施策前後のダイヤ変化数を入力（例：昇格者のダイヤ増加分）');
  sh.getRange(24, RC+3).setNote('推計追加MF = 変化数 × （Tier MF ÷ Tier ダイヤ）');
  sh.getRange(24, RC+4).setNote('ROI = 推計追加MF ÷ 人件費');

  sh.setRowHeight(25, 28);
  sh.getRange(25, RC, 1, 5).setValues([['① T1向け施策', savedT1Cost, savedT1Delta, '', '']]).setFontSize(9);
  sh.getRange(25, RC).setFontWeight('bold');
  var cT1dia = colNumToLetter_(RC + 1);  // T1ダイヤ/MF 列
  var cT2dia = colNumToLetter_(RC + 2);  // T2ダイヤ/MF 列
  var cT3dia = colNumToLetter_(RC + 3);  // T3ダイヤ/MF 列
  var cCost  = colNumToLetter_(RC + 1);  // ROI人件費列（= Tier列と同じ列）
  var cDelta = colNumToLetter_(RC + 2);  // ROI変化数列
  var cResMF = colNumToLetter_(RC + 3);  // ROI推計MF列

  sh.getRange(25, RC+3).setFormula('=IF(' + cT1dia + '13>0,' + cDelta + '25*' + cT1dia + '15/' + cT1dia + '13,0)').setNumberFormat('#,##0');
  sh.getRange(25, RC+4).setFormula('=IF(' + cCost + '25>0,' + cResMF + '25/' + cCost + '25,0)').setNumberFormat('0.0');

  sh.setRowHeight(26, 28);
  sh.getRange(26, RC, 1, 5).setValues([['② T2向け施策', savedT2Cost, savedT2Delta, '', '']]).setFontSize(9);
  sh.getRange(26, RC).setFontWeight('bold');
  sh.getRange(26, RC+3).setFormula('=IF(' + cT2dia + '13>0,' + cDelta + '26*' + cT2dia + '15/' + cT2dia + '13,0)').setNumberFormat('#,##0');
  sh.getRange(26, RC+4).setFormula('=IF(' + cCost + '26>0,' + cResMF + '26/' + cCost + '26,0)').setNumberFormat('0.0');

  sh.setRowHeight(27, 28);
  sh.getRange(27, RC, 1, 5).setValues([['③ T3向け施策', savedT3Cost, savedT3Delta, '', '']]).setFontSize(9);
  sh.getRange(27, RC).setFontWeight('bold');
  sh.getRange(27, RC+3).setFormula('=IF(' + cT3dia + '13>0,' + cDelta + '27*' + cT3dia + '15/' + cT3dia + '13,0)').setNumberFormat('#,##0');
  sh.getRange(27, RC+4).setFormula('=IF(' + cCost + '27>0,' + cResMF + '27/' + cCost + '27,0)').setNumberFormat('0.0');

  sh.getRange(25, RC, 1, 5).setBackground('#FAFAFA');
  sh.getRange(26, RC, 1, 5).setBackground(FG_W);
  sh.getRange(27, RC, 1, 5).setBackground('#FAFAFA');
  sh.getRange(25, RC+1).setBackground(BG_Y); sh.getRange(25, RC+2).setBackground(BG_Y);
  sh.getRange(26, RC+1).setBackground(BG_Y); sh.getRange(26, RC+2).setBackground(BG_Y);
  sh.getRange(27, RC+1).setBackground(BG_Y); sh.getRange(27, RC+2).setBackground(BG_Y);

  // ────────────────────────────────────────────────────────────────
  // Section 4: 今月の投資対象ピックアップ（行29〜36）
  // 目的：どのTierの誰に時間・企画を打てば効率よく利益が上がるか
  // ────────────────────────────────────────────────────────────────

  // ① T1昇格候補: T2ライバーをダイヤ降順（上位5名）
  var t1Candidates = liverMetrics
    .filter(function(r) { return r.tier === 'T2' && r.latestDia > 0; })
    .slice().sort(function(a, b) { return b.latestDia - a.latestDia; })
    .slice(0, 5);

  // ② 企画ROI高: 配信時間が平均未満 かつ 当月ダイヤが平均以上（短配信でも稼げている人）
  // → 企画で配信時間を増やせばダイヤが直接増える
  var roiHighList = liverMetrics
    .filter(function(r) { return r.stTime < avgSegT && r.latestDia >= avgSegD && r.latestDia > 0; })
    .slice().sort(function(a, b) { return b.latestDia - a.latestDia; })
    .slice(0, 5);

  // ③ 要介入: T1/T2で先月比 −20%以下（ワースト順）
  var interventionList = liverMetrics
    .filter(function(r) {
      return (r.tier === 'T1' || r.tier === 'T2') && r.mom !== null && r.mom <= -20;
    })
    .slice().sort(function(a, b) { return a.mom - b.mom; })
    .slice(0, 5);

  function pickupNames(arr, maxShow) {
    if (arr.length === 0) return 'なし';
    var names = arr.map(function(r) { return r.name; });
    if (names.length <= maxShow) return names.join('・');
    return names.slice(0, maxShow).join('・') + ' 他' + (names.length - maxShow) + '人';
  }

  sh.getRange(29, RC, 1, 5).merge()
    .setValue('今月の投資対象ピックアップ（' + displayMonth + '）')
    .setBackground(NAVY).setFontColor(FG_W).setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(30, RC, 1, 5).setValues([['カテゴリ', '人数', '対象ライバー（上位）', '', '期待効果']])
    .setBackground(BG_GY).setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
  sh.getRange(30, RC+2, 1, 2).merge();

  var pickupRows = [
    { label: '🚀 T1昇格候補（T2ダイヤ上位）',       arr: t1Candidates,    effect: 'Tier昇格でMFレート上昇',  bg: BG_GN  },
    { label: '⚡ 企画ROI高（投げ銭多×配信時間少）',   arr: roiHighList,     effect: '配信時間↑で直接ダイヤUP', bg: BG_YL2 },
    { label: '⚠️ 要介入（T1/T2・先月比−20%超）',    arr: interventionList, effect: '急落チャーン防止',        bg: BG_RD  }
  ];
  pickupRows.forEach(function(pr, i) {
    var rn = 31 + i;
    sh.getRange(rn, RC, 1, 5).setBackground(pr.bg).setFontSize(9);
    sh.getRange(rn, RC+2, 1, 2).merge();
    sh.getRange(rn, RC  ).setValue(pr.label).setFontWeight('bold').setHorizontalAlignment('left');
    sh.getRange(rn, RC+1).setValue(pr.arr.length + '人').setHorizontalAlignment('center').setFontWeight('bold').setFontSize(11);
    sh.getRange(rn, RC+2).setValue(pickupNames(pr.arr, 3)).setHorizontalAlignment('left').setWrap(true);
    sh.getRange(rn, RC+4).setValue(pr.effect).setHorizontalAlignment('left').setFontColor(FG_GY).setFontStyle('italic');
    sh.setRowHeight(rn, 32);
  });

  sh.getRange(34, RC, 1, 5).merge()
    .setValue('【補足・判断軸】T2上位はT1昇格でMFレート上昇 ／ 投げ銭多×配信少は企画で配信時間を増やすと直接増収 ／ T1/T2急落放置が最大損失リスク')
    .setFontColor(FG_GY).setFontStyle('italic').setFontSize(8).setWrap(true).setHorizontalAlignment('left');
  sh.setRowHeight(34, 36);
  sh.getRange(35, RC, 2, 5).merge().setValue('').setBackground(FG_W);

  // ────────────────────────────────────────────────────────────────
  // Section 5: Tier別コンボチャート × 3枚（T1/T2/T3）
  // 横軸 = ライバー名（応援ダイヤ降順ソート）
  // 棒   = 配信時間(h)  → 左Y軸
  // 折れ線 = 応援ダイヤ → 右Y軸（スケールが異なるため別軸）
  // データ: N行 × 3列（ライバー名 / 配信時間h / 応援ダイヤ）
  // ────────────────────────────────────────────────────────────────
  var TIER_CHART_DEFS = [
    { tier: 'T1', label: 'T1（上位ライバー）', headerColor: T1_C, barColor: T1_C },
    { tier: 'T2', label: 'T2（中間ライバー）', headerColor: T2_C, barColor: T2_C },
    { tier: 'T3', label: 'T3（下位ライバー）', headerColor: T3_C, barColor: T3_C }
  ];

  // ────────────────────────────────────────────────────────────────
  // Section 6: 3ヶ月予測サマリー
  // ────────────────────────────────────────────────────────────────
  var fcstStartRow = 37;
  sh.getRange(fcstStartRow, RC, 1, 5).merge()
    .setValue('3ヶ月予測サマリー（トレンド自動算出 + バナイベ貢献）')
    .setBackground('#7B1FA2').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(fcstStartRow + 1, RC, 1, 5)
    .setValues([['指標', '+1ヶ月', '+2ヶ月', '+3ヶ月', '前月比']])
    .setBackground('#EEEEEE').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);

  var totalDiaLatestForFcst = tierGroups.T1.totalDia + tierGroups.T2.totalDia + tierGroups.T3.totalDia;
  var fcstData = [
    ['T1予測ダイヤ', fcstGroups.T1.dia1, fcstGroups.T1.dia2, fcstGroups.T1.dia3,
      fcstGroups.T1.dia3 > 0 && tierGroups.T1.totalDia > 0
        ? Math.round(fcstGroups.T1.dia3 / tierGroups.T1.totalDia * 100) + '%' : '-'],
    ['T2予測ダイヤ', fcstGroups.T2.dia1, fcstGroups.T2.dia2, fcstGroups.T2.dia3,
      fcstGroups.T2.dia3 > 0 && tierGroups.T2.totalDia > 0
        ? Math.round(fcstGroups.T2.dia3 / tierGroups.T2.totalDia * 100) + '%' : '-'],
    ['T3予測ダイヤ', fcstGroups.T3.dia1, fcstGroups.T3.dia2, fcstGroups.T3.dia3,
      fcstGroups.T3.dia3 > 0 && tierGroups.T3.totalDia > 0
        ? Math.round(fcstGroups.T3.dia3 / tierGroups.T3.totalDia * 100) + '%' : '-'],
    ['バナイベ貢献', banaibeForecastDia, banaibeForecastDia, banaibeForecastDia,
      '今月デビュー' + debutCountThisMonth + '人 × 期待値¥' + banaibeExpectedDia.toLocaleString()],
    ['全体予測ダイヤ', fcstDia1, fcstDia2, fcstDia3,
      fcstDia3 > 0 && totalDiaLatestForFcst > 0
        ? Math.round(fcstDia3 / totalDiaLatestForFcst * 100) + '%' : '-'],
    ['予測売上(税込概算)', fcstSales1, fcstSales2, fcstSales3, '']
  ];
  sh.getRange(fcstStartRow + 2, RC, fcstData.length, 5).setValues(fcstData);
  sh.getRange(fcstStartRow + 2, RC, fcstData.length, 1).setFontWeight('bold');
  sh.getRange(fcstStartRow + 2, RC + 1, fcstData.length - 1, 3).setNumberFormat('#,##0');
  sh.getRange(fcstStartRow + 7, RC + 1, 1, 3).setNumberFormat('#,##0');

  sh.getRange(fcstStartRow + 8, RC, 1, 5).merge()
    .setValue('【予測ロジック】 各ライバーの予測ダイヤ = 今月ダイヤ × (1 + 月変化率 × n) を全員分合計。月変化率 = (今月 − 3ヶ月前) ÷ 3ヶ月前 ÷ 3（±30%/月でクリップ）。バナイベ貢献 = 今月デビュー数 × 過去実績平均ダイヤ（RAWより自動算出）。予測売上 = 予測ダイヤ × 直近実績MF利率 × 1.10（税込概算）。月次ボーナス区分・施策バフは未反映。')
    .setFontColor('#757575').setFontStyle('italic').setFontSize(8).setWrap(true);
  sh.setRowHeight(fcstStartRow + 8, 28);

  var chartStartRow = fcstStartRow + 11;
  TIER_CHART_DEFS.forEach(function(tierDef) {
    // 配信時間 or ダイヤのどちらかある人を対象、ダイヤ降順ソート
    var tierMetrics = liverMetrics
      .filter(function(r) { return r.tier === tierDef.tier && (r.stTime > 0 || r.latestDia > 0); })
      .slice().sort(function(a, b) { return b.latestDia - a.latestDia; });
    if (tierMetrics.length === 0) return;

    // ヘッダー: ライバー名 | 配信時間(h) | 応援ダイヤ
    var headerRow = ['ライバー名', '配信時間(h)', '応援ダイヤ'];
    var chartRows = tierMetrics.map(function(r) {
      return [r.name, r.stTime > 0 ? r.stTime : 0, r.latestDia > 0 ? r.latestDia : 0];
    });
    var allData = [headerRow].concat(chartRows);

    // チャート幅: ライバー数に応じて動的に広げる（1人あたり約25px、最小600）
    var chartWidth = Math.max(600, Math.min(1400, tierMetrics.length * 25 + 150));

    // タイトル行（5列固定マージ）
    sh.getRange(chartStartRow, RC, 1, 5).merge()
      .setValue(tierDef.label + ' 配信時間 & 応援ダイヤ ライバー別（' + displayMonth + '）')
      .setBackground(tierDef.headerColor).setFontColor(FG_W).setFontWeight('bold')
      .setFontSize(9).setHorizontalAlignment('center');

    // データ書き込み（3列固定）
    sh.getRange(chartStartRow + 1, RC, allData.length, 3).setValues(allData);
    sh.getRange(chartStartRow + 1, RC, 1, 3)
      .setBackground(BG_GY).setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);

    // コンボチャート挿入
    // series 0（配信時間）= 棒・左Y軸  /  series 1（応援ダイヤ）= 折れ線・右Y軸
    var dataRange = sh.getRange(chartStartRow + 1, RC, allData.length, 3);
    sh.insertChart(
      sh.newChart()
        .setChartType(Charts.ChartType.COMBO)
        .addRange(dataRange)
        .setNumHeaders(1)
        .setPosition(chartStartRow, RC, 0, 0)
        .setOption('title', tierDef.label + ' 配信時間 & 応援ダイヤ（' + displayMonth + '）')
        .setOption('seriesType', 'bars')
        .setOption('series', { 1: { type: 'line', targetAxisIndex: 1, lineWidth: 2, pointSize: 5 } })
        .setOption('vAxes', {
          0: { title: '配信時間(h)', minValue: 0 },
          1: { title: '応援ダイヤ',  format: 'short', minValue: 0 }
        })
        .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
        .setOption('colors', [tierDef.barColor, ORANGE])
        .setOption('width', chartWidth)
        .setOption('height', 400)
        .setOption('legend', { position: 'top' })
        .setOption('bar', { groupWidth: '70%' })
        .build()
    );

    chartStartRow += Math.max(allData.length + 2, 22);
  });

  // ── 列幅 ──
  sh.setColumnWidth(1, 40);   // #
  sh.setColumnWidth(2, 120);  // 事務所名
  sh.setColumnWidth(3, 130);  // アカウント名
  sh.setColumnWidth(4, 45);   // Tier
  sh.setColumnWidth(5, 55);   // ランク（NEW）
  sh.setColumnWidth(6, 75);   // 最新月
  sh.setColumnWidth(7, 80);   // 2か月前ダイヤ
  sh.setColumnWidth(8, 80);   // 先月ダイヤ
  sh.setColumnWidth(9, 80);   // 当月ダイヤ
  sh.setColumnWidth(10, 65);  // 前々月比(%)
  sh.setColumnWidth(11, 65);  // 先月比(%)
  sh.setColumnWidth(12, 60);  // 3ヶ月推移
  sh.setColumnWidth(13, 75);  // 配信時間(h)
  sh.setColumnWidth(14, 75);  // 当月ダイヤ/h
  sh.setColumnWidth(15, 100); // 当月MF理論値
  sh.setColumnWidth(16, 145); // 累計ダイヤ(デビュー来)
  sh.setColumnWidth(17, 65);  // 活動月数
  sh.setColumnWidth(18, 90);  // +1ヶ月予測（後のタスクで使用）
  sh.setColumnWidth(19, 90);  // +2ヶ月予測
  sh.setColumnWidth(20, 90);  // +3ヶ月予測
  sh.setColumnWidth(21, 65);  // 予測Tier
  sh.setColumnWidth(22, 20);  // spacer
  sh.setColumnWidth(23, 20);  // spacer
  sh.setColumnWidth(RC,     145); // S: 施策名/セグメント
  sh.setColumnWidth(RC + 1, 100); // 人件費
  sh.setColumnWidth(RC + 2, 90);  // 変化数
  sh.setColumnWidth(RC + 3, 120); // 推計追加MF
  sh.setColumnWidth(RC + 4, 80);  // ROI倍率

  SpreadsheetApp.flush();
  sh.setFrozenRows(3);
  sh.setFrozenColumns(5);
  sh.getRange(3, 1, Math.max(nAcct, 1) + 1, 21).createFilter();

  sh.getRange(nAcct + 6, 1)
    .setValue('更新: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm'))
    .setFontColor(FG_GY).setFontStyle('italic');

  // ── DB_セグメントタブを廃止（DB_ライバー月次に統合済み）──
  var segSh = ss.getSheetByName(CONFIG.SHEET_DB_SEGMENT);
  if (segSh) ss.deleteSheet(segSh);

  Logger.log('rebuildLiverMonthly: ' + nAcct + '人, ' + displayMonth + ', Tier上昇' + tierUpCount + '人, T3→T2昇格率' + fmtRate(t3UpRate));
}
