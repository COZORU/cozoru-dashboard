// 10_SyncToPL.gs
// PL(個社別)のリーフセルにRAWデータから算出した値を書き込む
//
// 2026-05 更新:
//   - DB_サマリ廃止対応: 対象月はRAW最新月から自動取得
//   - レーベル別セクション対応 (M_レーベル動的)
//   - __default__ フォールバック
//   - 色分け (実績/予測 × 自動/手入力)
//   - マネジメントフィー Tier別 / ダイヤボーナス利率 / CPN利率・単価 / その他報酬 を RAWから算出
//
// 書込み offset:
//   +6/7/8   : 獲得pt Tier1/2/3
//   +10/11/12: 応援ダイヤ Tier1/2/3（既存除外）
//   +14/15/16: マネジメントフィー Tier1/2/3 = 応援ダイヤ(新規+移籍) × (MF率 + 月次ボーナス補正)
//   +18      : ダイヤボーナス利率 (マネジメントフィー合計 ÷ 応援ダイヤ既存除外合計) ※ writeByLabel
//   +24/25/26: C5  イラスト報酬 / 報酬利率 / 報酬単価合計
//   +27/28/29: B2  〃
//   +30/31/32: A   〃
//   +33/34/35: S   〃
//   その他報酬 (writeByLabel)
//   +37+ex/+38+ex: レベシェ 応援/時間
//   ラベル: 登録/アクティブ/デビュー/C5達成率/C5達成数/Tier別アクティブ/時間ダイヤ

var PL_SHEET_NAME = 'PL（個社別）';  // 全角カッコ（実シート名に合わせる）

var COLOR_AUTO_ACTUAL_GAS     = '#e3f2fd'; // RAW集計値（薄青、CSVから直接集計）
var COLOR_AUTO_ACTUAL_FORMULA = '#fff9c4'; // 数式（薄黄、セル参照の四則演算）
var COLOR_AUTO_ACTUAL         = '#e3f2fd'; // 後方互換用エイリアス（RAW集計値=薄青）
var COLOR_IRIAM_ACTUAL        = '#a5d6a7'; // iriam実額（中緑、請求書ベース確定値）
var COLOR_AUTO_FORECAST       = '#f3e5f5'; // 予測×自動算出（薄い紫）
var COLOR_MANUAL_FORECAST     = '#fff8e1'; // 予測×手入力（薄い黄）
var COLOR_DEFAULT             = '#ffffff'; // 実績×手入力（白）
var COLOR_GRAY                = '#cccccc'; // 廃止・未使用行
var COLOR_PENDING_EXTERNAL    = '#ffe0b2'; // 外部連携予定（獲得人数等）

// 全月グレーアウト対象（廃止 or 未使用）ラベル
// ※「単月流出数」はRAW自動算出するので除外
var FORCE_GRAY_LABELS = [
  '24年分流出数', '25年分流出数', '26年分流出数', '27年分流出数', '28年分流出数',
  '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'
];

// 外部スプシから連携予定（獲得人数等）→ 薄いオレンジ
var PENDING_EXTERNAL_LABELS = [
  '獲得人数', '獲得人数（オリエン着座）', '獲得人数（概算）'
];

// 2026-03 以降グレーアウト：B2系（2026-02までで廃止）
var GRAY_B2_AFTER_MONTH = '2026-02';

// セクションヘッダーは A列の「▼ ＜name＞」形式
var PL_SECTIONS_CONSOLIDATED = [
  { officeName: '株式会社cozoru',  sectionHeader: 'cozoru:全社',     extraRows: 0 },
  { officeName: 'ライブナウV',     sectionHeader: 'ライブナウV',     extraRows: 1 },
  { officeName: '株式会社Tolance', sectionHeader: 'Tolance:全社',    extraRows: 1 },
];

// === マスタ読込ヘルパー ===

function loadLabelMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_LABEL || 'M_レーベル');
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var result = {};
  data.forEach(function(r) {
    var office = String(r[0] || '').trim();
    var labelCsv = String(r[1] || '').trim();
    var category = String(r[2] || '').trim();
    if (!office || !labelCsv || !category) return;
    if (!result[office]) result[office] = {};
    result[office][labelCsv] = category;
  });
  return result;
}

function buildLabelSections_(labelMaster) {
  if (!labelMaster) return [];
  var sections = {};
  var defaultCategories = {};
  for (var office in labelMaster) {
    for (var labelCsv in labelMaster[office]) {
      var category = labelMaster[office][labelCsv];
      if (labelCsv === '__default__') { defaultCategories[office] = category; continue; }
      var key = office + '|' + category;
      if (!sections[key]) sections[key] = { officeName: office, sectionHeader: category, labels: [], extraRows: 1, isDefault: false };
      sections[key].labels.push(labelCsv);
    }
  }
  for (var office in defaultCategories) {
    var category = defaultCategories[office];
    var key = office + '|' + category;
    if (sections[key]) sections[key].isDefault = true;
    else sections[key] = { officeName: office, sectionHeader: category, labels: [], extraRows: 1, isDefault: true };
  }
  return Object.keys(sections).map(function(k) { return sections[k]; });
}

function isKnownLabel_(labelMaster, office, labelCsv) {
  if (!labelMaster || !labelMaster[office]) return false;
  return labelMaster[office][labelCsv] !== undefined;
}

// M_事務所: {officeName: {mfTier1, mfTier2, mfTier3, bonusMax, bonusMin}}
function loadOfficeMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  if (!sh || sh.getLastRow() < 2) return {};
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  var result = {};
  data.forEach(function(r) {
    if (!r[0]) return;
    result[r[0]] = {
      mfTier1: Number(r[3]) || 0,
      mfTier2: Number(r[4]) || 0,
      mfTier3: Number(r[5]) || 0,
      bonusMax: Number(r[6]) || 0,
      bonusMin: Number(r[7]) || 0
    };
  });
  return result;
}

// M_月次ボーナス: {ym|officeName: {kind: '基本'|'最高'|'最低', actual: number}}
// D列「iriam実額」を売上書込みに使うため、kind と actual を併せて返す
function loadBonusMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_MONTHLY_BONUS);
  if (!sh || sh.getLastRow() < 2) return {};
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var result = {};
  data.forEach(function(r) {
    if (!r[0] || !r[1]) return;
    var ym = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    result[ym + '|' + r[1]] = {
      kind: String(r[2] || '基本'),
      actual: Number(r[3]) || 0
    };
  });
  return result;
}

// M_CPN: {CPN種別: 単価}
function loadCpnMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_CPN);
  if (!sh || sh.getLastRow() < 2) return {};
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var result = {};
  data.forEach(function(r) {
    if (r[0]) result[r[0]] = Number(r[1]) || 0;
  });
  return result;
}

// Tier小見出し行の合計式構築:
//   R9相当（獲得pt数（Tier別））= Tier1pt + Tier2pt + Tier3pt
//   R13相当（応援ダイヤ Tier別）= Tier1応援ダイヤ + Tier2応援ダイヤ + Tier3応援ダイヤ
//   R17相当（マネジメントフィー）= Tier1MF + Tier2MF + Tier3MF
// kpiRowsのoffset構造: 5=獲得pt見出し,6/7/8=Tier1/2/3pt, 9=応援ダイヤ見出し,10/11/12=Tier1/2/3応援ダイヤ, 13=MF見出し,14/15/16=Tier1/2/3MF
function writeTierSubtotals_(plSh, labelMap, s0, col, colLetter) {
  var rules = [
    { prefix: '獲得pt数（Tier別）', sumOf: [6, 7, 8] },
    { prefix: '応援ダイヤ Tier別', sumOf: [10, 11, 12] },
    { prefix: 'マネジメントフィー（Tier別', sumOf: [14, 15, 16] }
  ];
  var count = 0;
  rules.forEach(function(rule) {
    for (var lbl in labelMap) {
      if (lbl.indexOf('__n_') === 0) continue;
      if (lbl.indexOf(rule.prefix) === 0) {
        var formula = '=' + rule.sumOf.map(function(off) { return colLetter + (s0 + off); }).join('+');
        var cell = plSh.getRange(s0 + labelMap[lbl], col);
        cell.setFormula(formula);
        cell.setBackground(COLOR_AUTO_ACTUAL_FORMULA);
        count++;
        break;
      }
    }
  });
  return count;
}

// レーベル別売上(税抜)の数式構築: =投げ銭報酬 + C5 + B2 + A + S + その他報酬(W) + レベシェ
// 2026-01の検算でW列(デビューイラストCPN)も iriam実額に含まれることが判明したため、Wを含める
function buildLabelRevenueFormula_(labelMap, s0, colLetter) {
  var prefixList = ['投げ銭報酬', 'C5：イラスト報酬', 'B2：イラスト報酬', 'A：Aランク報酬', 'S：Sランク報酬', 'その他報酬', 'レベシェ30'];
  var parts = [];
  prefixList.forEach(function(prefix) {
    for (var lbl in labelMap) {
      if (lbl.indexOf('__n_') === 0) continue;
      if (lbl.indexOf(prefix) === 0) {
        parts.push(colLetter + (s0 + labelMap[lbl]));
        return;
      }
    }
  });
  return parts.length >= 3 ? '=' + parts.join('+') : null;
}

// ラベル正規化: 空白・コロン・%・カッコ以降を除去（あいまい一致用）
function normalizeLabel_(s) {
  return String(s || '')
    .replace(/[\s　]/g, '')
    .replace(/[:：]/g, '')
    .replace(/[％%]/g, '')
    .replace(/[（(].*$/, '');
}

// PL（個社別）のKPIラベルは A列に書かれている（rebuildSummary作成構造）
// オリジナル + 正規化キーの両方を labelMap に登録（厳密一致 → あいまい一致のフォールバック）
function buildLabelMap_(plSh, startRow, maxRows) {
  var result = {};
  var vals = plSh.getRange(startRow, 1, maxRows, 3).getValues();
  vals.forEach(function(row, i) {
    var lbl = (row[0] || row[1] || row[2] || '').toString().trim();
    if (!lbl) return;
    if (result[lbl] === undefined) result[lbl] = i;
    var nlbl = '__n_' + normalizeLabel_(lbl);
    if (nlbl !== '__n_' && result[nlbl] === undefined) result[nlbl] = i;
  });
  return result;
}

// ラベルの N 番目の出現 offset を取得（1-based n）
function findNthOccurrenceOffset_(plSh, startRow, maxRows, label, n) {
  var vals = plSh.getRange(startRow, 1, maxRows, 3).getValues();
  var targetNorm = normalizeLabel_(label);
  var count = 0;
  for (var i = 0; i < vals.length; i++) {
    var lbl = (vals[i][0] || vals[i][1] || vals[i][2] || '').toString().trim();
    if (lbl === label || normalizeLabel_(lbl) === targetNorm) {
      count++;
      if (count === n) return i;
    }
  }
  return -1;
}

// 前月（yyyy-MM）を返す
function getPreviousMonth_(ym) {
  var p = ym.split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return Utilities.formatDate(d, 'JST', 'yyyy-MM');
}

// 月別ピンポイント実行（サーバーエラー回避用）
function syncToPL2026_01() { syncToPL('2026-01'); }
function syncToPL2026_02() { syncToPL('2026-02'); }
function syncToPL2026_03() { syncToPL('2026-03'); }
function syncToPL2026_04() { syncToPL('2026-04'); }

// ─── 全月一括 自動実行（トリガー連鎖、6分制限回避用） ─────────────
// autoSyncAllMonths を1回実行すれば、1分間隔で順次自動処理。約6分で完了。
// 寝る前に実行 → 起きたら完成

function _scheduleNext_(funcName, sec) {
  ScriptApp.newTrigger(funcName).timeBased().after(sec * 1000).create();
}
function _deleteCurrentTrigger_(funcName) {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === funcName) ScriptApp.deleteTrigger(t);
  });
}

function autoSyncAllMonths() {
  try {
    syncToPL2026_01();
    Logger.log('autoSync: 2026-01 完了');
  } catch (e) { Logger.log('autoSync 2026-01 エラー: ' + e.message); }
  _scheduleNext_('autoSyncStep2', 60);
  appendLog_('INFO', '-', '自動同期', '開始: 約6分後に全工程完了予定');
}

function autoSyncStep2() {
  try {
    syncToPL2026_02();
    Logger.log('autoSync: 2026-02 完了');
  } catch (e) { Logger.log('autoSync 2026-02 エラー: ' + e.message); }
  _deleteCurrentTrigger_('autoSyncStep2');
  _scheduleNext_('autoSyncStep3', 60);
}

function autoSyncStep3() {
  try {
    syncToPL2026_03();
    Logger.log('autoSync: 2026-03 完了');
  } catch (e) { Logger.log('autoSync 2026-03 エラー: ' + e.message); }
  _deleteCurrentTrigger_('autoSyncStep3');
  _scheduleNext_('autoSyncStep4', 60);
}

function autoSyncStep4() {
  try {
    syncToPL2026_04();
    Logger.log('autoSync: 2026-04 完了');
  } catch (e) { Logger.log('autoSync 2026-04 エラー: ' + e.message); }
  _deleteCurrentTrigger_('autoSyncStep4');
  _scheduleNext_('autoSyncStep5', 60);
}

function autoSyncStep5() {
  try {
    applyPlBackgrounds();
    Logger.log('autoSync: 色一括適用 完了');
  } catch (e) { Logger.log('autoSync 色適用 エラー: ' + e.message); }
  _deleteCurrentTrigger_('autoSyncStep5');
  _scheduleNext_('autoSyncStep6', 60);
}

function autoSyncStep6() {
  try {
    rewriteLabelRevenueFormulas();
    Logger.log('autoSync: レーベル別売上更新 完了');
    appendLog_('SUCCESS', '-', '自動同期', '全工程完了（全月D列参照+W列含む新式+色付け）');
  } catch (e) {
    Logger.log('autoSync rewriteLabel エラー: ' + e.message);
    appendLog_('ERROR', '-', '自動同期', 'エラー: ' + e.message);
  }
  _deleteCurrentTrigger_('autoSyncStep6');
}

// RAWに存在する全月について syncToPL を実行（過去月の再計算用）
function syncToPLAllMonths() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!rawSh || rawSh.getLastRow() < 2) { Logger.log('syncToPLAllMonths: RAW空'); return; }
  var data = rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues();
  var months = {};
  data.forEach(function(r) {
    if (!r[0]) return;
    var ms = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    months[ms] = true;
  });
  var sortedMonths = Object.keys(months).sort();
  Logger.log('syncToPLAllMonths: 対象月一覧 = ' + sortedMonths.join(', '));
  sortedMonths.forEach(function(ym) {
    Logger.log('\n>>> syncToPL for ' + ym);
    syncToPL(ym);
  });
  // 全月処理後に色を一括適用（緑=iriam実額/黄=数式/青=RAW集計）
  try {
    applyPlBackgrounds();
    Logger.log('\nsyncToPLAllMonths: applyPlBackgrounds 完了');
  } catch (e) {
    Logger.log('\napplyPlBackgrounds エラー: ' + e.message);
  }
  Logger.log('\nsyncToPLAllMonths done: ' + sortedMonths.length + '月分処理完了');
}

function syncToPL(overrideMonth) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh     = ss.getSheetByName(CONFIG.SHEET_RAW);
  var plSh      = ss.getSheetByName(PL_SHEET_NAME);
  var offSh     = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  var profileSh = ss.getSheetByName('_ライバープロファイル');

  if (!rawSh) { Logger.log('syncToPL: RAW_ライバー月次 が見つかりません'); return; }
  if (!plSh)  { Logger.log('syncToPL: ' + PL_SHEET_NAME + ' が見つかりません'); return; }

  var rawLastRow = rawSh.getLastRow();
  if (rawLastRow < 2) { Logger.log('syncToPL: RAWが空です'); return; }
  var rawData = rawSh.getRange(2, 1, rawLastRow - 1, CONFIG.RAW_COLUMNS.length).getValues();

  // 対象月: 引数優先、なければRAW最新月
  var targetMonth;
  if (overrideMonth) {
    targetMonth = overrideMonth;
  } else {
    var rawMonths = {};
    rawData.forEach(function(r) {
      if (!r[0]) return;
      var ms = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
        : String(r[0]).substring(0, 7);
      rawMonths[ms] = true;
    });
    targetMonth = Object.keys(rawMonths).sort().pop();
  }
  if (!targetMonth) { Logger.log('syncToPL: RAWに月データなし'); return; }

  // PLの対象月列
  var plParts   = targetMonth.split('-');
  var plMonthStr = plParts[0] + '/' + parseInt(plParts[1], 10);
  var plMaxCol   = plSh.getLastColumn();
  var row2vals   = plSh.getRange(2, 1, 1, plMaxCol).getValues()[0];
  var targetColIdx = -1;
  for (var ci = 0; ci < row2vals.length; ci++) {
    var cv = row2vals[ci];
    var cvStr = cv instanceof Date
      ? Utilities.formatDate(cv, 'JST', 'yyyy/M')
      : String(cv).trim();
    if (cvStr === plMonthStr) { targetColIdx = ci + 1; break; }
  }
  if (targetColIdx < 0) { Logger.log('syncToPL: PL列が見つかりません: ' + plMonthStr); return; }
  Logger.log('syncToPL: 対象月=' + targetMonth + ', PLの列=' + targetColIdx + '(' + plMonthStr + ')');

  // アクティブ事務所
  var activeOffices = {};
  if (offSh && offSh.getLastRow() >= 2) {
    offSh.getRange(2, 1, offSh.getLastRow() - 1, 3).getValues().forEach(function(r) {
      if (r[0] && (r[2] === true || r[2] === 'TRUE')) activeOffices[r[0]] = true;
    });
  }

  // _ライバープロファイル
  var profileData = [];
  if (profileSh && profileSh.getLastRow() >= 2) {
    profileData = profileSh.getRange(2, 1, profileSh.getLastRow() - 1, 8).getValues();
  }

  // マスタロード
  var labelMaster  = loadLabelMaster_(ss);
  var officeMaster = loadOfficeMaster_(ss);
  var bonusMaster  = loadBonusMaster_(ss);
  var cpnMaster    = loadCpnMaster_(ss);
  var taxRate      = loadTaxRate_();  // M_税率シート（デフォルト 0.10）
  Logger.log('syncToPL: マスタ M_レーベル=' + (labelMaster ? Object.keys(labelMaster).length : 0) +
             ', M_事務所=' + Object.keys(officeMaster).length +
             ', M_月次ボーナス=' + Object.keys(bonusMaster).length +
             ', M_CPN=' + Object.keys(cpnMaster).length +
             ', 税率=' + taxRate);

  var labelSections = buildLabelSections_(labelMaster);
  var allSections = PL_SECTIONS_CONSOLIDATED.map(function(s) {
    return { officeName: s.officeName, sectionHeader: s.sectionHeader, labels: null, extraRows: s.extraRows, isDefault: false };
  }).concat(labelSections);

  var plLastRow = plSh.getLastRow();
  // セクションヘッダーは A列に「▼ ＜name＞」形式で書かれている（rebuildSummaryで作成）
  var plAVals   = plSh.getRange(1, 1, plLastRow, 1).getValues();

  allSections.forEach(function(sec) {
    if (!activeOffices[sec.officeName]) {
      Logger.log('syncToPL: ' + sec.officeName + ' は非アクティブ。スキップ。');
      return;
    }

    // A列で「▼ <sectionHeader>」または「<sectionHeader>」を検索
    var s0 = -1;
    var marker1 = '▼ ' + sec.sectionHeader;
    var marker2 = sec.sectionHeader;
    for (var bi = 0; bi < plAVals.length; bi++) {
      var label = String(plAVals[bi][0] || '').trim();
      if (label === marker1 || label === marker2) { s0 = bi + 2; break; }
    }
    if (s0 < 0) {
      Logger.log('syncToPL: 見出し[' + sec.sectionHeader + ']がPLに見つかりません。スキップ。');
      return;
    }

    var rows = rawData.filter(function(r) {
      var rowMonth = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
        : String(r[0]).substring(0, 7);
      if (rowMonth !== targetMonth) return false;
      if (r[1] !== sec.officeName) return false;
      if (sec.labels === null) return true;
      var label = r[4];
      if (sec.labels.indexOf(label) >= 0) return true;
      if (sec.isDefault && !isKnownLabel_(labelMaster, sec.officeName, label)) return true;
      return false;
    });
    if (rows.length === 0) { Logger.log('syncToPL: ' + sec.sectionHeader + ' データなし。スキップ。'); return; }

    // KPI集計
    var tier1Dia = 0, tier2Dia = 0, tier3Dia = 0;
    var tier1Pt  = 0, tier2Pt  = 0, tier3Pt  = 0;
    var c5Count = 0, c5Reward = 0;
    var b2Count = 0, b2Reward = 0;
    var aCount  = 0, aReward  = 0;
    var sCount  = 0, sReward  = 0;
    var otherReward = 0; // W列 (デビューイラストCPN等)
    var leveOuen = 0, leveJikan = 0;
    var registered = 0, active = 0, debutCount = 0;
    var tier1Active = 0, tier2Active = 0, tier3Active = 0;
    var jikanTotal = 0;

    rows.forEach(function(r) {
      var tier  = Number(r[28]);
      var type  = String(r[27]);
      var ouen  = Number(r[15]);
      var jikan = Number(r[14]);
      var rate  = Number(r[26]);
      var pt    = Number(r[8]);
      var isActive = (r[29] === true || r[29] === 'TRUE');
      var isDebut  = (r[30] === true || r[30] === 'TRUE');

      if (type !== '既存') {
        if      (tier === 1) tier1Dia += ouen;
        else if (tier === 2) tier2Dia += ouen;
        else if (tier === 3) tier3Dia += ouen;
      }
      if      (tier === 1) tier1Pt += pt;
      else if (tier === 2) tier2Pt += pt;
      else if (tier === 3) tier3Pt += pt;

      var c5 = Number(r[19]); var a = Number(r[20]);
      var s  = Number(r[21]); var b2 = Number(r[23]); var w = Number(r[22]);
      if (c5 > 0) c5Count++; c5Reward += c5;
      if (b2 > 0) b2Count++; b2Reward += b2;
      if (a  > 0) aCount++;  aReward  += a;
      if (s  > 0) sCount++;  sReward  += s;
      otherReward += w;

      var shareRate = 1 - rate / 100;
      leveOuen  += ouen  * shareRate;
      leveJikan += jikan * shareRate;
      jikanTotal += jikan;

      // 登録ライバー数: G列(初回配信日時) が空でなく、かつ "未配信" 以外
      // (dev DB_サマリ の COUNTIFS(G:G,"<>未配信") と同じ挙動: 空セルは除外)
      var gVal = String(r[6] || '').trim();
      if (gVal !== '' && gVal !== '未配信') registered++;
      if (isActive) {
        active++;
        if      (tier === 1) tier1Active++;
        else if (tier === 2) tier2Active++;
        else if (tier === 3) tier3Active++;
      }
      if (isDebut) debutCount++;
    });

    // C5達成率
    var c5DebutAchieved = 0, c5DebutTotal = 0;
    profileData.forEach(function(p) {
      if (p[2] !== sec.officeName) return;
      var pDebutMonth = p[4] instanceof Date
        ? Utilities.formatDate(p[4], 'JST', 'yyyy-MM')
        : String(p[4]).substring(0, 7);
      if (pDebutMonth !== targetMonth) return;
      c5DebutTotal++;
      if (p[7] === '達成') c5DebutAchieved++;
    });

    // マネジメントフィー Tier別: 定義書通り「応援ダイヤTier別合計 × (MF率 + 月次補正)」
    // ROUND は writePL でかける（集計後1回ROUND方式）
    var officeInfo = officeMaster[sec.officeName] || { mfTier1: 0, mfTier2: 0, mfTier3: 0, bonusMax: 0, bonusMin: 0 };
    var bonusRec = bonusMaster[targetMonth + '|' + sec.officeName] || {};
    var bonusKind = bonusRec.kind || '基本';
    var bonusActual = bonusRec.actual || 0;  // iriam請求書実額（税込・入金額）
    var bonusCoef = bonusKind === '最高' ? officeInfo.bonusMax
                  : bonusKind === '最低' ? officeInfo.bonusMin : 0;
    var tier1MF = tier1Dia * (officeInfo.mfTier1 + bonusCoef);
    var tier2MF = tier2Dia * (officeInfo.mfTier2 + bonusCoef);
    var tier3MF = tier3Dia * (officeInfo.mfTier3 + bonusCoef);

    // ダイヤボーナス利率
    var totalDiaExisting = tier1Dia + tier2Dia + tier3Dia;
    var diaBonusRate = totalDiaExisting > 0 ? (tier1MF + tier2MF + tier3MF) / totalDiaExisting : 0;

    // CPN 利率 (達成人数÷登録)
    var c5Rate = registered > 0 ? c5Count / registered : 0;
    var b2Rate = registered > 0 ? b2Count / registered : 0;
    var aRate  = registered > 0 ? aCount  / registered : 0;
    var sRate  = registered > 0 ? sCount  / registered : 0;

    // CPN 単価合計
    var c5UnitTotal = c5Count * (cpnMaster['C5'] || 60000);
    var b2UnitTotal = b2Count * (cpnMaster['B2'] || 75000);
    var aUnitTotal  = aCount  * (cpnMaster['A']  || 40000);
    var sUnitTotal  = sCount  * (cpnMaster['S']  || 60000);

    var labelMap = buildLabelMap_(plSh, s0, 100);
    var col = targetColIdx;
    var ex  = sec.extraRows || 0;

    function writePL(offset, value, noRound) {
      var cell = plSh.getRange(s0 + offset, col);
      cell.setValue(noRound ? value : Math.round(value));
      cell.setBackground(COLOR_AUTO_ACTUAL);
    }
    function writeByLabel(label, value, noRound) {
      var off = labelMap[label.trim()];
      if (off === undefined) off = labelMap['__n_' + normalizeLabel_(label)];
      if (off === undefined) {
        Logger.log('syncToPL: Label not found [' + label + '] in ' + sec.sectionHeader);
        return;
      }
      var cell = plSh.getRange(s0 + off, col);
      cell.setValue(noRound ? value : Math.round(value));
      cell.setBackground(COLOR_AUTO_ACTUAL);
    }

    // 書き込み
    // 売上の書込みロジック：
    //  - 親セクション（cozoru:全社/ライブナウV/Tolance:全社）: 売上(税込)=D列実額、売上(税抜)=数式で割算
    //  - レーベル別: 売上(税抜)=数式で内訳合計 (MF+C5+B2+A+S+レベシェ、W除外/旧スプシ式)、売上(税込)=数式で掛算
    var colLetter = colNumToLetter_(col);
    if (sec.labels === null) {
      // 親セクション: 売上(税込) = SUMIFS数式で M_月次ボーナス D列を参照（緑=iriam実額）
      // D列を修正すれば即時反映される
      var mbSheet = "'" + CONFIG.SHEET_M_MONTHLY_BONUS + "'";
      var taxInFormula = '=IFERROR(SUMIFS(' + mbSheet + '!D:D,' +
                         mbSheet + '!A:A,' + colLetter + '$2,' +
                         mbSheet + '!B:B,"' + sec.officeName + '"),0)';
      var taxInCellP = plSh.getRange(s0 + 0, col);
      taxInCellP.setFormula(taxInFormula);
      taxInCellP.setBackground(COLOR_IRIAM_ACTUAL);
      // 売上(税抜) = 売上(税込) / (1+税率)（黄=数式）
      var taxExFormula = '=IFERROR(' + colLetter + (s0 + 0) + '/(1+' + taxRate + '),0)';
      var taxExCell = plSh.getRange(s0 + 1, col);
      taxExCell.setFormula(taxExFormula);
      taxExCell.setBackground(COLOR_AUTO_ACTUAL_FORMULA);
    } else {
      // レーベル別: 売上(税抜)=内訳合計（数式・黄）、売上(税込)=売上(税抜)×(1+税率)（数式・黄）
      var revFormula = buildLabelRevenueFormula_(labelMap, s0, colLetter);
      if (revFormula) {
        var taxExCell2 = plSh.getRange(s0 + 1, col);
        taxExCell2.setFormula(revFormula);
        taxExCell2.setBackground(COLOR_AUTO_ACTUAL_FORMULA);
        var taxInFormula = '=' + colLetter + (s0 + 1) + '*(1+' + taxRate + ')';
        var taxInCell = plSh.getRange(s0 + 0, col);
        taxInCell.setFormula(taxInFormula);
        taxInCell.setBackground(COLOR_AUTO_ACTUAL_FORMULA);
      } else {
        Logger.log('syncToPL: レーベル別売上数式構築失敗 in ' + sec.sectionHeader);
      }
    }

    writePL(6, tier1Pt);
    writePL(7, tier2Pt);
    writePL(8, tier3Pt);
    writePL(10, tier1Dia);
    writePL(11, tier2Dia);
    writePL(12, tier3Dia);
    // ダイヤ行ラベルにnote（新規・移籍のみ集計のため DB_成長予測の月次ダイヤ（全ライバー含む）と差異あり）
    plSh.getRange(s0 + 9, 2).setNote('MF算出ベース（新規・移籍のみ）。既存ライバーは除外。\n※ DB_成長予測の月次ダイヤ（全ライバー含む）より値が少ない。差分＝既存ライバーのダイヤ分（月によって10万前後）。');

    // マネジメントフィー
    writePL(14, tier1MF);
    writePL(15, tier2MF);
    writePL(16, tier3MF);

    // 時間ダイヤ
    writeByLabel('時間ダイヤ', jikanTotal);

    // ダイヤボーナス利率
    writeByLabel('ダイヤボーナス（利率）', diaBonusRate, true);

    // CPN: ラベルプレフィックスマッチで書込み（各社の%表記違いに対応）
    // 4行構造: イラスト報酬 / 達成人数 / 報酬利率 / 報酬単価合計
    function writeByLabelPrefix_(prefix, value, noRound) {
      for (var lbl in labelMap) {
        if (lbl.indexOf(prefix) === 0) {
          var cell = plSh.getRange(s0 + labelMap[lbl], col);
          cell.setValue(noRound ? value : Math.round(value));
          cell.setBackground(COLOR_AUTO_ACTUAL);
          return true;
        }
      }
      return false;
    }
    function writeFormulaByLabelPrefix_(prefix, formula) {
      for (var lbl in labelMap) {
        if (lbl.indexOf(prefix) === 0) {
          var cell = plSh.getRange(s0 + labelMap[lbl], col);
          cell.setFormula(formula);
          cell.setBackground(COLOR_AUTO_ACTUAL);
          return true;
        }
      }
      return false;
    }

    // B2 セクション有無判定（cozoru のみ「B2：イラスト報酬」が存在）
    var hasB2Section = false;
    for (var lbl in labelMap) {
      if (lbl.indexOf('B2：イラスト報酬') === 0) { hasB2Section = true; break; }
    }

    // C5
    writeByLabelPrefix_('C5：イラスト報酬', c5Reward);
    writeByLabelPrefix_('C5：達成人数', c5Count);
    writeByLabelPrefix_('C5：報酬単価', c5UnitTotal);
    // B2 (cozoru のみ)
    if (hasB2Section) {
      writeByLabelPrefix_('B2：イラスト報酬', b2Reward);
      writeByLabelPrefix_('B2：達成人数', b2Count);
      writeByLabelPrefix_('B2：報酬単価', b2UnitTotal);
    }
    // A
    writeByLabelPrefix_('A：Aランク報酬', aReward);
    writeByLabelPrefix_('A：達成人数', aCount);
    writeByLabelPrefix_('A：報酬単価', aUnitTotal);
    // S
    writeByLabelPrefix_('S：Sランク報酬', sReward);
    writeByLabelPrefix_('S：達成人数', sCount);
    writeByLabelPrefix_('S：報酬単価', sUnitTotal);
    // 報酬利率は数式（達成人数 ÷ 登録ライバー数）で書込
    var regOff = labelMap['登録ライバー数'];
    if (regOff === undefined) regOff = labelMap['__n_' + normalizeLabel_('登録ライバー数')];
    if (regOff !== undefined) {
      var regRowLetter = String(s0 + regOff);
      // colLetter は既に上で宣言済み
      var regRef = colLetter + regRowLetter;
      ['C5', 'B2', 'A', 'S'].forEach(function(cat) {
        if (cat === 'B2' && !hasB2Section) return; // B2セクション無し社はスキップ
        for (var lbl in labelMap) {
          if (lbl.indexOf(cat + '：達成人数') === 0) {
            var cntRowLetter = String(s0 + labelMap[lbl]);
            var cntRef = colLetter + cntRowLetter;
            writeFormulaByLabelPrefix_(cat + '：報酬利率',
              '=IFERROR(' + cntRef + '/' + regRef + ',0)');
            break;
          }
        }
      });
    }

    // その他報酬 (cozoru には行が無いのでスキップされる)
    writeByLabel('その他報酬', otherReward);

    // 単月流出数（前月にあって今月にない UserID 数）
    // 前月データがあれば算出可能、なければスキップ
    var prevMonth = getPreviousMonth_(targetMonth);
    var prevRows = rawData.filter(function(r) {
      var rowMonth = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
        : String(r[0]).substring(0, 7);
      if (rowMonth !== prevMonth) return false;
      if (r[1] !== sec.officeName) return false;
      if (sec.labels === null) return true;
      var label = r[4];
      if (sec.labels.indexOf(label) >= 0) return true;
      if (sec.isDefault && !isKnownLabel_(labelMaster, sec.officeName, label)) return true;
      return false;
    });
    if (prevRows.length > 0) {
      var prevUserIds = {};
      prevRows.forEach(function(r) { prevUserIds[r[2]] = true; });
      var currUserIds = {};
      rows.forEach(function(r) { currUserIds[r[2]] = true; });
      var churnCount = 0;
      for (var uid in prevUserIds) if (!currUserIds[uid]) churnCount++;
      // 「単月流出数」の2番目の出現（=実値行、1番目はヘッダ）に書き込み
      var churnOffset = findNthOccurrenceOffset_(plSh, s0, 100, '単月流出数', 2);
      if (churnOffset >= 0) {
        var cell = plSh.getRange(s0 + churnOffset, col);
        cell.setValue(churnCount);
        cell.setBackground(COLOR_AUTO_ACTUAL);
      } else {
        Logger.log('syncToPL: 単月流出数(2番目)行が見つかりません in ' + sec.sectionHeader);
      }
    } else {
      Logger.log('syncToPL: ' + sec.sectionHeader + ' は前月(' + prevMonth + ')データなし → 流出数スキップ');
    }

    // レベシェ: 「レベシェ30％手数料」ラベルの直下2行に動的書込（addCpnRowsの行挿入に追従）
    var leveBaseOff = labelMap['レベシェ30％手数料'];
    if (leveBaseOff === undefined) leveBaseOff = labelMap['__n_' + normalizeLabel_('レベシェ30%手数料')];
    if (leveBaseOff !== undefined) {
      var ouenCell = plSh.getRange(s0 + leveBaseOff + 1, col);
      ouenCell.setValue(Math.round(leveOuen));
      ouenCell.setBackground(COLOR_AUTO_ACTUAL);
      var jikanCell = plSh.getRange(s0 + leveBaseOff + 2, col);
      jikanCell.setValue(Math.round(leveJikan));
      jikanCell.setBackground(COLOR_AUTO_ACTUAL);
    } else {
      Logger.log('syncToPL: レベシェ30％手数料行が見つかりません in ' + sec.sectionHeader);
    }

    // ライバー基盤
    writeByLabel('登録ライバー数', registered);
    writeByLabel('アクティブライバー数', active);
    var debutLbl = labelMap['デビュー数（実数）'] !== undefined ? 'デビュー数（実数）' : 'デビュー数';
    writeByLabel(debutLbl, debutCount);
    writeByLabel('C5達成率（当月デビュー組×30日以内）',
      c5DebutTotal > 0 ? c5DebutAchieved / c5DebutTotal : 0, true);
    writeByLabel('C5達成数（当月デビュー組）', c5DebutAchieved);
    writeByLabel('　Tier1 : アクティブ数', tier1Active);
    writeByLabel('　Tier2 : アクティブ数', tier2Active);
    writeByLabel('　Tier3 : アクティブ数', tier3Active);

    Logger.log('syncToPL: ' + sec.sectionHeader + ' 書込み完了 (' + rows.length + '件, col=' + col + ', bonus=' + bonusKind + ')');
  });

  // ─── 全社合計セクション処理 ───
  // 「▼ 全社合計」の各KPIに、各事務所の同名ラベル位置への足し算式を書込み
  // 利率・平均・率系は合算不可なのでスキップ
  var zenshaS0 = -1;
  for (var bi = 0; bi < plAVals.length; bi++) {
    var lblZ = String(plAVals[bi][0] || '').trim();
    if (lblZ === '▼ 全社合計' || lblZ === '全社合計') { zenshaS0 = bi + 2; break; }
  }
  if (zenshaS0 > 0) {
    var officeS0s = [];
    ['cozoru:全社', 'ライブナウV', 'Tolance:全社'].forEach(function(sh) {
      for (var bi2 = 0; bi2 < plAVals.length; bi2++) {
        var lb = String(plAVals[bi2][0] || '').trim();
        if (lb === '▼ ' + sh || lb === sh) { officeS0s.push(bi2 + 2); return; }
      }
    });
    if (officeS0s.length > 0) {
      var colLZ = colNumToLetter_(targetColIdx);
      var officeLabelMaps = officeS0s.map(function(s0z) { return buildLabelMap_(plSh, s0z, 100); });
      var zenshaLabelMap = buildLabelMap_(plSh, zenshaS0, 100);
      var skipKeywords = ['利率', '平均', '達成率', 'アクティブ率', 'ダイヤボーナス（利率）'];
      var writeCount = 0;
      Object.keys(zenshaLabelMap).forEach(function(lblK) {
        if (lblK.indexOf('__n_') === 0) return;
        // 合算不可なラベル
        var skip = skipKeywords.some(function(kw) { return lblK.indexOf(kw) >= 0; });
        if (skip) return;
        var zenshaOff = zenshaLabelMap[lblK];
        var refParts = [];
        officeLabelMaps.forEach(function(olm, idx) {
          var officeOff = olm[lblK];
          if (officeOff === undefined) officeOff = olm['__n_' + normalizeLabel_(lblK)];
          if (officeOff !== undefined) {
            refParts.push(colLZ + (officeS0s[idx] + officeOff));
          }
        });
        if (refParts.length >= 2) {
          var formula = '=' + refParts.join('+');
          var cell = plSh.getRange(zenshaS0 + zenshaOff, targetColIdx);
          cell.setFormula(formula);
          cell.setBackground(COLOR_AUTO_ACTUAL_FORMULA);  // 黄＝数式
          writeCount++;
        }
      });
      Logger.log('syncToPL: 全社合計セクション 数式書込み ' + writeCount + 'セル');
    }
  }

  Logger.log('syncToPL done: ' + targetMonth);
}

// Tier小見出し行（R9=獲得pt数小計、R13=応援ダイヤ小計、R17=MF小計）の合計式を全月×全セクションで一括書き換え
function rewriteTierSubtotalsAllMonths() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName(PL_SHEET_NAME);
  if (!plSh) { Logger.log('PL シートなし'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();

  // セクション検索
  var plAVals = plSh.getRange(1, 1, lastRow, 1).getValues();
  var sectionRows = [];
  for (var i = 0; i < plAVals.length; i++) {
    var lbl = String(plAVals[i][0] || '').trim();
    if (lbl.indexOf('▼ ') === 0) {
      sectionRows.push({ name: lbl.substring(2).trim(), s0: i + 2 });
    }
  }

  // 月列検出
  var row2 = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < row2.length; c++) {
    var cv = row2[c];
    var isMonth = false;
    if (cv instanceof Date) isMonth = true;
    else if (typeof cv === 'string') {
      if (/^\d{4}-\d{2}$/.test(cv) || /^\d{4}\/\d{1,2}$/.test(cv)) isMonth = true;
    }
    if (isMonth) monthCols.push(c + 1);
  }

  Logger.log('rewriteTierSubtotals: 対象 ' + sectionRows.length + 'セクション × ' + monthCols.length + '月列');

  var totalUpdates = 0;
  sectionRows.forEach(function(sec) {
    var s0 = sec.s0;
    var labelMap = buildLabelMap_(plSh, s0, 100);
    monthCols.forEach(function(col) {
      var colLetter = colNumToLetter_(col);
      var count = writeTierSubtotals_(plSh, labelMap, s0, col, colLetter);
      totalUpdates += count;
    });
  });

  Logger.log('rewriteTierSubtotalsAllMonths done: ' + totalUpdates + 'セル更新（Tier別小計式）');
}

// レーベル別セクションの売上(税込・税抜)を新式（MF+C5+B2+A+S+レベシェ、W除外）に一括書き換え
// 親セクション（全社合計/cozoru:全社/ライブナウV/Tolance:全社）は除外
// 実行後、色も適用
function rewriteLabelRevenueFormulas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName(PL_SHEET_NAME);
  if (!plSh) { Logger.log('PL（個社別） シートなし'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var taxRate = loadTaxRate_();

  // セクションヘッダー検索（A列の「▼ XXX」）
  var plAVals = plSh.getRange(1, 1, lastRow, 1).getValues();
  var sectionRows = [];
  for (var i = 0; i < plAVals.length; i++) {
    var lbl = String(plAVals[i][0] || '').trim();
    if (lbl.indexOf('▼ ') === 0) {
      sectionRows.push({ name: lbl.substring(2).trim(), s0: i + 2 });
    }
  }

  // 親セクション（足し算式で書く対象、または iriam実額で別管理）は除外
  var skipSections = ['全社合計', 'cozoru:全社', 'ライブナウV', 'Tolance:全社'];
  var labelSections = sectionRows.filter(function(s) {
    return skipSections.indexOf(s.name) < 0;
  });
  Logger.log('rewriteLabelRevenue: 対象 ' + labelSections.length + 'セクション = ' + labelSections.map(function(s) { return s.name; }).join(', '));

  // 月列検出（実績月＋予測月、すべて）
  var row2 = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < row2.length; c++) {
    var cv = row2[c];
    var isMonth = false;
    if (cv instanceof Date) isMonth = true;
    else if (typeof cv === 'string') {
      if (/^\d{4}-\d{2}$/.test(cv) || /^\d{4}\/\d{1,2}$/.test(cv)) isMonth = true;
    }
    if (isMonth) monthCols.push(c + 1);
  }
  Logger.log('rewriteLabelRevenue: 月列数 = ' + monthCols.length);

  var totalUpdates = 0;
  labelSections.forEach(function(sec) {
    var s0 = sec.s0;
    var labelMap = buildLabelMap_(plSh, s0, 100);
    var perSecCount = 0;
    monthCols.forEach(function(col) {
      var colLetter = colNumToLetter_(col);
      var revFormula = buildLabelRevenueFormula_(labelMap, s0, colLetter);
      if (!revFormula) return;
      // 売上(税抜) (s0+1)
      var taxExCell = plSh.getRange(s0 + 1, col);
      taxExCell.setFormula(revFormula);
      taxExCell.setBackground(COLOR_AUTO_ACTUAL_FORMULA);
      // 売上(税込) (s0+0) = 売上(税抜) × (1+税率)
      var taxInCell = plSh.getRange(s0 + 0, col);
      taxInCell.setFormula('=' + colLetter + (s0 + 1) + '*(1+' + taxRate + ')');
      taxInCell.setBackground(COLOR_AUTO_ACTUAL_FORMULA);
      perSecCount++;
      totalUpdates++;
    });
    Logger.log('  ' + sec.name + ': ' + perSecCount + 'ヶ月分更新');
  });

  Logger.log('rewriteLabelRevenueFormulas done: ' + totalUpdates + 'セル更新（売上税込・税抜の両方）');
}

// PL(個社別) 全体に背景色適用
function applyPlBackgrounds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName(PL_SHEET_NAME);
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!plSh || !rawSh) { Logger.log('applyPlBackgrounds: シートなし'); return; }

  var rawLastRow = rawSh.getLastRow();
  if (rawLastRow < 2) { Logger.log('applyPlBackgrounds: RAW空'); return; }
  var rawMonths = {};
  rawSh.getRange(2, 1, rawLastRow - 1, 1).getValues().forEach(function(r) {
    if (!r[0]) return;
    var ms = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    rawMonths[ms] = true;
  });
  var latestActualMonth = Object.keys(rawMonths).sort().pop();
  if (!latestActualMonth) { Logger.log('applyPlBackgrounds: 月なし'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  if (lastRow < 3 || lastCol < 1) return;

  // 既知の自動算出行マップ
  var labelMaster = loadLabelMaster_(ss);
  var labelSections = buildLabelSections_(labelMaster);
  var allSections = PL_SECTIONS_CONSOLIDATED.map(function(s) {
    return { officeName: s.officeName, sectionHeader: s.sectionHeader, extraRows: s.extraRows };
  }).concat(labelSections);

  var plBVals = plSh.getRange(1, 2, lastRow, 1).getValues();
  var knownAutoRows = {};
  allSections.forEach(function(sec) {
    var s0 = -1;
    for (var bi = 0; bi < plBVals.length; bi++) {
      if (plBVals[bi][0] === sec.sectionHeader) { s0 = bi + 2; break; }
    }
    if (s0 < 0) return;
    var ex = sec.extraRows || 0;
    [6,7,8,10,11,12,14,15,16,24,25,26,27,28,29,30,31,32,33,34,35,37+ex,38+ex].forEach(function(o) {
      knownAutoRows[s0 + o] = true;
    });
    var lblMap = buildLabelMap_(plSh, s0, 100);
    ['登録ライバー数','アクティブライバー数','デビュー数','デビュー数（実数）',
     'C5達成率（当月デビュー組×30日以内）','C5達成数（当月デビュー組）',
     '　Tier1 : アクティブ数','　Tier2 : アクティブ数','　Tier3 : アクティブ数',
     '時間ダイヤ','ダイヤボーナス（利率）','その他報酬'
    ].forEach(function(lbl) {
      var off = lblMap[lbl.trim()];
      if (off !== undefined) knownAutoRows[s0 + off] = true;
    });
    // CPN系 (プレフィックスマッチ)
    var cpnPrefixes = ['C5：イラスト報酬','C5：達成人数','C5：報酬利率','C5：報酬単価',
                       'B2：イラスト報酬','B2：達成人数','B2：報酬利率','B2：報酬単価',
                       'A：Aランク報酬','A：達成人数','A：報酬利率','A：報酬単価',
                       'S：Sランク報酬','S：達成人数','S：報酬利率','S：報酬単価'];
    cpnPrefixes.forEach(function(pfx) {
      for (var lbl in lblMap) {
        if (lbl.indexOf(pfx) === 0) { knownAutoRows[s0 + lblMap[lbl]] = true; break; }
      }
    });
    // 単月流出数の2番目の出現も自動算出行
    var churnOff = findNthOccurrenceOffset_(plSh, s0, 100, '単月流出数', 2);
    if (churnOff >= 0) knownAutoRows[s0 + churnOff] = true;
  });

  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var colTypes = [];
  var colMonths = []; // 各列の月文字列 (yyyy-MM)
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var monthStr = null;
    if (v instanceof Date) {
      monthStr = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    } else if (typeof v === 'string') {
      var m = v.match(/^(\d{4})\/(\d{1,2})$/);
      if (m) monthStr = m[1] + '-' + ('0' + m[2]).slice(-2);
    }
    colMonths.push(monthStr);
    if (monthStr) colTypes.push(monthStr <= latestActualMonth ? 'actual' : 'forecast');
    else colTypes.push(null);
  }

  // 行ラベル全件取得（強制グレー判定用、B列とC列の両方）
  var allRowLabels = plSh.getRange(1, 2, lastRow, 2).getValues();

  var startRow = 3;
  var numRows = lastRow - startRow + 1;
  var range = plSh.getRange(startRow, 1, numRows, lastCol);
  var formulas = range.getFormulas();
  var values = range.getValues();
  var existingBgs = range.getBackgrounds();

  var newBgs = [];
  for (var r = 0; r < numRows; r++) {
    var rowNum = startRow + r;
    // B列優先、なければC列のラベルを使う（PL構造上、サブ項目はC列）
    var bLabel = String(allRowLabels[rowNum - 1][0] || '').trim();
    var cLabel = String(allRowLabels[rowNum - 1][1] || '').trim();
    var rowLabel = bLabel || cLabel;
    var forceGrayAll = FORCE_GRAY_LABELS.indexOf(rowLabel) >= 0;
    var isPendingExternal = PENDING_EXTERNAL_LABELS.indexOf(rowLabel) >= 0;
    // B2系（廃止）: B列またはC列が「B2：」始まり
    var isB2Row = bLabel.indexOf('B2：') === 0 || cLabel.indexOf('B2：') === 0;

    var row = [];
    for (var c = 0; c < lastCol; c++) {
      var colType = colTypes[c];
      if (!colType) { row.push(existingBgs[r][c]); continue; }
      var monthStr = colMonths[c];

      // 強制色判定（最優先）
      if (forceGrayAll) { row.push(COLOR_GRAY); continue; }
      if (isPendingExternal) { row.push(COLOR_PENDING_EXTERNAL); continue; }
      if (isB2Row && monthStr > GRAY_B2_AFTER_MONTH) { row.push(COLOR_GRAY); continue; }

      var hasFormula = formulas[r][c] && formulas[r][c].length > 0;
      var hasValue = values[r][c] !== '' && values[r][c] !== null && values[r][c] !== undefined;
      var existingBg = String(existingBgs[r][c] || '').toLowerCase();
      var isKnownAutoRow = knownAutoRows[rowNum] === true;

      var color;
      if (colType === 'actual') {
        // iriam実額（緑）は最優先で維持
        if (hasValue && existingBg === COLOR_IRIAM_ACTUAL.toLowerCase()) color = COLOR_IRIAM_ACTUAL;
        else if (hasFormula) color = COLOR_AUTO_ACTUAL_FORMULA;  // 数式 = 薄い黄
        else if (isKnownAutoRow && hasValue) color = COLOR_AUTO_ACTUAL_GAS; // RAW集計値 = 薄い青
        else if (hasValue && existingBg === COLOR_AUTO_ACTUAL_GAS) color = COLOR_AUTO_ACTUAL_GAS;
        else if (hasValue && existingBg === COLOR_AUTO_ACTUAL_FORMULA) color = COLOR_AUTO_ACTUAL_FORMULA;
        else color = COLOR_DEFAULT;
      } else {
        if (hasFormula) color = COLOR_AUTO_FORECAST;
        else if (hasValue) color = COLOR_MANUAL_FORECAST;
        else color = COLOR_DEFAULT;
      }
      row.push(color);
    }
    newBgs.push(row);
  }
  range.setBackgrounds(newBgs);
  Logger.log('applyPlBackgrounds done: 最新実績月=' + latestActualMonth);
}

// 予測月のセルに「直近3ヶ月平均」系の数式を自動入力
//   デビュー数         = AVERAGE(直近3ヶ月)
//   アクティブ平均金額 = AVERAGE(直近3ヶ月)
//   ダイヤボーナス利率 = SUM(直近3ヶ月MF) / SUM(直近3ヶ月応援ダイヤ)
function applyForecastFormulas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName(PL_SHEET_NAME);
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!plSh || !rawSh) { Logger.log('applyForecastFormulas: シートなし'); return; }

  // 最新実績月
  var rawMonths = {};
  rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
    if (!r[0]) return;
    var ms = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    rawMonths[ms] = true;
  });
  var latestActualMonth = Object.keys(rawMonths).sort().pop();
  if (!latestActualMonth) { Logger.log('applyForecastFormulas: 月なし'); return; }

  // 月ラベル→列番号マップ
  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var forecastCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string') {
      var m = v.match(/^(\d{4})\/(\d{1,2})$/);
      if (m) ms = m[1] + '-' + ('0' + m[2]).slice(-2);
    }
    if (ms && ms > latestActualMonth) forecastCols.push(c + 1); // 1-based
  }
  Logger.log('applyForecastFormulas: 予測月列=' + forecastCols.join(','));

  // 全セクション
  var labelMaster = loadLabelMaster_(ss);
  var labelSections = buildLabelSections_(labelMaster);
  var allSections = PL_SECTIONS_CONSOLIDATED.map(function(s) {
    return { sectionHeader: s.sectionHeader };
  }).concat(labelSections.map(function(s) { return { sectionHeader: s.sectionHeader }; }));

  var plLastRow = plSh.getLastRow();
  var plBVals = plSh.getRange(1, 2, plLastRow, 1).getValues();

  var writeCount = 0;
  allSections.forEach(function(sec) {
    var s0 = -1;
    for (var bi = 0; bi < plBVals.length; bi++) {
      if (plBVals[bi][0] === sec.sectionHeader) { s0 = bi + 2; break; }
    }
    if (s0 < 0) return;
    var lblMap = buildLabelMap_(plSh, s0, 100);

    var debutLbl = lblMap['デビュー数（実数）'] !== undefined ? 'デビュー数（実数）' : 'デビュー数';
    var debutOff = lblMap[debutLbl];
    var actAvgOff = lblMap['アクティブ平均金額'];
    var rateOff = lblMap['ダイヤボーナス（利率）'];
    var mfOff = lblMap['マネジメントフィー'];
    var ouenOff = lblMap['応援ダイヤ'];

    forecastCols.forEach(function(col) {
      var leftCol = col - 3, rightCol = col - 1;
      if (leftCol < 1) return;
      var leftL = colNumToLetter_(leftCol), rightL = colNumToLetter_(rightCol);

      // デビュー数: AVERAGE(直近3ヶ月)
      if (debutOff !== undefined) {
        var row = s0 + debutOff;
        var formula = '=AVERAGE(' + leftL + row + ':' + rightL + row + ')';
        plSh.getRange(row, col).setFormula(formula);
        writeCount++;
      }
      // アクティブ平均金額: AVERAGE(直近3ヶ月)
      if (actAvgOff !== undefined) {
        var row = s0 + actAvgOff;
        var formula = '=AVERAGE(' + leftL + row + ':' + rightL + row + ')';
        plSh.getRange(row, col).setFormula(formula);
        writeCount++;
      }
      // ダイヤボーナス利率: SUM(MF直近3ヶ月) / SUM(応援ダイヤ直近3ヶ月)
      if (rateOff !== undefined && mfOff !== undefined && ouenOff !== undefined) {
        var rateRow = s0 + rateOff;
        var mfRow = s0 + mfOff;
        var ouenRow = s0 + ouenOff;
        var formula = '=IFERROR(SUM(' + leftL + mfRow + ':' + rightL + mfRow + ')/SUM(' + leftL + ouenRow + ':' + rightL + ouenRow + '),0)';
        plSh.getRange(rateRow, col).setFormula(formula);
        writeCount++;
      }
    });
  });
  Logger.log('applyForecastFormulas done: ' + writeCount + 'セル更新');
}

// 全PLセクションにCPN関連の不足行を自動挿入
//   C5/B2 : イラスト報酬 → 達成人数(新規) → 報酬利率(既存) → 報酬単価
//   A/S   : Xランク報酬 → 達成人数(既存) → 報酬利率(新規) → 報酬単価
// セクション順は下から処理してrow番号ずれを防ぐ
function addCpnRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName(PL_SHEET_NAME);
  if (!plSh) { Logger.log('addCpnRows: PLなし'); return; }

  var labelMaster = loadLabelMaster_(ss);
  var labelSections = buildLabelSections_(labelMaster);
  var allSections = PL_SECTIONS_CONSOLIDATED.map(function(s) {
    return { sectionHeader: s.sectionHeader };
  }).concat(labelSections.map(function(s) { return { sectionHeader: s.sectionHeader }; }));

  // 各セクションのs0 と endRow（次のセクション開始-1）を取得
  var plBVals = plSh.getRange(1, 2, plSh.getLastRow(), 1).getValues();
  var sectionStarts = [];
  allSections.forEach(function(sec) {
    for (var bi = 0; bi < plBVals.length; bi++) {
      if (plBVals[bi][0] === sec.sectionHeader) {
        sectionStarts.push({ header: sec.sectionHeader, s0: bi + 2 });
        break;
      }
    }
  });
  sectionStarts.sort(function(a, b) { return a.s0 - b.s0; }); // 上から
  for (var i = 0; i < sectionStarts.length; i++) {
    sectionStarts[i].endRow = (i + 1 < sectionStarts.length) ? sectionStarts[i + 1].s0 - 1 : plSh.getLastRow();
  }
  sectionStarts.sort(function(a, b) { return b.s0 - a.s0; }); // 下から処理
  Logger.log('addCpnRows: ' + sectionStarts.length + 'セクション処理');

  sectionStarts.forEach(function(sec) {
    addCpnRowsForSection_(plSh, sec.s0, sec.endRow, sec.header);
  });
  Logger.log('addCpnRows done');
}

function addCpnRowsForSection_(plSh, s0, endRow, sectionHeader) {
  // セクション境界を厳密に守る（次セクション開始の手前まで）
  var maxRows = endRow - s0 + 1;

  function findOffsetByPrefix_(prefix) {
    var vals = plSh.getRange(s0, 2, maxRows, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      var lbl = (vals[i][0] || vals[i][1] || '').toString().trim();
      if (lbl.indexOf(prefix) === 0) return i;
    }
    return -1;
  }
  function existsLabel_(prefix) {
    return findOffsetByPrefix_(prefix) >= 0;
  }
  function insertAfterPrefix_(prefix, newLabel) {
    var off = findOffsetByPrefix_(prefix);
    if (off < 0) return;
    var insertAtRow = s0 + off + 1;
    plSh.insertRowAfter(s0 + off);
    plSh.getRange(insertAtRow, 3).setValue(newLabel);
    Logger.log('  [' + sectionHeader + '] row ' + insertAtRow + ' (after) に「' + newLabel + '」挿入');
  }
  function insertBeforePrefix_(prefix, newLabel) {
    var off = findOffsetByPrefix_(prefix);
    if (off < 0) return;
    var insertAtRow = s0 + off;
    plSh.insertRowBefore(s0 + off);
    plSh.getRange(insertAtRow, 3).setValue(newLabel);
    Logger.log('  [' + sectionHeader + '] row ' + insertAtRow + ' (before) に「' + newLabel + '」挿入');
  }

  var rates = { 'C5': '55%', 'B2': '35%', 'A': '5%', 'S': '3%' };
  // 各カテゴリの主要ラベル（これが存在するセクションのみ 4行構造を目指す）
  var mainLabels = {
    'C5': 'C5：イラスト報酬',
    'B2': 'B2：イラスト報酬',
    'A':  'A：Aランク報酬',
    'S':  'S：Sランク報酬'
  };

  // 下から処理: S → A → B2 → C5
  ['S', 'A', 'B2', 'C5'].forEach(function(cat) {
    // 主要ラベルが無いセクションは触らない（廃止 or 該当なし）
    if (!existsLabel_(mainLabels[cat])) return;

    var hasCount = existsLabel_(cat + '：達成人数');
    var hasRate = existsLabel_(cat + '：報酬利率');
    var rateLabel = cat + '：報酬利率（利率：' + rates[cat] + '）';

    if (hasCount && hasRate) return;
    if (!hasCount && hasRate) {
      insertBeforePrefix_(cat + '：報酬利率', cat + '：達成人数');
    } else if (hasCount && !hasRate) {
      insertAfterPrefix_(cat + '：達成人数', rateLabel);
    }
  });
}

function colNumToLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// PL(個社別) の予測月数式を右に N ヶ月分延長
function extendForecastFormulas(addMonths) {
  addMonths = addMonths || 12;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PL_SHEET_NAME);
  if (!sh) { Logger.log('extendForecastFormulas: PL(個社別) なし'); return; }
  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  var monthRow = sh.getRange(2, 1, 1, lastCol).getValues()[0];

  var lastMonthCol = -1;
  var lastMonthDate = null;
  for (var c = lastCol - 1; c >= 0; c--) {
    var v = monthRow[c];
    if (v instanceof Date) { lastMonthCol = c + 1; lastMonthDate = v; break; }
    if (typeof v === 'string') {
      var m = v.match(/^(\d{4})\/(\d{1,2})$/);
      if (m) { lastMonthCol = c + 1; lastMonthDate = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, 1); break; }
    }
  }
  if (lastMonthCol < 0) { Logger.log('extendForecastFormulas: 月ラベルが見つかりません'); return; }
  Logger.log('extendForecastFormulas: 最終月列=' + lastMonthCol + ', 月=' + Utilities.formatDate(lastMonthDate, 'JST', 'yyyy/M'));

  var newLabels = [];
  for (var i = 1; i <= addMonths; i++) {
    var d = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + i, 1);
    newLabels.push(Utilities.formatDate(d, 'JST', 'yyyy/M'));
  }
  var newColStart = lastMonthCol + 1;
  sh.getRange(2, newColStart, 1, addMonths).setValues([newLabels]);

  var sourceRange = sh.getRange(3, lastMonthCol, lastRow - 2, 1);
  for (var i = 1; i <= addMonths; i++) {
    var destRange = sh.getRange(3, lastMonthCol + i, lastRow - 2, 1);
    sourceRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  }
  Logger.log('extendForecastFormulas done: ' + addMonths + 'ヶ月延長 (col ' + newColStart + '〜' + (newColStart + addMonths - 1) + ')');
}
