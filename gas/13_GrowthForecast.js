// 13_GrowthForecast.gs v6
// 成長ボーナス予測シート（横軸=月、縦軸=事務所別指標）
//
// 判定ロジック（Excelから確定）:
//   ◎ 最高 : 月次ダイヤ ≥ 単月基準  OR  3か月ダイヤ ≥ 過去最高3か月ダイヤ
//   ✖✖ 最低: 月次ダイヤ < 最低（直近6ヶ月最小値）
//   ✖ 基準 : 月次ダイヤ < 3ヶ月基準（かつ最低以上）
//   ○      : その他
//
// レイアウト（事務所ブロック = 7行）:
//   行+0: ◆ 事務所名 | 成長判定 per month
//   行+1: 単月基準（過去最高月次ダイヤ）
//   行+2: 3ヶ月基準（ピーク3か月合計 - 前月 - 前々月）
//   行+3: 最低（直近6ヶ月の月次ダイヤ最小値）
//   行+4: 月次ダイヤ  ← キー行
//   行+5: 3か月ダイヤ ← キー行
//   行+6: （空行）

function rebuildGrowthForecast() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var officeSh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);

  // ── 1. 実績月一覧取得 ──
  var rawLastRow = rawSh.getLastRow();
  var allActualMonths = {};
  if (rawLastRow > 1) {
    var rawCol = rawSh.getRange(2, 1, rawLastRow - 1, 1).getValues();
    rawCol.forEach(function(r) {
      var mo = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
        : String(r[0]).substring(0, 7);
      if (mo && mo.length >= 7) allActualMonths[mo] = true;
    });
  }

  // ── 2. アクティブ事務所リスト ──
  var lastOfficeRow = officeSh.getLastRow();
  var officeRows = officeSh.getRange(2, 1, lastOfficeRow - 1, 3).getValues();
  var offices = [];
  officeRows.forEach(function(r) {
    if (r[0] && (r[2] === true || r[2] === 'TRUE')) offices.push(r[0]);
  });

  // ── 3. 月一覧生成（実績月 + 将来12ヶ月）──
  var sortedActual = Object.keys(allActualMonths).sort();
  if (sortedActual.length === 0) {
    SpreadsheetApp.getUi().alert('RAWにデータがありません。先にCSVを取り込んでください。');
    return;
  }
  var lastActual = sortedActual[sortedActual.length - 1];
  var allMonths = sortedActual.slice();
  var p = lastActual.split('-');
  var y = parseInt(p[0]), m = parseInt(p[1]);
  for (var i = 0; i < 12; i++) {
    m++; if (m > 12) { m = 1; y++; }
    allMonths.push(y + '-' + (m < 10 ? '0' + m : m));
  }
  var actualSet = {};
  sortedActual.forEach(function(mo) { actualSet[mo] = true; });

  var nM = allMonths.length;
  var nActual = sortedActual.length;
  var nPred = nM - nActual;

  // ── 4. シート初期化 ──
  var fSh = ss.getSheetByName(CONFIG.SHEET_DB_GROWTH_FORECAST);
  if (!fSh) fSh = ss.insertSheet(CONFIG.SHEET_DB_GROWTH_FORECAST);
  fSh.clear();
  fSh.clearConditionalFormatRules();

  var BG_HEADER   = '#1C4E80';
  var BG_OFFICE   = '#1A1A2E';
  var BG_PRED     = '#F0F0F0';
  var FG_WHITE    = '#FFFFFF';
  var FG_DARK     = '#333333';
  var FG_MARU     = '#1A7343';
  var FG_BATSU    = '#C0392B';
  var FG_DBLBATSU = '#7B241C';
  var FG_GRAY     = '#888888';

  var LBL_BEST = '◎';
  var LBL_NORM = '○';
  var LBL_LOW  = '✖';

  // ── 5. ヘッダー行（月の Date値）──
  fSh.getRange(1, 1).setValue('指標 \\ 月')
    .setBackground(BG_HEADER).setFontColor(FG_WHITE)
    .setFontWeight('bold').setHorizontalAlignment('CENTER');

  var dateVals = [[]];
  allMonths.forEach(function(mo) {
    var pts = mo.split('-');
    dateVals[0].push(new Date(parseInt(pts[0]), parseInt(pts[1]) - 1, 1));
  });
  fSh.getRange(1, 2, 1, nM).setValues(dateVals)
    .setBackground(BG_HEADER).setFontColor(FG_WHITE)
    .setFontWeight('bold').setHorizontalAlignment('CENTER');
  allMonths.forEach(function(mo, ci) {
    fSh.getRange(1, ci + 2).setNumberFormat(actualSet[mo] ? 'M"月"' : 'M"月(予)"');
  });

  // ── 6. 全社合計行（行2〜5）──
  var RAW = "'RAW_ライバー月次'";
  var SUM_SH = "'PL（個社別）'";
  var totalFml = '=IF(COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"))>0,'
               + 'SUMIFS(' + RAW + '!C16,' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm")),'
               + 'IFERROR(AVERAGE(OFFSET(RC[0],0,-3,1,3)),0))';

  fSh.getRange(2, 1).setValue('全社 月次ダイヤ合計')
    .setBackground(BG_HEADER).setFontColor(FG_WHITE).setFontWeight('bold');
  fSh.getRange(2, 2, 1, nM)
    .setFormulasR1C1([Array(nM).fill(totalFml)])
    .setBackground(BG_HEADER).setFontColor(FG_WHITE).setFontWeight('bold')
    .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');

  // 行3: 全社 アクティブライバー数（実績=RAW COUNTIFS、予測=3ヶ月平均）
  var activeFml = '=IF(COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"))>0,'
    + 'COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"),' + RAW + '!C30,TRUE),'
    + 'IFERROR(AVERAGE(OFFSET(RC,0,-3,1,3)),0))';
  fSh.getRange(3, 1).setValue('全社 アクティブライバー数')
    .setBackground(BG_HEADER).setFontColor(FG_WHITE).setFontWeight('bold');
  fSh.getRange(3, 2, 1, nM)
    .setFormulasR1C1([Array(nM).fill(activeFml)])
    .setBackground(BG_HEADER).setFontColor(FG_WHITE)
    .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');

  // 行4: 全社 デビュー数（実績=RAW COUNTIFS、予測=3ヶ月平均）
  var debutFml = '=IF(COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"))>0,'
    + 'COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"),' + RAW + '!C31,TRUE),'
    + 'IFERROR(AVERAGE(OFFSET(RC,0,-3,1,3)),0))';
  fSh.getRange(4, 1).setValue('全社 デビュー数')
    .setBackground(BG_HEADER).setFontColor(FG_WHITE).setFontWeight('bold');
  fSh.getRange(4, 2, 1, nM)
    .setFormulasR1C1([Array(nM).fill(debutFml)])
    .setBackground(BG_HEADER).setFontColor(FG_WHITE)
    .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');

  // 行5: 全社 売上（税込）（実績月=DB_サマリ INDEX/MATCH、予測月=3ヶ月平均）
  // COUNTIFS でRAWに実データがある月か判定してから分岐（0返しを防ぐ）
  var revFml = '=IF(COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"))>0,'
    + 'IFERROR(INDEX(' + SUM_SH + '!C1:C300,'
    +   'MATCH("売上（税込　iriam請求書と一致）",' + SUM_SH + '!C1,0),'
    +   'MATCH(TEXT(R1C[0],"yyyy-mm"),TEXT(' + SUM_SH + '!R2,"yyyy-mm"),0)),0),'
    + 'IFERROR(AVERAGE(OFFSET(RC[0],0,-3,1,3)),0))';
  fSh.getRange(5, 1).setValue('全社 売上（税込）')
    .setBackground(BG_HEADER).setFontColor(FG_WHITE).setFontWeight('bold');
  fSh.getRange(5, 2, 1, nM)
    .setFormulasR1C1([Array(nM).fill(revFml)])
    .setBackground(BG_HEADER).setFontColor(FG_WHITE)
    .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');

  // ── 7. 事務所ブロック ──
  var cfRules = [];
  var rowIdx = 6;

  offices.forEach(function(office) {
    var offHdr   = rowIdx;
    var maxRow   = rowIdx + 1;
    var req3mRow = rowIdx + 2;
    var minRow   = rowIdx + 3;
    var diaRow   = rowIdx + 4;
    var sum3Row  = rowIdx + 5;
    rowIdx += 7;

    var safeOff = office.replace(/"/g, '""');

    fSh.getRange(offHdr, 1, 1, nM + 1).setBackground(BG_OFFICE).setFontColor(FG_WHITE);
    fSh.getRange(offHdr, 1).setValue('◆ ' + office).setFontWeight('bold')
      .setNote('【成長判定の基準】\n◎ 最高：月次ダイヤ ≥ 単月基準（過去最高）、または 3か月ダイヤ ≥ 過去最高3か月合計\n○ 基準：上記以外\n✖ 最低：月次ダイヤ < 最低（直近6ヶ月の最小値）\n\n※ ◎は「単月の最高更新」と「3か月累計の最高更新」のどちらかを満たせばOK');

    fSh.getRange(maxRow,   1).setValue('　単月基準（過去最高）')
      .setNote('当月を含まない過去全月の月次ダイヤの最大値。\nこの値を当月の月次ダイヤが超えると ◎ の単月条件を満たす。\n\n例：過去最高が10万ダイヤ → 今月10万以上で◎');

    fSh.getRange(req3mRow, 1).setValue('　3ヶ月基準（維持ライン）')
      .setNote('「過去最高の3か月ダイヤ合計 − 前月ダイヤ − 前々月ダイヤ」の値。\n当月ダイヤがこの値以上になると、3か月合計が過去最高を更新して ◎ の3か月条件を満たす。\n\n例：過去最高3か月合計が30万、前月8万、前々月9万 → 基準は13万（30-8-9）\n    → 今月13万以上なら3か月合計が30万以上になり◎');

    fSh.getRange(minRow,   1).setValue('　最低（直近6ヶ月最小）')
      .setNote('直近6か月の月次ダイヤの最小値（6か月未満のデータしかない場合は取得可能な範囲の最小値）。\n月次ダイヤがこの値を下回ると ✖ 判定（最低ライン割れ）。\n\n例：直近6か月のダイヤが [12万, 10万, 8万, 9万, 11万, 7万] → 最低=7万\n    → 今月7万未満で✖');

    fSh.getRange(diaRow,   1).setValue('　月次ダイヤ').setFontWeight('bold')
      .setNote('【算出方法（列ごとに自動切替）】\n①実績月（白背景）：RAW_ライバー月次の応援ダイヤを事務所・月で集計した実績値\n②当月（日次データあり）：RAW_日次の最新累計÷経過日数×月末日数で月末着地予測\n③将来月（グレー背景）：直近3か月の月次ダイヤの平均値で自動予測\n\n※ 将来月は実績が入ると①に自動切替\n\n⚠️ 集計対象：全ライバー（既存ライバー含む）\nPL（個社別）の総応援ダイヤ（MF算出ベース・新規/移籍のみ）より値が多い。\n差分＝既存ライバーのダイヤ分（月によって10万前後の差）。');

    fSh.getRange(sum3Row,  1).setValue('　3か月ダイヤ')
      .setNote('当月 + 前月 + 前々月の月次ダイヤの合計。\n「3ヶ月基準（維持ライン）」と組み合わせて ◎ の3か月条件の判定に使用。\n\n例：今月12万、前月8万、前々月9万 → 3か月ダイヤ = 29万');

    // ── 月次ダイヤ: ①実績→SUMIFS / ②今月×日次あり→月末予測 / ③フォールバック→3ヶ月平均 ──
    var RAW_D = "'RAW_日次'";
    var monthStart  = 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)';
    var monthEnd    = 'EOMONTH(TODAY(),0)';
    var isThisMonth = 'TEXT(R1C[0],"yyyy-mm")=TEXT(TODAY(),"yyyy-mm")';
    var hasDailyData = 'COUNTIFS(' + RAW_D + '!C2,"' + safeOff + '",'
                     + RAW_D + '!C1,">="&' + monthStart + ','
                     + RAW_D + '!C1,"<="&' + monthEnd + ')>0';
    var latestDate  = 'MAXIFS(' + RAW_D + '!C1,' + RAW_D + '!C2,"' + safeOff + '",'
                    + RAW_D + '!C1,">="&' + monthStart + ','
                    + RAW_D + '!C1,"<="&' + monthEnd + ')';
    var cumDia      = 'SUMIFS(' + RAW_D + '!C5,' + RAW_D + '!C2,"' + safeOff + '",'
                    + RAW_D + '!C1,' + latestDate + ')';
    var dailyFcst   = cumDia + '/DAY(' + latestDate + ')*DAY(EOMONTH(TODAY(),0))';
    var fallback    = 'IFERROR(AVERAGE(OFFSET(RC[0],0,-3,1,3)),0)';

    var diaFml = '=IF(COUNTIFS(' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"),' + RAW + '!C2,"' + safeOff + '")>0,'
               + 'SUMIFS(' + RAW + '!C16,' + RAW + '!C1,TEXT(R1C[0],"yyyy-mm"),' + RAW + '!C2,"' + safeOff + '"),'
               + 'IFERROR('
               +   'IF(AND(' + isThisMonth + ',' + hasDailyData + '),' + dailyFcst + ',' + fallback + '),'
               +   fallback + '))';

    // ── 単月基準: 当月を含まない過去最高月次ダイヤ ──
    var maxFml = '=IF(COLUMN()<3,0,IFERROR(MAX(R' + diaRow + 'C2:R' + diaRow + 'C[-1]),0))';

    // ── 3ヶ月基準: MAX(過去3か月ダイヤ) - 前月 - 前々月 ──
    // C[-2]がラベル列(テキスト)を参照しないようCOLUMN()>3でガード
    var req3mFml = '=IF(COLUMN()<3,0,'
                 + 'IFERROR(MAX(R' + sum3Row + 'C2:R' + sum3Row + 'C[-1]),0)'
                 + '-IFERROR(R' + diaRow + 'C[-1],0)'
                 + '-IF(COLUMN()>3,IFERROR(R' + diaRow + 'C[-2],0),0))';

    // ── 最低: 直近6ヶ月の月次ダイヤ最小値 ──
    var minFml = '=IF(COLUMN()<=2,0,'
               + 'IFERROR(MIN(R' + diaRow + 'C[-6]:R' + diaRow + 'C[-1]),'
               + 'IFERROR(MIN(R' + diaRow + 'C2:R' + diaRow + 'C[-1]),0)))';

    // ── 3か月ダイヤ: 当月+前月+前々月 ──
    // C[-1]/C[-2]がラベル列テキストを参照しないようCOLUMN()でガード
    // (IFERRORはテキストをエラーと見なさないため加算時に#VALUE!になる)
    var sum3Fml = '=IFERROR(R' + diaRow + 'C[0],0)'
                + '+IF(COLUMN()>2,IFERROR(R' + diaRow + 'C[-1],0),0)'
                + '+IF(COLUMN()>3,IFERROR(R' + diaRow + 'C[-2],0),0)';

    // ── 成長判定 ──
    // 逆順範囲エラー回避: C2:C[-1]はCOLUMN()>2のときのみ評価
    var pastPeak3m = 'IF(COLUMN()>2,IFERROR(MAX(R' + sum3Row + 'C2:R' + sum3Row + 'C[-1]),0),0)';
    var judgeFml = '=IF(R' + diaRow + 'C[0]=0,"",IF(OR('
                 + 'AND(R' + maxRow + 'C[0]>0,R' + diaRow + 'C[0]>=R' + maxRow + 'C[0]),'
                 + 'AND(' + pastPeak3m + '>0,'
                 +     'IFERROR(R' + sum3Row + 'C[0],0)>=' + pastPeak3m + ')'
                 + '),"' + LBL_BEST + '",'
                 + 'IF(AND(R' + minRow + 'C[0]>0,R' + diaRow + 'C[0]<R' + minRow + 'C[0]),"' + LBL_LOW + '","' + LBL_NORM + '")))';


    fSh.getRange(diaRow,   2, 1, nM).setFormulasR1C1([Array(nM).fill(diaFml)])
      .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT').setFontWeight('bold');
    fSh.getRange(maxRow,   2, 1, nM).setFormulasR1C1([Array(nM).fill(maxFml)])
      .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');
    fSh.getRange(req3mRow, 2, 1, nM).setFormulasR1C1([Array(nM).fill(req3mFml)])
      .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');
    fSh.getRange(minRow,   2, 1, nM).setFormulasR1C1([Array(nM).fill(minFml)])
      .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');
    fSh.getRange(sum3Row,  2, 1, nM).setFormulasR1C1([Array(nM).fill(sum3Fml)])
      .setNumberFormat('#,##0').setHorizontalAlignment('RIGHT');

    fSh.getRange(offHdr, 2, 1, nM).setFormulasR1C1([Array(nM).fill(judgeFml)])
      .setHorizontalAlignment('CENTER').setFontWeight('bold').setFontColor(FG_WHITE);

    // ── 条件付き書式 ──
    var judgeRef = 'B' + offHdr;
    var diaRange  = fSh.getRange(diaRow,  2, 1, nM);
    var sum3Range = fSh.getRange(sum3Row, 2, 1, nM);

    cfRules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=' + judgeRef + '="' + LBL_BEST + '"')
        .setFontColor(FG_MARU).setRanges([diaRange]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=' + judgeRef + '="' + LBL_BEST + '"')
        .setFontColor(FG_MARU).setRanges([sum3Range]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=' + judgeRef + '="' + LBL_LOW + '"')
        .setFontColor(FG_BATSU).setRanges([diaRange]).build()
    );
  });

  // ── 8. 予測月のグレー背景 ──
  if (nPred > 0) {
    var firstPredCol = nActual + 2;
    // 全社集計行（3〜5行目）のグレー背景（フォント色も視認性のためダークに）
    fSh.getRange(3, firstPredCol, 3, nPred).setBackground(BG_PRED).setFontColor(FG_DARK);
    // 事務所ブロック（rowIdx=6 開始）のグレー背景
    offices.forEach(function(_, oi) {
      var maxR = 6 + oi * 7 + 1;
      fSh.getRange(maxR, firstPredCol, 5, nPred).setBackground(BG_PRED);
    });
  }

  // ── 9. 条件付き書式を一括登録 ──
  if (cfRules.length > 0) {
    fSh.setConditionalFormatRules(cfRules);
  }

  // ── 10. レイアウト設定 ──
  fSh.setColumnWidth(1, 210);
  for (var ci = 0; ci < nM; ci++) fSh.setColumnWidth(ci + 2, 96);
  fSh.setFrozenRows(1);
  fSh.setFrozenColumns(1);
  fSh.setRowHeight(1, 28);

  // ── 11. 成長判定込み売上予測（予測月を上書き）──
  SpreadsheetApp.flush();
  _computeRevForecast(ss, fSh, offices, nActual, nM);

  fSh.getRange(rowIdx, 1)
    .setValue('更新: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm'))
    .setFontColor(FG_GRAY).setFontStyle('italic');

  Logger.log('rebuildGrowthForecast v6: ' + offices.length + '事務所, ' + nM + '月分（実績' + nActual + '+予測12）');
}

/**
 * 予測月の全社売上（行5）を「直近3か月平均 × 成長補正」で上書き。
 * 補正率 = 各事務所のダイヤ加重平均（◎→M_事務所G列、✖→H列、○→0）。
 * flush() 後に呼び、スプレッドシート計算済み値を使用する。
 */
function _computeRevForecast(ss, fSh, offices, nActual, nM) {
  if (nActual >= nM) return;

  // M_事務所からボーナス補正率を取得
  var moSh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  var offCorr = {};
  var moLastRow = moSh.getLastRow();
  if (moLastRow >= 2) {
    moSh.getRange(2, 1, moLastRow - 1, 8).getValues().forEach(function(r) {
      if (r[0]) offCorr[r[0]] = { best: Number(r[6]) || 0.4, low: Number(r[7]) || -0.3 };
    });
  }

  // 行5（売上）全月の値を取得（実績月はINDEX/MATCH済み、予測月は暫定3か月平均）
  var revRow5 = fSh.getRange(5, 2, 1, nM).getValues()[0];

  // 各事務所の判定行（offHdr）と月次ダイヤ行（diaRow）を取得
  var blocks = offices.map(function(office, oi) {
    var base = 6 + oi * 7;
    return {
      name:       office,
      judgeVals:  fSh.getRange(base,     2, 1, nM).getValues()[0],
      diaVals:    fSh.getRange(base + 4, 2, 1, nM).getValues()[0]
    };
  });

  // 予測月を順に計算（前の予測月の値を次の月のベースに使う）
  var resultVals = revRow5.slice();
  var updates = [];
  for (var fi = nActual; fi < nM; fi++) {
    var src = [];
    for (var bi = fi - 3; bi < fi; bi++) {
      if (bi >= 0 && Number(resultVals[bi]) > 0) src.push(Number(resultVals[bi]));
    }
    if (src.length === 0) { updates.push(0); continue; }
    var baseRev = src.reduce(function(a, b) { return a + b; }, 0) / src.length;

    var totalDia = 0, corrSum = 0;
    blocks.forEach(function(blk) {
      var dia = Number(blk.diaVals[fi]) || 0;
      if (dia <= 0) return;
      var j = String(blk.judgeVals[fi] || '○');
      var c = offCorr[blk.name] || { best: 0.4, low: -0.3 };
      var rate = (j === '◎') ? c.best : (j === '✖') ? c.low : 0;
      totalDia += dia;
      corrSum  += dia * rate;
    });

    var corrFactor = (totalDia > 0) ? corrSum / totalDia : 0;
    resultVals[fi] = Math.round(baseRev * (1 + corrFactor));
    updates.push(resultVals[fi]);
  }

  if (updates.length > 0) {
    fSh.getRange(5, nActual + 2, 1, updates.length)
      .setValues([updates])
      .setNumberFormat('#,##0')
      .setFontColor('#333333');
  }
}
