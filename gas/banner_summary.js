function buildBannerSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName('banner_active');
  if (!src) { Logger.log('banner_active タブが見つかりません'); return; }
  const lastRow = src.getLastRow();

  const CALC = '_banner_calc';
  let calc = ss.getSheetByName(CALC);
  if (calc) ss.deleteSheet(calc);
  calc = ss.insertSheet(CALC);
  calc.getRange(1, 1, 1, 7).setValues([['個社', 'レーベル', 'ライバー', '週', 'pt', '順位', '入賞']]);
  const g = (col) => '=ARRAYFORMULA(IF(banner_active!C2:C="","",banner_active!' + col + '2:' + col + '))';
  calc.getRange(2, 1).setFormula(g('C'));
  calc.getRange(2, 2).setFormula(g('N'));
  calc.getRange(2, 3).setFormula(g('M'));
  calc.getRange(2, 4).setFormula('=ARRAYFORMULA(IF(banner_active!C2:C="","",LEFT(banner_active!E2:E&"",8)))');  // 週＝EventId先頭8桁(実イベント日)
  calc.getRange(2, 5).setFormula(g('Q'));
  calc.getRange(2, 6).setFormula(g('P'));
  calc.getRange(2, 7).setFormula('=ARRAYFORMULA(IF(banner_active!C2:C="","",IF(banner_active!R2:R="TRUE",1,0)))');
  calc.hideSheet();

  const NAME = 'DB_バナー実績集計';
  let sh = ss.getSheetByName(NAME);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(NAME);

  const WEEKS = 4;
  const AGG = ['pt合計', 'ライバー平均pt', '入賞数', '参加数'];
  const C_ORG = 3, C_LABEL = 14, C_PT = 17, C_ID = 12;
  const data = src.getRange(2, 1, lastRow - 1, 18).getValues();
  function uniqueByPt(ci) { const map = {}; for (const r of data) { if (r[C_ID - 1] === '' || r[C_ID - 1] == null) continue; const k = r[ci - 1]; if (k === '' || k == null) continue; map[k] = (map[k] || 0) + (Number(r[C_PT - 1]) || 0); } return Object.keys(map).sort((a, b) => map[b] - map[a]); }
  function colL(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }

  sh.getRange(1, 1).setValue('トップバナー実績集計（直近' + WEEKS + '回・バナイベ別／EventId基準）');
  sh.getRange(2, 1).setValue('基準日');
  sh.getRange(2, 2).setFormula('=INDEX(SORT(UNIQUE(_banner_calc!$D$2:$D),1,FALSE),1)');
  sh.getRange(2, 3).setValue('← B2を変えると直近' + WEEKS + '週が連動（YYYYMMDD）');

  const cr = (c) => '_banner_calc!$' + c + '$2:$' + c;
  const W = 'D', PT = 'E', WIN = 'G';
  function fml(metric, ar, key, wk) {
    if (metric === 'pt合計') return '=SUMIFS(' + cr(PT) + ',' + ar + ',' + key + ',' + cr(W) + ',' + wk + ')';
    if (metric === 'ライバー平均pt') return '=IFERROR(ROUND(SUMIFS(' + cr(PT) + ',' + ar + ',' + key + ',' + cr(W) + ',' + wk + ')/COUNTIFS(' + ar + ',' + key + ',' + cr(W) + ',' + wk + ')),"")';
    if (metric === '入賞数') return '=SUMIFS(' + cr(WIN) + ',' + ar + ',' + key + ',' + cr(W) + ',' + wk + ')';
    if (metric === '参加数') return '=COUNTIFS(' + ar + ',' + key + ',' + cr(W) + ',' + wk + ')';
    return '';
  }
  function fmt(metric) { return (metric === 'pt合計' || metric === 'ライバー平均pt') ? '#,##0' : '0'; }
  const palette = ['#cfe2f3', '#d9ead3', '#fff2cc', '#fce5cd'];
  let row = 4;

  const aggSecs = [
    { title: '① 個社別', axisCalc: 'A', srcCol: C_ORG, head: '個社' },
    { title: '② レーベル別', axisCalc: 'B', srcCol: C_LABEL, head: 'レーベル' }
  ];
  for (const sec of aggSecs) {
    const MM = AGG.length, firstCol = 2;
    const secRow = row, weekRow = row + 1, headRow = row + 2, dataStart = row + 3;
    sh.getRange(secRow, 1).setValue(sec.title);
    for (let k = 0; k < WEEKS; k++) { const c0 = firstCol + k * MM; sh.getRange(weekRow, c0).setFormula('=INDEX(SORT(UNIQUE(FILTER(_banner_calc!$D$2:$D,_banner_calc!$D$2:$D<=$B$2)),1,FALSE),' + (k + 1) + ')'); sh.getRange(weekRow, c0, 1, MM).merge(); }
    sh.getRange(headRow, 1).setValue(sec.head);
    const head = []; for (let k = 0; k < WEEKS; k++) for (let m = 0; m < MM; m++) head.push(AGG[m]);
    sh.getRange(headRow, firstCol, 1, WEEKS * MM).setValues([head]);
    const axisVals = uniqueByPt(sec.srcCol);
    const totalCols = firstCol - 1 + WEEKS * MM;
    if (axisVals.length > 0) {
      sh.getRange(dataStart, 1, axisVals.length, 1).setValues(axisVals.map(v => [v]));
      const fm = [];
      for (let i = 0; i < axisVals.length; i++) { const r = dataStart + i; const ar = cr(sec.axisCalc), key = '$A' + r; const line = []; for (let k = 0; k < WEEKS; k++) { const wk = '$' + colL(firstCol + k * MM) + '$' + weekRow; for (let m = 0; m < MM; m++) line.push(fml(AGG[m], ar, key, wk)); } fm.push(line); }
      sh.getRange(dataStart, firstCol, axisVals.length, WEEKS * MM).setFormulas(fm);
      const dataEnd = dataStart + axisVals.length - 1;
      sh.getRange(secRow, 1, 1, totalCols).merge().setBackground('#1c4587').setFontColor('#fff').setFontWeight('bold').setFontSize(11);
      for (let k = 0; k < WEEKS; k++) sh.getRange(weekRow, firstCol + k * MM, 1, MM).setBackground(palette[k % 4]).setFontWeight('bold').setHorizontalAlignment('center');
      sh.getRange(headRow, 1, 1, totalCols).setBackground('#f3f3f3').setFontWeight('bold').setHorizontalAlignment('center');
      for (let k = 0; k < WEEKS; k++) for (let m = 0; m < MM; m++) sh.getRange(dataStart, firstCol + k * MM + m, axisVals.length, 1).setNumberFormat(fmt(AGG[m]));
      for (let i = 0; i < axisVals.length; i++) if (i % 2 === 1) sh.getRange(dataStart + i, 1, 1, totalCols).setBackground('#f9f9f9');
      sh.getRange(weekRow, 1, dataEnd - weekRow + 1, totalCols).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
      row = dataEnd + 3;
    } else row = dataStart + 3;
  }

  const COLS = ['ライバー', '所属会社', 'レーベル', '順位', 'pt', '入賞'];
  const CN = COLS.length, BW = CN + 1;
  const secRow = row, weekRow = row + 1, headRow = row + 2, dataRow = row + 3;
  sh.getRange(secRow, 1).setValue('③ ライバー別（週ごとの参加者・入賞者が上＝pt順）');
  for (let k = 0; k < WEEKS; k++) {
    const c0 = 1 + k * BW;
    sh.getRange(weekRow, c0).setFormula('=INDEX(SORT(UNIQUE(FILTER(_banner_calc!$D$2:$D,_banner_calc!$D$2:$D<=$B$2)),1,FALSE),' + (k + 1) + ')');
    sh.getRange(weekRow, c0, 1, CN).merge();
    sh.getRange(headRow, c0, 1, CN).setValues([COLS]);
    const wk = '$' + colL(c0) + '$' + weekRow;
    const q = '=IFERROR(QUERY(_banner_calc!$A$2:$G,"SELECT Col3,Col1,Col2,Col6,Col5,Col7 WHERE Col4="&CHAR(39)&' + wk + '&CHAR(39)&" ORDER BY Col7 DESC,Col5 DESC",0),"参加なし")';
    sh.getRange(dataRow, c0).setFormula(q);
    sh.getRange(weekRow, c0, 1, CN).setBackground(palette[k % 4]).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(headRow, c0, 1, CN).setBackground('#f3f3f3').setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(dataRow, c0 + 3, 300, 1).setNumberFormat('0');
    sh.getRange(dataRow, c0 + 4, 300, 1).setNumberFormat('#,##0');
  }
  sh.getRange(secRow, 1, 1, WEEKS * BW - 1).merge().setBackground('#1c4587').setFontColor('#fff').setFontWeight('bold').setFontSize(11);

  sh.getRange(1, 1, 1, 12).merge().setBackground('#0b5394').setFontColor('#fff').setFontWeight('bold').setFontSize(13);
  sh.setRowHeight(1, 30);
  sh.getRange(2, 2).setBackground('#fff2cc').setFontWeight('bold').setHorizontalAlignment('center');
  sh.setColumnWidth(1, 150);
  Logger.log('完成');
}