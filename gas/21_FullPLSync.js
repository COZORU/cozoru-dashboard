// 21_FullPLSync.gs
// PL(全社) ※最終調整 の壊れた数式を診断・修正する
//
// 旧スプシからコピー時に個社別タブへの参照が #REF! になった問題を解決する。
// 対応方法: PL(個社別) 内の各社セクションの対応行を参照する数式に書き換える。
//
// 使い方:
//   1. diagnoseFullPL() を実行 → スクリプトログで壊れたセルを確認
//   2. fixFullPL() を実行 → PL(個社別) の各社セクションへの参照式に自動修正

var FULL_PL_SHEET_NAME  = 'PL(全社)';
var IND_PL_SHEET_NAME   = 'PL（個社別）';

// PL(全社) 内で参照先として期待されていた旧シート名 → PL(個社別) のセクション名 マッピング
var OLD_SHEET_TO_SECTION = {
  'cozoru:全社':  'cozoru',
  'ライブナウV':  'ライブナウV',
  'Tolance:全社': 'Tolance:全社',
};

// ─────────────────────────────────────────
// 000a. PL(全社) の壊れた参照を PL（個社別）全社合計セクションに張り直す
// ─────────────────────────────────────────
function rebuildFullPLFormulas() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var fullPlSh = ss.getSheetByName(FULL_PL_SHEET_NAME);
  var indPlSh  = ss.getSheetByName(IND_PL_SHEET_NAME);
  if (!fullPlSh) { Logger.log('[ERROR] ' + FULL_PL_SHEET_NAME + ' 未検出'); return; }
  if (!indPlSh)  { Logger.log('[ERROR] ' + IND_PL_SHEET_NAME  + ' 未検出'); return; }

  // ── PL(全社) 行 → PL（個社別）全社合計セクション行 の対応表 ──
  var ROW_MAP = {
    79: 4,  80: 5,  81: 6,  82: 7,  83: 8,
    84: 9,  85: 10, 86: 11, 87: 12,
    88: 13, 89: 14, 90: 15, 91: 16,
    92: 17, 93: 18, 94: 19, 95: 20, 96: 21,
    103: 28, 104: 30, 105: 31,
    106: 32, 107: 34, 108: 35,
    109: 36, 110: 38, 111: 39,
    112: 40, 113: 42, 114: 43,
    115: 44, 116: 45, 117: 46, 118: 47,
    119: 48, 120: 49, 122: 54,
    131: 50, 132: 51, 133: 52, 136: 53
    // 130(非アクティブ数)/134(Tier4)/135(非アクティブ) は新シートに対応行なし → スキップ
  };

  // ── PL（個社別）の月ヘッダー行(row2)から 月文字列→列番号 マップを作成 ──
  var indLastCol = indPlSh.getLastColumn();
  var indMonthRow = indPlSh.getRange(2, 1, 1, indLastCol).getValues()[0];
  var indMonthMap = {}; // 'yyyy-MM' → 1-based col number
  for (var c = 0; c < indMonthRow.length; c++) {
    var v = indMonthRow[c];
    var ms = null;
    if (v instanceof Date) {
      ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    } else if (typeof v === 'string') {
      var m1 = v.match(/^(\d{4})-(\d{2})$/);
      var m2 = v.match(/^(\d{4})\/(\d{1,2})$/);
      if (m1) ms = m1[1] + '-' + m1[2];
      if (m2) ms = m2[1] + '-' + ('0' + m2[2]).slice(-2);
    }
    if (ms) indMonthMap[ms] = c + 1;
  }
  Logger.log('PL（個社別）月マップ: ' + JSON.stringify(indMonthMap));

  // ── PL(全社) の月ヘッダー行を自動検出 ──
  var fullLastRow = fullPlSh.getLastRow();
  var fullLastCol = fullPlSh.getLastColumn();
  var fullMonthRow = -1;
  var fullMonthMap = {}; // 1-based col → 'yyyy-MM'
  for (var r = 0; r < Math.min(fullLastRow, 10); r++) {
    var rowVals = fullPlSh.getRange(r + 1, 1, 1, fullLastCol).getValues()[0];
    var monthCount = 0;
    for (var c = 0; c < rowVals.length; c++) {
      var v = rowVals[c];
      var ms = null;
      if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string') {
        var m1 = v.match(/^(\d{4})-(\d{2})$/);
        var m2 = v.match(/^(\d{4})\/(\d{1,2})$/);
        if (m1) ms = m1[1] + '-' + m1[2];
        if (m2) ms = m2[1] + '-' + ('0' + m2[2]).slice(-2);
      }
      if (ms) { fullMonthMap[c + 1] = ms; monthCount++; }
    }
    if (monthCount >= 3) { fullMonthRow = r + 1; break; }
  }
  Logger.log('PL(全社) 月ヘッダー行: ' + fullMonthRow + ', 月数: ' + Object.keys(fullMonthMap).length);

  // ── 全セル数式を取得して壊れたセルを置換 ──
  var formulas = fullPlSh.getRange(1, 1, fullLastRow, fullLastCol).getFormulas();
  var IND_SHEET = "'" + IND_PL_SHEET_NAME + "'";
  var fixCount = 0, skipCount = 0;

  for (var r = 0; r < fullLastRow; r++) {
    var plRow = r + 1;
    var indRow = ROW_MAP[plRow];
    if (indRow === undefined) continue; // 対応行なし → スキップ

    for (var c = 0; c < fullLastCol; c++) {
      var f = formulas[r][c];
      if (!f || f.indexOf("'PL(個社別)'") < 0) continue;

      // 月マッチング
      var plCol = c + 1;
      var monthStr = fullMonthMap[plCol];
      var indCol = monthStr ? indMonthMap[monthStr] : null;

      if (!indCol) {
        // 対応月がない（PL（個社別）に存在しない古い月など）→ 空白に
        fullPlSh.getRange(r + 1, c + 1).setFormula('');
        skipCount++;
        continue;
      }

      var newFormula = '=' + IND_SHEET + '!' + colNumToLetter_21_(indCol) + indRow;
      fullPlSh.getRange(r + 1, c + 1).setFormula(newFormula);
      fixCount++;
    }
  }

  Logger.log('rebuildFullPLFormulas 完了: ' + fixCount + ' セル修正, ' + skipCount + ' セルスキップ（対応月なし）');
}

// ─────────────────────────────────────────
// 000. 両シートの構造を出力してマッピングを確認する
// ─────────────────────────────────────────
function analyzeSheetStructures() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var fullPlSh = ss.getSheetByName(FULL_PL_SHEET_NAME);
  var indPlSh  = ss.getSheetByName(IND_PL_SHEET_NAME);
  if (!fullPlSh) { Logger.log('[ERROR] ' + FULL_PL_SHEET_NAME + ' 未検出'); return; }
  if (!indPlSh)  { Logger.log('[ERROR] ' + IND_PL_SHEET_NAME  + ' 未検出'); return; }

  // === PL(全社) の構造 ===
  Logger.log('=== PL(全社) ===');
  Logger.log('行数: ' + fullPlSh.getLastRow() + ', 列数: ' + fullPlSh.getLastColumn());

  // 壊れたセルがある行を抽出 → 行ラベル（A列・B列・C列）を表示
  var fLastRow = fullPlSh.getLastRow();
  var fLastCol = fullPlSh.getLastColumn();
  var fDisplay  = fullPlSh.getRange(1, 1, Math.min(fLastRow, 200), Math.min(fLastCol, 5)).getDisplayValues();
  var fFormulas = fullPlSh.getRange(1, 1, Math.min(fLastRow, 200), fLastCol).getFormulas();
  var brokenRows = {};
  for (var r = 0; r < fFormulas.length; r++) {
    for (var c = 0; c < fFormulas[r].length; c++) {
      var f = fFormulas[r][c];
      if (f && f.indexOf("'PL(個社別)'") >= 0) {
        brokenRows[r] = true;
        break;
      }
    }
  }
  Logger.log('壊れた行: ' + Object.keys(brokenRows).map(function(r){ return parseInt(r)+1; }).join(', '));
  Logger.log('--- 壊れた行のラベル（行番号 | A | B | C | D | E） ---');
  for (var r in brokenRows) {
    var ri = parseInt(r);
    var cols = fDisplay[ri] || [];
    Logger.log('Row' + (ri+1) + ' | ' + cols.slice(0,5).join(' | '));
  }

  // === PL（個社別）の構造 ===
  Logger.log('\n=== PL（個社別）===');
  Logger.log('行数: ' + indPlSh.getLastRow() + ', 列数: ' + indPlSh.getLastColumn());

  // 先頭5列 × 先頭60行を出力
  var iRows = Math.min(indPlSh.getLastRow(), 60);
  var iCols = Math.min(indPlSh.getLastColumn(), 5);
  var iVals = indPlSh.getRange(1, 1, iRows, iCols).getDisplayValues();
  Logger.log('--- 先頭60行（A〜E列）---');
  for (var r = 0; r < iVals.length; r++) {
    var line = iVals[r].join(' | ');
    if (line.trim().replace(/\|/g,'').trim()) Logger.log('Row' + (r+1) + ': ' + line);
  }

  // 月ヘッダー行を探す（数値が並ぶ行 or yyyy/M パターン）
  var iAllVals = indPlSh.getRange(1, 1, iRows, indPlSh.getLastColumn()).getDisplayValues();
  for (var r = 0; r < iAllVals.length; r++) {
    var nonEmpty = iAllVals[r].filter(function(v){ return v && /\d{4}\/\d/.test(v); });
    if (nonEmpty.length >= 3) {
      Logger.log('月ヘッダー候補 Row' + (r+1) + ': ' + iAllVals[r].slice(0,10).join(' | '));
    }
  }
}

// ─────────────────────────────────────────
// 000. シート名の括弧を半角→全角に一括置換して #REF! を修正
//      ='PL(個社別)'!XX → ='PL（個社別）'!XX
// ─────────────────────────────────────────
function fixParenthesisInFormulas() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var fullPlSh = ss.getSheetByName(FULL_PL_SHEET_NAME);
  if (!fullPlSh) { Logger.log('[ERROR] ' + FULL_PL_SHEET_NAME + ' 未検出'); return; }

  var lastRow = fullPlSh.getLastRow();
  var lastCol = fullPlSh.getLastColumn();
  var formulas = fullPlSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var OLD_REF = "'PL(個社別)'";
  var NEW_REF = "'PL（個社別）'";

  var fixCount = 0;
  for (var r = 0; r < lastRow; r++) {
    for (var c = 0; c < lastCol; c++) {
      var f = formulas[r][c];
      if (!f || f.indexOf(OLD_REF) < 0) continue;
      var newF = f.split(OLD_REF).join(NEW_REF);
      fullPlSh.getRange(r + 1, c + 1).setFormula(newF);
      fixCount++;
    }
  }
  Logger.log('fixParenthesisInFormulas 完了: ' + fixCount + ' セル修正');
}

// ─────────────────────────────────────────
// 00. PL(全社) の #REF! セルと数式を全列挙
// ─────────────────────────────────────────
function scanFullPLErrors() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var fullPlSh = ss.getSheetByName(FULL_PL_SHEET_NAME);
  if (!fullPlSh) { Logger.log('[ERROR] ' + FULL_PL_SHEET_NAME + ' 未検出'); return; }

  var lastRow = fullPlSh.getLastRow();
  var lastCol = fullPlSh.getLastColumn();
  Logger.log('PL(全社): ' + lastRow + '行 × ' + lastCol + '列');

  var display  = fullPlSh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var formulas = fullPlSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var count = 0;
  for (var r = 0; r < lastRow; r++) {
    for (var c = 0; c < lastCol; c++) {
      var disp = display[r][c];
      var form = formulas[r][c];
      if (disp === '#REF!' || disp === '#ERROR!' || (form && form.indexOf('#REF') >= 0)) {
        count++;
        Logger.log('Cell ' + colNumToLetter_21_(c+1) + (r+1) +
                   ' | 表示値: ' + disp +
                   ' | 数式: ' + (form || '(なし)').substring(0, 200));
        if (count >= 30) { Logger.log('...以下省略（30件超）'); return; }
      }
    }
  }
  if (count === 0) {
    Logger.log('PL(全社) に #REF! エラーは見つかりませんでした');
    // 数式が入っているセルを最初の10個だけ表示
    var fCount = 0;
    for (var r = 0; r < lastRow; r++) {
      for (var c = 0; c < lastCol; c++) {
        if (formulas[r][c]) {
          Logger.log('数式あり: ' + colNumToLetter_21_(c+1) + (r+1) + ' = ' + formulas[r][c].substring(0, 150));
          fCount++;
          if (fCount >= 10) return;
        }
      }
    }
    if (fCount === 0) Logger.log('PL(全社) に数式が1件もありません（全て手入力値）');
  }
}

// ─────────────────────────────────────────
// 0. シート名一覧を確認（名前が合わない時に使う）
// ─────────────────────────────────────────
function listSheetNames() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  sheets.forEach(function(sh) {
    var name = sh.getName();
    var codes = [];
    for (var i = 0; i < name.length; i++) codes.push(name.charCodeAt(i).toString(16));
    Logger.log('[' + name + '] codes: ' + codes.join(' '));
  });
}

// ─────────────────────────────────────────
// 1. 診断: 壊れたセルの数式・位置を表示
// ─────────────────────────────────────────
function diagnoseFullPL() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var fullPlSh = ss.getSheetByName(FULL_PL_SHEET_NAME);
  var indPlSh  = ss.getSheetByName(IND_PL_SHEET_NAME);

  if (!fullPlSh) { Logger.log('[ERROR] シートが見つかりません: ' + FULL_PL_SHEET_NAME); return; }
  if (!indPlSh)  { Logger.log('[ERROR] シートが見つかりません: ' + IND_PL_SHEET_NAME);  return; }

  var lastRow = fullPlSh.getLastRow();
  var lastCol = fullPlSh.getLastColumn();

  // 各社セクション開始行を先に調べる
  var sectionRows = findSectionStartRows_(indPlSh);
  Logger.log('PL(個社別) セクション開始行: ' + JSON.stringify(sectionRows));

  // 全セルの数式を取得
  var formulas = fullPlSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var brokenCount = 0;
  var report = [];
  for (var r = 0; r < lastRow; r++) {
    for (var c = 0; c < lastCol; c++) {
      var f = formulas[r][c];
      if (!f) continue;
      // 旧タブ名が数式内に含まれているか確認
      var isOld = false;
      for (var oldName in OLD_SHEET_TO_SECTION) {
        if (f.indexOf("'" + oldName + "'") >= 0 || f.indexOf(oldName) >= 0) {
          isOld = true;
          break;
        }
      }
      if (!isOld) continue;
      brokenCount++;
      report.push({
        row: r + 1,
        col: c + 1,
        cell: colNumToLetter_21_(c + 1) + (r + 1),
        formula: f
      });
    }
  }

  Logger.log('── 診断結果 ──');
  Logger.log('壊れたセル数: ' + brokenCount);
  report.forEach(function(item) {
    Logger.log('Cell ' + item.cell + ': ' + item.formula.substring(0, 200));
  });
  Logger.log('── 診断完了 ──');
  return report;
}

// ─────────────────────────────────────────
// 2. 修正: 旧タブ参照 → PL(個社別) 行参照 に置換
// ─────────────────────────────────────────
function fixFullPL() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var fullPlSh = ss.getSheetByName(FULL_PL_SHEET_NAME);
  var indPlSh  = ss.getSheetByName(IND_PL_SHEET_NAME);

  if (!fullPlSh) { Logger.log('[ERROR] ' + FULL_PL_SHEET_NAME + ' 未検出'); return; }
  if (!indPlSh)  { Logger.log('[ERROR] ' + IND_PL_SHEET_NAME  + ' 未検出'); return; }

  // PL(個社別) の各セクション開始行を取得
  var sectionRows = findSectionStartRows_(indPlSh);
  Logger.log('セクション開始行: ' + JSON.stringify(sectionRows));

  // 不足セクションがあれば中断
  var missing = [];
  for (var oldName in OLD_SHEET_TO_SECTION) {
    var secName = OLD_SHEET_TO_SECTION[oldName];
    if (!sectionRows[secName]) missing.push(secName);
  }
  if (missing.length > 0) {
    Logger.log('[ERROR] PL(個社別) に以下のセクションが見つかりません: ' + missing.join(', '));
    return;
  }

  var lastRow = fullPlSh.getLastRow();
  var lastCol = fullPlSh.getLastColumn();
  var formulas = fullPlSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var fixCount = 0;
  var PL_IND_NAME = "'" + IND_PL_SHEET_NAME + "'";

  for (var r = 0; r < lastRow; r++) {
    for (var c = 0; c < lastCol; c++) {
      var f = formulas[r][c];
      if (!f) continue;

      var newFormula = f;
      for (var oldName in OLD_SHEET_TO_SECTION) {
        var secName = OLD_SHEET_TO_SECTION[oldName];
        var secStartRow = sectionRows[secName]; // PL(個社別) 内のセクション先頭行番号

        // 数式内の 'oldName'!Col99 を PL(個社別)!Col(secStartRow + offset - 1) に置換
        // 例: 'cozoru:全社'!E45 → 'PL(個社別)'!E(cozoru_s0 + 45 - 1)
        var pattern = "'" + oldName + "'";
        var idx = newFormula.indexOf(pattern);
        while (idx >= 0) {
          // パターン直後の !ColRow を解析
          var after = newFormula.substring(idx + pattern.length);
          var m = after.match(/^!([A-Z]+)(\d+)/);
          if (m) {
            var colLetter = m[1];
            var rowNum    = parseInt(m[2], 10);
            // rowNum は旧シート内での行番号
            // PL(個社別) での対応行 = secStartRow + (rowNum - 1)
            var newRow = secStartRow + (rowNum - 1);
            var replacement = PL_IND_NAME + '!' + colLetter + newRow;
            newFormula = newFormula.substring(0, idx) + replacement + newFormula.substring(idx + pattern.length + m[0].length);
            idx = newFormula.indexOf(pattern, idx + replacement.length);
          } else {
            break; // パターンマッチ失敗
          }
        }
      }

      if (newFormula !== f) {
        fullPlSh.getRange(r + 1, c + 1).setFormula(newFormula);
        fixCount++;
        Logger.log('Fixed ' + colNumToLetter_21_(c + 1) + (r + 1) + ': ' + newFormula.substring(0, 150));
      }
    }
  }

  Logger.log('fixFullPL 完了: ' + fixCount + ' セル修正');
}

// ─────────────────────────────────────────
// ヘルパー: PL(個社別) の各セクション開始行を返す
//   { 'cozoru': 10, 'ライブナウV': 60, 'Tolance:全社': 120, ... }
// ─────────────────────────────────────────
function findSectionStartRows_(indPlSh) {
  var lastRow = indPlSh.getLastRow();
  // B列にセクション名が入っている
  var bVals = indPlSh.getRange(1, 2, lastRow, 1).getValues();
  var result = {};
  var targetSections = Object.values ? Object.values(OLD_SHEET_TO_SECTION) : ['cozoru', 'ライブナウV', 'Tolance:全社'];

  for (var i = 0; i < bVals.length; i++) {
    var v = String(bVals[i][0] || '').trim();
    if (targetSections.indexOf(v) >= 0 && !result[v]) {
      result[v] = i + 2; // 1-based（セクション見出し行 + 1 = データ開始行）
    }
  }
  return result;
}

// 列番号 → アルファベット（A=1, Z=26, AA=27 ...）
function colNumToLetter_21_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
