// 20_WebApp.gs
// GAS Web App エンドポイント
//   doGet  → ダッシュボードデータを JSON 配信
//   doPost → CSV テキストを受け取り RAW に書き込み
//
// デプロイ設定: 「ウェブアプリ」/ アクセス「全員」/ 実行「自分」

function doGet(e) {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    var action = (e && e.parameter && e.parameter.action) || 'all';
    var month  = (e && e.parameter && e.parameter.month)  || '';
    var result = {};

    if (action === 'all' || action === 'summary') {
      result.summary = buildSummaryJson_(month);
    }
    if (action === 'all' || action === 'livers') {
      result.livers  = buildLiversJson_(month);
    }
    if (action === 'all' || action === 'debut') {
      result.debut   = buildDebutJson_();
    }
    if (action === 'fullpl') {
      result.fullpl  = buildFullPLJson_(month);
    }
    if (action === 'debug') {
      result.debug = debugDashboard_();
    }
    // syncToPL 単独実行（rebuildAll の他関数を経由しない）
    if (action === 'runsync') {
      try {
        syncToPL();
        result.runsync = { ok: true, message: 'syncToPL 完了' };
      } catch (e) {
        result.runsync = { ok: false, error: e.message, stack: String(e.stack || '').substring(0, 500) };
      }
    }
    // 取込ログ（直近30行）取得
    if (action === 'logs') {
      result.logs = readRecentLogs_();
    }
    if (action === 'banners') {
      result.banners = buildBannersJson_(
        (e && e.parameter && e.parameter.base) || '',
        (e && e.parameter && e.parameter.basem) || ''
      );
    }

    out.setContent(JSON.stringify({ status: 'ok', data: result }));
  } catch (err) {
    out.setContent(JSON.stringify({ status: 'error', message: err.message }));
  }
  return out;
}

function doPost(e) {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    var payload = JSON.parse(e.postData.contents);
    // payload: { office, targetMonth, csvText }
    var rows    = parseCsv(payload.csvText);         // 既存 04_CsvParser.gs
    var joined  = joinByUserId(rows, []);            // invoice なしで streaming のみ
    var count   = upsertRawRows(joined, payload.targetMonth, payload.office, 'web-upload');
    rebuildDebutManagement();
    rebuildLiverMonthly();
    out.setContent(JSON.stringify({ status: 'ok', count: count }));
  } catch (err) {
    out.setContent(JSON.stringify({ status: 'error', message: err.message }));
  }
  return out;
}

// ──────────────────────────────────────────────────────────
// 内部集計関数
// ──────────────────────────────────────────────────────────

// PL（個社別）シートから行番号ベースで読み込む（ラベル名変更に強い方式）
function buildSummaryJson_(filterMonth) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sumSh = ss.getSheetByName(CONFIG.SHEET_DB_SUMMARY); // 'PL（個社別）'
  if (!sumSh || sumSh.getLastRow() < 3) return {};

  // Row 2: 月ヘッダー → month→列番号(1-based) マップ
  var lastCol    = sumSh.getLastColumn();
  var headerVals = sumSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthColMap = {};
  headerVals.forEach(function(h, i) {
    var m = (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM')
                                : String(h || '').trim().substring(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) monthColMap[m] = i + 1;
  });

  // RAW から実データ月を取得（予測月を除外）
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var rawMonthSet = {};
  if (rawSh && rawSh.getLastRow() >= 2) {
    rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      var m = toYM_(r[0]);
      if (m) rawMonthSet[m] = true;
    });
  }
  var months = Object.keys(monthColMap).filter(function(m) { return rawMonthSet[m]; }).sort();
  var latest = (filterMonth && months.indexOf(filterMonth) >= 0) ? filterMonth : months[months.length - 1];

  // 全データを一括読み込み
  var lastRow = sumSh.getLastRow();
  var allData = sumSh.getRange(1, 1, lastRow, lastCol).getValues();

  // セクションヘッダー行を検索（'▼ セクション名' 形式）
  var sectionRow = {}; // sectionName → 1-based row number
  allData.forEach(function(row, ri) {
    var lbl = String(row[0] || '').trim();
    if (lbl.indexOf('▼ ') === 0) sectionRow[lbl.substring(2).trim()] = ri + 1;
  });

  // KPI のセクションヘッダー行からのオフセット（PL（個社別）構造に基づく）
  // 全社合計セクション header=row3, 売上（税込）=row4 → offset=1
  var OFF = {
    revTaxIn:   1,   // 売上（税込）
    revTaxEx:   2,   // 売上（税抜）
    dia:        3,   // 総応援ダイヤ数
    mf:         5,   // 投げ銭報酬
    cpnC5:      25,  // C5 報酬合計
    c5Count:    26,  // C5 達成人数（PL個社別から直接）
    cpnB2:      29,  // B2 報酬合計
    cpnA:       33,  // A 報酬合計
    cpnS:       37,  // S 報酬合計
    cpnOther:   41,  // その他報酬
    leveshe:    42,  // レベシェア
    registered: 45,  // 登録ライバー数
    active:     46,  // アクティブライバー数
    t1:         47,  // Tier1アクティブ
    t2:         48,  // Tier2アクティブ
    t3:         49,  // Tier3アクティブ
    debut:      51   // デビュー数
  };

  function getCell(secName, offKey, month) {
    var sr  = sectionRow[secName]; if (!sr) return 0;
    var col = monthColMap[month];  if (!col) return 0;
    var rowData = allData[sr + OFF[offKey] - 1];
    return rowData ? (Number(rowData[col - 1]) || 0) : 0;
  }

  function snap(secName, month) {
    var r = {};
    Object.keys(OFF).forEach(function(k) { r[k] = getCell(secName, k, month); });
    return r;
  }

  var cur     = snap('全社合計', latest);
  var prevIdx = months.indexOf(latest) - 1;
  var prevM   = prevIdx >= 0 ? months[prevIdx] : '';
  var prev    = prevM ? snap('全社合計', prevM) : {};

  function pct(a, b) { return b > 0 ? Math.round((a - b) / b * 100) : null; }

  var OFFICE_SECS = ['全社合計', 'cozoru:全社', 'ライブナウV', 'Tolance:全社'];
  var officeSummary = {};
  OFFICE_SECS.forEach(function(s) { officeSummary[s] = snap(s, latest); });

  var trend = months.map(function(m) {
    var s = snap('全社合計', m);
    return { month: m, revTaxIn: s.revTaxIn, dia: s.dia, active: s.active, debut: s.debut, c5Count: s.c5Count };
  });

  // PL(全社) から計画値を読み込み（実績月＋予測月、PL Row 4 に値があるすべての月）
  var revPlan = [];
  var plSh = ss.getSheetByName('PL(全社)');
  if (plSh && plSh.getLastRow() >= 4) {
    var plLastCol = plSh.getLastColumn();
    var plHdrRow  = plSh.getRange(2, 1, 1, plLastCol).getValues()[0];
    var plMonthColMap = {};
    plHdrRow.forEach(function(h, i) {
      var m = (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM')
                                  : String(h || '').trim().substring(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) plMonthColMap[m] = i + 1;
    });
    var plData = plSh.getRange(1, 1, Math.min(plSh.getLastRow(), 5), plLastCol).getValues();
    // PL(全社) Row 4 に値がある月を全て返却（実績月+予測月で表示するため）
    Object.keys(plMonthColMap).sort().forEach(function(m) {
      var col = plMonthColMap[m];
      var planVal = Number(plData[3][col - 1]) || 0;
      if (planVal > 0) revPlan.push({ month: m, revTaxEx: planVal });
    });
  }

  // DB_成長予測 から4指標の予測系列（rows 2-5）
  var diaForecast = [], activeForecast = [], debutForecast = [], revForecast = [];
  var fcSh = ss.getSheetByName(CONFIG.SHEET_DB_GROWTH_FORECAST);
  if (fcSh && fcSh.getLastRow() >= 5) {
    var fcLastCol   = fcSh.getLastColumn();
    var fcHdr       = fcSh.getRange(1, 2, 1, fcLastCol - 1).getValues()[0];
    var fcDiaRow    = fcSh.getRange(2, 2, 1, fcLastCol - 1).getValues()[0];
    var fcActiveRow = fcSh.getRange(3, 2, 1, fcLastCol - 1).getValues()[0];
    var fcDebutRow  = fcSh.getRange(4, 2, 1, fcLastCol - 1).getValues()[0];
    var fcRevRow    = fcSh.getRange(5, 2, 1, fcLastCol - 1).getValues()[0];
    var fcCount = 0, pastLatest = false;
    fcHdr.forEach(function(h, i) {
      var m = (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM')
                                  : String(h || '').substring(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return;
      if (m === latest) { pastLatest = true; return; }
      if (pastLatest && fcCount < 3) {
        diaForecast.push(   { month: m, dia:      Number(fcDiaRow[i])    || 0 });
        activeForecast.push({ month: m, active:   Number(fcActiveRow[i]) || 0 });
        debutForecast.push( { month: m, debut:    Number(fcDebutRow[i])  || 0 });
        revForecast.push(   { month: m, revTaxIn: Number(fcRevRow[i])    || 0 });
        fcCount++;
      }
    });
  }

  var cpnCur  = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0);
  var cpnPrev = (prev.cpnC5||0)+(prev.cpnB2||0)+(prev.cpnA||0)+(prev.cpnS||0)+(prev.cpnOther||0);

  return {
    latestMonth    : latest,
    months         : months,
    current        : cur,
    prevMonth      : prev,
    pctRevenue     : pct(cur.revTaxIn, prev.revTaxIn),
    pctRevTaxEx    : pct(cur.revTaxEx, prev.revTaxEx),
    pctMf          : pct(cur.mf,       prev.mf),
    pctCpnTotal    : pct(cpnCur, cpnPrev),
    pctLeveshe     : pct(cur.leveshe,  prev.leveshe),
    pctDia         : pct(cur.dia,      prev.dia),
    pctDebut       : pct(cur.debut,    prev.debut),
    trend          : trend,
    revPlan        : revPlan,
    revForecast    : revForecast,
    diaForecast    : diaForecast,
    activeForecast : activeForecast,
    debutForecast  : debutForecast,
    officeSummary  : officeSummary,
    growthBonus    : (function() { try { return buildGrowthBonusJson_(); } catch(e) { return { offices: [], error: e.message }; } })()
  };
}

// PL(全社) から全社集計PL（総ダッシュボード用・年別集計）
function buildFullPLJson_() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(全社)');
  if (!plSh) return {};

  // RAW から実データ月を取得（予測月を除外）
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var rawMonthSet = {};
  if (rawSh && rawSh.getLastRow() >= 2) {
    rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      var m = toYM_(r[0]); if (m) rawMonthSet[m] = true;
    });
  }

  // PL(全社) row 2 から 月→列番号 マップ（全月：実績＋予測）
  var plLastCol = plSh.getLastColumn();
  var plHdrRow  = plSh.getRange(2, 1, 1, plLastCol).getValues()[0];
  var monthColMap = {};
  plHdrRow.forEach(function(h, i) {
    var m = (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM')
                                : String(h || '').trim().substring(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) monthColMap[m] = i + 1;
  });

  var months = Object.keys(monthColMap).sort();
  if (months.length === 0) return {};

  // 預金残高ブロックは行挿入でシート下部（350行超）へ下がるため、余裕を持って読む
  var readRows = Math.min(plSh.getLastRow(), 500);
  var allData  = plSh.getRange(1, 1, readRows, plLastCol).getValues();

  function getCell(row1, month) {
    var col = monthColMap[month];
    if (!col || !row1 || !allData[row1 - 1]) return 0;
    return Number(allData[row1 - 1][col - 1]) || 0;
  }

  // ── 下部ブロック（事業利益〜預金残高）は「項目名」で行を特定（行挿入に強い方式）──
  // 固定行番号だとシートに行が挿入されるとズレる。ラベルから都度行を解決する。
  // 全角/半角カッコ・角カッコ・空白の差を吸収して照合。見つからない場合は現行の正しい行へフォールバック。
  function _normLbl_(s) {
    return String(s == null ? '' : s)
      .replace(/[\s　]/g, '')
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/［/g, '[').replace(/］/g, ']');
  }
  function _rowOf_(colIdx, label, fromRow, toRow) {
    var t = _normLbl_(label);
    var end = toRow ? Math.min(toRow, allData.length) : allData.length;
    for (var r = (fromRow || 1); r <= end; r++) {
      var row = allData[r - 1];
      if (row && _normLbl_(row[colIdx - 1]) === t) return r;
    }
    return 0;
  }
  // 実績セクション開始（"実績＆予想" 見出し行）以降だけを探索し、計画セクションの同名行を除外
  var rActHdr = _rowOf_(1, '実績＆予想', 1) || 78;
  // 主要行（B列＝項目名）
  var rProfit     = _rowOf_(2, '事業利益',                   rActHdr) || 271;
  var rNonOpsIn   = _rowOf_(2, '事業外入金',                 rActHdr) || 272;
  var rNonOpsOut  = _rowOf_(2, '事業外出金',                 rActHdr) || 294;
  var rCfOps      = _rowOf_(2, '現金増減額(営業CF)',          rActHdr) || 340;
  var rEstBank14  = _rowOf_(2, '想定の預金残高(毎月14日時点)', rActHdr) || 341;
  var rEstBankMin = _rowOf_(2, '想定の預金残高(最小値)',       rActHdr) || 342;
  var rActBank14  = _rowOf_(2, '実際の預金残高(毎月14日時点)', rActHdr) || 343;
  var rActBankMin = _rowOf_(2, '実際の預金残高(最小値)',       rActHdr) || 349;
  // 内訳（C列＝サブ項目名。親〜次の親の範囲に限定し、重複ラベル「その他・不明」等を区別）
  var rNiRevenue = _rowOf_(3, '事業外収益',                            rNonOpsIn,  rNonOpsOut) || 273;
  var rNiGroupTx = _rowOf_(3, 'グループ資金移動：入金',                rNonOpsIn,  rNonOpsOut) || 283;
  var rNiLoan    = _rowOf_(3, '借入金・出資金・補助金・給付金・還付金', rNonOpsIn,  rNonOpsOut) || 286;
  var rNiOther   = _rowOf_(3, 'その他・不明',                          rNonOpsIn,  rNonOpsOut) || 293;
  var rNoPayment = _rowOf_(3, '事業外支払',                            rNonOpsOut, rCfOps)     || 295;
  var rNoGroupTx = _rowOf_(3, 'グループ資金移動：出金',                rNonOpsOut, rCfOps)     || 318;
  var rNoRepay   = _rowOf_(3, '返済額・買戻額',                        rNonOpsOut, rCfOps)     || 321;
  var rNoRealty  = _rowOf_(3, '不動産関連',                            rNonOpsOut, rCfOps)     || 325;
  var rNoOther   = _rowOf_(3, 'その他・不明',                          rNonOpsOut, rCfOps)     || 330;
  var rNoTax     = _rowOf_(3, '税金等',                                rNonOpsOut, rCfOps)     || 333;
  // 銀行別内訳（実残14日 / 実残最小値）— 親〜次の親の範囲で区別
  var rB14_kira  = _rowOf_(3, 'きらぼし[cozoru]', rActBank14,  rActBankMin) || 344;
  var rB14_gmoC  = _rowOf_(3, 'GMO[cozoru]',      rActBank14,  rActBankMin) || 345;
  var rB14_gmoT  = _rowOf_(3, 'GMO[Tolance]',     rActBank14,  rActBankMin) || 346;
  var rB14_gmoL  = _rowOf_(3, 'GMO[ライブナウV]',  rActBank14,  rActBankMin) || 347;
  var rBmin_kira = _rowOf_(3, 'きらぼし[cozoru]', rActBankMin) || 350;
  var rBmin_gmoC = _rowOf_(3, 'GMO[cozoru]',      rActBankMin) || 351;
  var rBmin_gmoT = _rowOf_(3, 'GMO[Tolance]',     rActBankMin) || 352;
  var rBmin_gmoL = _rowOf_(3, 'GMO[ライブナウV]',  rActBankMin) || 353;

  function snap(month) {
    return {
      // ── 計画行（PL(全社) シート上部、Row 4-75） ─────────────
      plan_revTaxEx:    getCell(4,   month),  // 総売上（税抜）
      plan_dia:         getCell(5,   month),  // 総ダイヤ数
      plan_pt:          getCell(6,   month),  // 獲得pt数
      plan_registered:  getCell(22,  month),  // 累計所属ライバー数
      plan_active:      getCell(23,  month),  // 累計アクティブライバー数
      plan_inactive:    getCell(24,  month),  // 累計非アクティブライバー数
      plan_acquired:    getCell(25,  month),  // 獲得人数
      plan_debut:       getCell(26,  month),  // デビュー数
      plan_expTotal:    getCell(41,  month),  // 総経費
      plan_expAcq:      getCell(42,  month),  // 獲得コスト合計
      plan_expOps:      getCell(43,  month),  // 運用コスト合計
      plan_expOther:    getCell(44,  month),  // その他経費合計
      plan_profit:      getCell(62,  month),  // 事業利益
      plan_cfOps:       getCell(75,  month),  // 現金増減額

      // ── 実績＆予測行（PL(全社) シート下部、Row 79-341） ─────
      revTaxIn:    getCell(79,  month),  // 総売上（税込）
      revTaxEx:    getCell(80,  month),  // 総売上（税抜）
      dia:         getCell(81,  month),  // 総ダイヤ数
      pt:          getCell(82,  month),  // 獲得pt数
      mf:          getCell(83,  month),  // 投げ銭報酬（MF）
      cpnC5:       getCell(103, month),  // C5：イラスト報酬
      cpnB2:       getCell(106, month),  // B2：イラスト報酬（旧）
      cpnA:        getCell(109, month),  // A：Aランク報酬
      cpnS:        getCell(112, month),  // S：Sランク報酬
      cpnOther:    getCell(115, month),  // その他報酬
      leveshe:     getCell(116, month),  // レベシェア30%
      registered:  getCell(119, month),  // 累計所属ライバー数
      active:      getCell(120, month),  // 累計アクティブライバー数
      acquired:    getCell(121, month),  // 獲得人数
      debut:       getCell(122, month),  // デビュー数
      expTotal:    getCell(138, month),  // 総経費
      expAcq:      getCell(139, month),  // 獲得コスト合計
      expOps:      getCell(140, month),  // 運用コスト合計
      expOther:    getCell(141, month),  // その他経費合計
      profit:      getCell(rProfit, month),  // 事業利益（実績）

      // 事業外入金（CF内訳）※項目名で特定（行挿入に強い）
      nonOpsIn:            getCell(rNonOpsIn,  month),  // 事業外入金（合計）
      nonOpsIn_revenue:    getCell(rNiRevenue, month),  // 事業外収益
      nonOpsIn_groupTx:    getCell(rNiGroupTx, month),  // グループ資金移動：入金
      nonOpsIn_loanGrant:  getCell(rNiLoan,    month),  // 借入金・出資金・補助金・給付金・還付金
      nonOpsIn_other:      getCell(rNiOther,   month),  // その他・不明

      // 事業外出金（CF内訳）※項目名で特定
      nonOpsOut:           getCell(rNonOpsOut, month),  // 事業外出金（合計）
      nonOpsOut_payment:   getCell(rNoPayment, month),  // 事業外支払
      nonOpsOut_groupTx:   getCell(rNoGroupTx, month),  // グループ資金移動：出金
      nonOpsOut_repay:     getCell(rNoRepay,   month),  // 返済額・買戻額
      nonOpsOut_realty:    getCell(rNoRealty,  month),  // 不動産関連
      nonOpsOut_other:     getCell(rNoOther,   month),  // その他・不明
      nonOpsOut_tax:       getCell(rNoTax,     month),  // 税金等

      cfOps:       getCell(rCfOps, month),  // 現金増減額（営業CF）

      // 預金残高（4種類）※項目名で特定
      estBank14:   getCell(rEstBank14,  month),  // 想定の預金残高（毎月14日時点）
      estBankMin:  getCell(rEstBankMin, month),  // 想定の預金残高（最小値）
      actBank14:   getCell(rActBank14,  month),  // 実際の預金残高（毎月14日時点）
      actBankMin:  getCell(rActBankMin, month),  // 実際の預金残高（最小値）
      // 銀行別内訳（実残14日）
      actBank14_kiraboshi_coz: getCell(rB14_kira, month),  // きらぼし[cozoru]
      actBank14_gmo_coz:       getCell(rB14_gmoC, month),  // GMO[cozoru]
      actBank14_gmo_tol:       getCell(rB14_gmoT, month),  // GMO[Tolance]
      actBank14_gmo_lvn:       getCell(rB14_gmoL, month),  // GMO[ライブナウV]
      // 銀行別内訳（実残最小値）
      actBankMin_kiraboshi_coz: getCell(rBmin_kira, month),  // きらぼし[cozoru]
      actBankMin_gmo_coz:       getCell(rBmin_gmoC, month),  // GMO[cozoru]
      actBankMin_gmo_tol:       getCell(rBmin_gmoT, month),  // GMO[Tolance]
      actBankMin_gmo_lvn:       getCell(rBmin_gmoL, month),  // GMO[ライブナウV]

      // 旧キー互換（既存コード保護用）
      bankEst:     getCell(rEstBank14, month),
      bankAct:     getCell(rActBank14, month),

      // 実績月かどうか（RAW にデータがある月）
      isActual:    !!rawMonthSet[month]
    };
  }

  // 年別集計
  var FLOW_KEYS  = [
    'revTaxIn','revTaxEx','mf','cpnC5','cpnB2','cpnA','cpnS','cpnOther','leveshe','dia','pt','debut',
    'expTotal','expAcq','expOps','expOther',
    'profit','cfOps'
  ];
  var STOCK_KEYS = ['registered','active','acquired','bankEst','bankAct'];
  var yearMap = {};
  months.forEach(function(m) {
    var yr = m.substring(0, 4);
    if (!yearMap[yr]) yearMap[yr] = [];
    yearMap[yr].push(m);
  });

  var annual = {};
  Object.keys(yearMap).sort().forEach(function(yr) {
    var yMonths = yearMap[yr];
    var agg = { months: yMonths, monthCount: yMonths.length };
    FLOW_KEYS.forEach(function(k) {
      agg[k] = yMonths.reduce(function(sum, m) { return sum + (snap(m)[k] || 0); }, 0);
    });
    var latestS = snap(yMonths[yMonths.length - 1]);
    STOCK_KEYS.forEach(function(k) { agg[k] = latestS[k] || 0; });
    annual[yr] = agg;
  });

  var years = Object.keys(annual).sort();
  var latestYear = years[years.length - 1];

  // 月次トレンド（全月）
  var trend = months.map(function(m) {
    var s = snap(m);
    return { month: m, revTaxIn: s.revTaxIn, dia: s.dia, active: s.active, debut: s.debut };
  });

  // 月別フルスナップ（Phase 3 月別サマリ用）
  var monthly = months.map(function(m) {
    var s = snap(m);
    s.month = m;
    return s;
  });

  // ── 事務所別 月別 全指標（Phase 5 ドリルダウン用） ─────────
  // PL(個社別) シートから cozoru:全社 / ライブナウV / Tolance:全社 の全指標を月別取得
  // 構造: officeMonthly[month][office][key]
  var officeMonthly = {};
  try {
    var dbSh = ss.getSheetByName(CONFIG.SHEET_DB_SUMMARY);  // 'PL(個社別)'
    if (dbSh && dbSh.getLastRow() >= 3) {
      var dbLastCol = dbSh.getLastColumn();
      var dbHdr     = dbSh.getRange(2, 1, 1, dbLastCol).getValues()[0];
      var dbMonthCol = {};
      dbHdr.forEach(function(h, i) {
        var mm = (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM')
                                     : String(h || '').trim().substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(mm)) dbMonthCol[mm] = i + 1;
      });
      var dbLastRow = dbSh.getLastRow();
      var dbData    = dbSh.getRange(1, 1, dbLastRow, dbLastCol).getValues();

      var dbSectionRow = {};
      dbData.forEach(function(row, ri) {
        var lbl = String(row[0] || '').trim();
        if (lbl.indexOf('▼ ') === 0) dbSectionRow[lbl.substring(2).trim()] = ri + 1;
      });

      // PL(個社別) セクション内のオフセット（section header からの相対行）
      var DB_OFF = {
        revTaxEx:    2,    // 売上（税抜）
        dia:         3,    // 総ダイヤ数
        mf:          5,    // 投げ銭報酬（MF）
        cpnC5:       25,   // C5
        cpnB2:       29,   // B2
        cpnA:        33,   // A
        cpnS:        37,   // S
        cpnOther:    41,   // その他報酬
        leveshe:     42,   // レベシェア30%
        registered:  45,   // 累計所属ライバー数
        active:      46,   // 累計アクティブライバー数
        debut:       51    // デビュー数
      };
      var DB_KEYS = Object.keys(DB_OFF);

      var TARGET_OFFICES = ['cozoru:全社', 'ライブナウV', 'Tolance:全社'];
      months.forEach(function(m) {
        officeMonthly[m] = {};
        var col = dbMonthCol[m];
        if (!col) return;
        TARGET_OFFICES.forEach(function(off) {
          var sr = dbSectionRow[off];
          if (!sr) return;
          var officeData = {};
          DB_KEYS.forEach(function(key) {
            var rowIdx = sr + DB_OFF[key] - 1;
            if (dbData[rowIdx]) {
              officeData[key] = Number(dbData[rowIdx][col - 1]) || 0;
            }
          });
          officeMonthly[m][off] = officeData;
        });
      });
    }
  } catch (e) {
    officeMonthly = { error: e.message };
  }

  return {
    latestYear:    latestYear,
    years:         years,
    annual:        annual,
    trend:         trend,
    monthly:       monthly,
    officeMonthly: officeMonthly
  };
}

function buildLiversJson_(filterMonth) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!rawSh || rawSh.getLastRow() < 2) return { livers: [], months: [] };

  var raw = rawSh.getRange(2, 1, rawSh.getLastRow() - 1, CONFIG.RAW_COLUMNS.length).getValues();

  var monthSet = {};
  raw.forEach(function(r) { var m = toYM_(r[0]); if (m) monthSet[m] = true; });
  var months = Object.keys(monthSet).sort();
  var latest = filterMonth && months.indexOf(filterMonth) >= 0 ? filterMonth : months[months.length - 1];

  // UID別データ（総配信時間 r[11]、デビュー判定 r[30] を追加取得）
  var uidMap = {};
  raw.forEach(function(r) {
    var m = toYM_(r[0]); if (!m) return;
    var uid  = String(r[2] || '').trim(); if (!uid) return;
    var dia      = Number(r[15]) || 0;
    var rank     = String(r[17] || '').trim();
    var tierNum  = Number(r[28]) || 3;
    var tier     = tierNum === 1 ? 'T1' : tierNum === 2 ? 'T2' : 'T3';
    var isActive = (r[29] == true || String(r[29]).toUpperCase() === 'TRUE');
    var hours    = Number(r[11]) || 0;
    var isDebut  = (r[30] == true || String(r[30]).toUpperCase() === 'TRUE');

    if (!uidMap[uid]) {
      uidMap[uid] = { uid: uid, name: String(r[3]||''), office: String(r[1]||''), label: String(r[4]||''), hist: {}, debutMonth: null };
    }
    uidMap[uid].hist[m] = { dia: dia, rank: rank, tier: tier, active: isActive, hours: hours };
    if (isDebut && !uidMap[uid].debutMonth) uidMap[uid].debutMonth = m;
  });

  var latestIdx = months.indexOf(latest);
  var prevM     = latestIdx >= 1 ? months[latestIdx - 1] : '';
  var prev2M    = latestIdx >= 2 ? months[latestIdx - 2] : '';

  // 最新月のリスト
  var list = Object.keys(uidMap).map(function(uid) {
    var a   = uidMap[uid];
    var ld  = a.hist[latest] || { dia: 0, rank: '', tier: 'T3', active: false, hours: 0 };
    var pd  = prevM  ? (a.hist[prevM]  || null) : null;
    var p2d = prev2M ? (a.hist[prev2M] || null) : null;

    var diaHist = months.map(function(m) { return (a.hist[m] || { dia: 0 }).dia; });

    // 直近3か月 [古→新]
    var dia3m   = [p2d ? p2d.dia   : 0, pd ? pd.dia   : 0, ld.dia  ];
    var hours3m = [p2d ? p2d.hours : 0, pd ? pd.hours : 0, ld.hours];

    // 前月時点でのfc1（当月実績との比較で予測精度を検証）
    var prevFc1 = 0;
    if (pd && latestIdx >= 1) {
      var prevHist = months.slice(0, latestIdx).map(function(m2) { return (a.hist[m2] || { dia: 0 }).dia; });
      prevFc1 = calcForecast(prevHist, 1);
    }

    return {
      uid       : uid,
      name      : a.name,
      office    : a.office,
      label     : a.label,
      dia       : ld.dia,
      rank      : ld.rank,
      tier      : ld.tier,
      active    : ld.active,
      fc1       : calcForecast(diaHist, 1),
      fc2       : calcForecast(diaHist, 2),
      fc3       : calcForecast(diaHist, 3),
      prevRank  : pd ? pd.rank : '',
      prevTier  : pd ? pd.tier : '',
      dia3m     : dia3m,
      hours3m   : hours3m,
      debutMonth: a.debutMonth || '',
      prevFc1   : prevFc1
    };
  }).filter(function(a) { return a.active; })
    .sort(function(a, b) { return b.dia - a.dia; });

  return { months: months, latestMonth: latest, livers: list };
}

function buildDebutJson_() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!rawSh || rawSh.getLastRow() < 2) return {};

  var raw = rawSh.getRange(2, 1, rawSh.getLastRow() - 1, CONFIG.RAW_COLUMNS.length).getValues();

  var monthSet = {}, uidMap = {};
  raw.forEach(function(r) {
    var m   = toYM_(r[0]); if (!m) return;
    var uid = String(r[2] || '').trim(); if (!uid) return;
    monthSet[m] = true;
    var isD = (r[30] == true || String(r[30]).toUpperCase() === 'TRUE');
    var ro  = DEBUT_RANK_ORD[String(r[17]||'').trim()];
    var c5  = (Number(r[19]) > 0) || (ro !== undefined && ro >= 5);

    if (!uidMap[uid]) {
      uidMap[uid] = { office: String(r[1]||''), label: String(r[4]||''), debutMonth: null, hist: {} };
    }
    uidMap[uid].hist[m] = { dia: Number(r[15]) || 0, c5: c5 };
    if (isD && !uidMap[uid].debutMonth) uidMap[uid].debutMonth = m;
  });

  var months = Object.keys(monthSet).sort();
  var latest = months[months.length - 1] || '';

  // コホート
  var cohort = months.map(function(dm) {
    var uids = Object.keys(uidMap).filter(function(uid) { return uidMap[uid].debutMonth === dm; });
    if (uids.length === 0) return null;
    function avgDia(n) {
      var tgt = addM17_(dm, n);
      if (tgt > latest) return null;
      var s = 0, c = 0;
      uids.forEach(function(uid) { var d = uidMap[uid].hist[tgt]; if (d) { s += d.dia; c++; } });
      return c > 0 ? Math.round(s / c) : 0;
    }
    var c5n = 0;
    uids.forEach(function(uid) {
      for (var n = 0; n <= 6; n++) {
        var tm = addM17_(dm, n);
        if (tm > latest) break;
        var d = uidMap[uid].hist[tm];
        if (d && d.c5) { c5n++; break; }
      }
    });
    return { month: dm, count: uids.length, d1: avgDia(1), d3: avgDia(3), d6: avgDia(6), d12: avgDia(12), c5Rate: Math.round(c5n / uids.length * 100) };
  }).filter(Boolean).reverse();

  // レーベル別デビュー数トレンド
  var labelCount = {};
  Object.keys(uidMap).forEach(function(uid) {
    var a = uidMap[uid]; if (!a.debutMonth) return;
    var key = a.office;
    if (!labelCount[key]) labelCount[key] = {};
    labelCount[key][a.debutMonth] = (labelCount[key][a.debutMonth] || 0) + 1;
  });

  return { months: months, latestMonth: latest, cohort: cohort, labelTrend: labelCount };
}

// ──────────────────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────────────────

function toYM_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
  var s = String(v || '').trim().substring(0, 7);
  return s.length === 7 ? s : '';
}

function loadTaxRate_() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_M_TAX);
    if (!sh) return 0.10;
    var v = Number(sh.getRange(2, 2).getValue());
    if (!isFinite(v) || v <= 0) return 0.10;
    // 値が 1未満なら小数表記（0.10など）、1以上ならパーセント表記（10など）
    return v < 1 ? v : v / 100;
  } catch (e) { return 0.10; }
}

// ──────────────────────────────────────────────────────────
// 成長ボーナス判定データ（DB_成長予測 から事務所別に読み込み）
// ──────────────────────────────────────────────────────────
// DB_成長予測のレイアウト（7行1ブロック）:
//   行+0 ◆事務所名 : 判定値（◎/○/✖）← 各月に数式で自動算出
//   行+1 単月基準   : 過去最高月次ダイヤ（この値以上で◎の単月条件）
//   行+2 3ヶ月基準  : 今月必要ダイヤ（3ヶ月合計が過去最高になる最低値）
//   行+3 最低       : 直近6ヶ月最小値（下回ると✖）
//   行+4 月次ダイヤ : 実績 or 予測
//   行+5 3か月ダイヤ: 当月+前月+前々月合計
//   行+6 空行
function buildGrowthBonusJson_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = { offices: [] };

  var fSh = ss.getSheetByName(CONFIG.SHEET_DB_GROWTH_FORECAST);
  if (!fSh || fSh.getLastRow() < 6) return result;

  // RAW実績月セット（予測月との区別に使用）
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var rawMonthSet = {};
  if (rawSh && rawSh.getLastRow() >= 2) {
    rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      var m = toYM_(r[0]); if (m) rawMonthSet[m] = true;
    });
  }

  var lastCol = fSh.getLastColumn();
  var lastRow = fSh.getLastRow();
  var allData = fSh.getRange(1, 1, lastRow, lastCol).getValues();

  // 行1: 月ヘッダー（Date型 or yyyy-MM文字列）
  var hdrRow = allData[0];

  // 事務所ブロックを検索（列Aが "◆ " で始まる行 = offHdr）
  for (var ri = 5; ri < lastRow - 3; ri++) {  // row 6以降（0-indexed = 5）
    var labelA = String(allData[ri][0] || '').trim();
    if (labelA.indexOf('◆ ') !== 0) continue;

    var officeName = labelA.substring(2).trim();
    var judgeVals = allData[ri];       // 行+0: 判定（◎/○/✖）
    var maxVals   = allData[ri + 1];   // 行+1: 単月基準
    var req3mVals = allData[ri + 2];   // 行+2: 3ヶ月基準
    var minVals   = allData[ri + 3];   // 行+3: 最低
    var diaVals   = ri + 4 < lastRow ? allData[ri + 4] : []; // 行+4: 月次ダイヤ

    var officeMonths = [];
    hdrRow.forEach(function(h, ci) {
      if (ci === 0) return;
      var m = h instanceof Date
        ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM')
        : String(h || '').substring(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return;

      var judge = String(judgeVals[ci] || '').trim();
      var dia   = Number(diaVals[ci])   || 0;
      if (!judge && dia === 0) return;  // 空月はスキップ

      officeMonths.push({
        month          : m,
        judge          : judge,                         // ◎/○/✖（空=実績なし）
        dia            : dia,                           // 月次ダイヤ
        singleThreshold: Number(maxVals[ci])   || 0,   // 単月基準（過去最高）
        req3m          : Number(req3mVals[ci]) || 0,   // 3ヶ月基準（今月必要値）
        minDia         : Number(minVals[ci])   || 0,   // 最低（直近6ヶ月最小）
        isActual       : !!rawMonthSet[m]               // true=実績 / false=予測
      });
    });

    if (officeMonths.length > 0) {
      result.offices.push({ office: officeName, months: officeMonths });
    }
  }

  return result;
}

// 取込ログ（直近30行）を取得
function readRecentLogs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  var lastRow = sh.getLastRow();
  var startRow = Math.max(2, lastRow - 30);
  var data = sh.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
  return data.map(function(r) {
    return {
      time: r[0] instanceof Date ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM-dd HH:mm:ss') : String(r[0] || ''),
      level: String(r[1] || ''),
      target: String(r[2] || ''),
      office: String(r[3] || ''),
      message: String(r[4] || '')
    };
  });
}

// PL（個社別）の指定セクション×指定月の全KPI（値・数式・背景色）をログ出力＋API応答
function debugCellInfo(sectionName, targetMonth) {
  if (!sectionName) sectionName = 'cozoru:全社';
  if (!targetMonth) targetMonth = '2026-04';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL（個社別）');
  if (!plSh) { Logger.log('PL（個社別） シートなし'); return []; }
  // セクション検索
  var plAVals = plSh.getRange(1, 1, plSh.getLastRow(), 1).getValues();
  var s0 = -1;
  var marker1 = '▼ ' + sectionName, marker2 = sectionName;
  for (var i = 0; i < plAVals.length; i++) {
    var lbl = String(plAVals[i][0] || '').trim();
    if (lbl === marker1 || lbl === marker2) { s0 = i + 2; break; }
  }
  if (s0 < 0) { Logger.log('セクション[' + sectionName + ']未発見'); return []; }
  // 月列検索
  var lastCol = plSh.getLastColumn();
  var row2 = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var plMonthStr = targetMonth.split('-')[0] + '/' + parseInt(targetMonth.split('-')[1], 10);
  var col = -1;
  for (var c = 0; c < row2.length; c++) {
    var cv = row2[c];
    var cvStr = cv instanceof Date ? Utilities.formatDate(cv, 'JST', 'yyyy/M') : String(cv).trim();
    if (cvStr === plMonthStr) { col = c + 1; break; }
  }
  if (col < 0) { Logger.log('月[' + targetMonth + ']未発見'); return []; }
  // セクション内の全KPI（55行想定）の値・数式・背景色を取得
  var n = 55;
  var labels = plSh.getRange(s0, 1, n, 3).getValues();
  var values = plSh.getRange(s0, col, n, 1).getValues();
  var formulas = plSh.getRange(s0, col, n, 1).getFormulas();
  var bgs = plSh.getRange(s0, col, n, 1).getBackgrounds();
  Logger.log('=== ' + sectionName + ' ' + targetMonth + ' (s0=' + s0 + ', col=' + col + ') ===');
  var result = [];
  for (var i = 0; i < n; i++) {
    var label = (labels[i][0] || labels[i][1] || labels[i][2] || '').toString().trim();
    if (!label) continue;
    var f = formulas[i][0];
    var v = values[i][0];
    var bg = bgs[i][0];
    var bgName = '?';
    if (bg === '#a5d6a7') bgName = '🟢緑(iriam実額)';
    else if (bg === '#fff9c4') bgName = '🟡黄(数式)';
    else if (bg === '#e3f2fd') bgName = '🔵青(RAW集計)';
    else if (bg === '#ffffff' || !bg) bgName = '⚪白(手入力)';
    else if (bg === '#c8e6c9') bgName = '緑(旧数式色)';
    else if (bg === '#f3e5f5') bgName = '🟣紫(予測)';
    else if (bg === '#fff8e1') bgName = '黄(予測手入力)';
    else if (bg === '#cccccc') bgName = '⚫グレー(廃止)';
    else if (bg === '#ffe0b2') bgName = 'オレンジ(外部)';
    var logRow = (s0+i) + '行: ' + label.substring(0, 35) + ' | bg=' + bgName + ' | 値=' + v + ' | 式=' + (f || '(値のみ)').substring(0, 80);
    Logger.log(logRow);
    result.push({ row: s0+i, label: label, value: v, formula: f, bg: bg, bgName: bgName });
  }
  return result;
}

// cozoruレーベル / D3レーベル / Tolance(サブ) の売上数式が新式になっているか確認
function debugCellInfoLabels() {
  ['cozoruレーベル', 'D3レーベル', 'Tolance', 'BUBBLE'].forEach(function(sec) {
    Logger.log('\n========== ' + sec + ' 2026-04 ==========');
    debugCellInfo(sec, '2026-04');
  });
}

function debugDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};

  // 全シート名
  result.allSheets = ss.getSheets().map(function(s) { return s.getName(); });

  // PL（個社別）診断
  var indSh = ss.getSheetByName('PL（個社別）');
  if (indSh) {
    var lastCol = indSh.getLastColumn();
    var hdr = indSh.getRange(2, 1, 1, lastCol).getValues()[0];
    result.indPL_row2 = hdr.map(function(h) {
      return (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM') : String(h || '').substring(0, 10);
    });
    // セクションヘッダー検索
    var lastRow = Math.min(indSh.getLastRow(), 120);
    var col1 = indSh.getRange(1, 1, lastRow, 1).getValues();
    result.indPL_sections = [];
    col1.forEach(function(r, i) {
      var lbl = String(r[0] || '').trim();
      if (lbl.indexOf('▼') === 0) result.indPL_sections.push({ row: i+1, label: lbl, charCodes: lbl.split('').map(function(c){return c.charCodeAt(0);}) });
    });
    // 行3〜6の列Aラベル
    result.indPL_rows3to6 = indSh.getRange(3, 1, 6, 1).getValues().map(function(r,i){return {row:i+3, label:String(r[0])};});
    // 月2列目の値（B2）
    if (lastCol >= 2) result.indPL_B2 = String(indSh.getRange(2, 2).getValue());
  } else {
    result.indPL_error = 'シートが見つかりません: PL（個社別）';
  }

  // PL(全社)診断
  var plSh = ss.getSheetByName('PL(全社)');
  if (plSh) {
    result.fullPL_lastRow = plSh.getLastRow();
    result.fullPL_lastCol = plSh.getLastColumn();
    var hdr2 = plSh.getRange(2, 1, 1, Math.min(plSh.getLastColumn(), 20)).getValues()[0];
    result.fullPL_row2 = hdr2.map(function(h) {
      return (h instanceof Date) ? Utilities.formatDate(h, 'Asia/Tokyo', 'yyyy-MM') : String(h || '').substring(0, 10);
    });
    // 列A・列B を全行読んで項目一覧を返す（空行はスキップ）
    var scanRows = plSh.getLastRow();
    var abCols = plSh.getRange(1, 1, scanRows, 2).getValues();
    result.fullPL_rows = [];
    abCols.forEach(function(r, i) {
      var a = String(r[0] || '').trim();
      var b = String(r[1] || '').trim();
      var label = b || a;
      if (label) result.fullPL_rows.push({ row: i + 1, a: a.substring(0, 40), b: b.substring(0, 40) });
    });
  } else {
    result.fullPL_error = 'シートが見つかりません: PL(全社)';
  }

  // RAW月一覧
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (rawSh && rawSh.getLastRow() >= 2) {
    var rawMonths = {};
    rawSh.getRange(2, 1, rawSh.getLastRow()-1, 1).getValues().forEach(function(r){
      var m = toYM_(r[0]); if (m) rawMonths[m] = true;
    });
    result.rawMonths = Object.keys(rawMonths).sort();
  }

  return result;
}

// ──────────────────────────────────────────────────────────
// バナー実績（banner_active を直接集計）
// ──────────────────────────────────────────────────────────
function buildBannersJson_(baseDate, baseMonth) {
  var empty = { baseDate:'', weeks:[], metrics:['ptSum','avgPt','winCount','joinCount'], byOrg:[], byLabel:[], byLiver:[], summary:null, monthly:null };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('banner_active');
  if (!sh || sh.getLastRow() < 2) return empty;
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 18).getValues();
  var base = String(baseDate || '').replace(/[^0-9]/g, '').substring(0, 8);
  var result = aggregateBanners_(values, base);
  var bm = String(baseMonth || '').replace(/[^0-9]/g, '').substring(0, 6);
  result.monthly = aggregateBannersMonthly_(values, bm);
  return result;
}

// ※ tmp/banner_aggregate.mjs の aggregateBanners と同一ロジック（node でテスト済み）。
//    変更時は両方を必ず同期すること（tmp/test_gas_banner_sync.mjs で機械検証）。
function aggregateBanners_(values, baseDate) {
  var METRICS = ['ptSum','avgPt','winCount','joinCount'];
  var rows = parseBannerRows_(values);
  var weekSet={}; rows.forEach(function(r){ if(r.week) weekSet[r.week]=true; });
  var allWeeks=Object.keys(weekSet).sort();
  var base=(baseDate && weekSet[baseDate]) ? baseDate : (allWeeks[allWeeks.length-1] || '');
  var weeks=allWeeks.filter(function(w){return w<=base;}).slice(-4).reverse();
  var weekIdx={}; weeks.forEach(function(w,i){weekIdx[w]=i;});
  var latestWk=weeks[0]||'';
  rows.forEach(function(r){ if(!r.week && r.noEvent && latestWk) r.week=latestWk; });   // EventId無し→最新回に表示
  var inWin=rows.filter(function(r){return weekIdx[r.week]!==undefined;});
  var noEventInWin=0; inWin.forEach(function(r){ if(r.noEvent) noEventInWin++; });
  function buildEntity(keyFn){
    var map={};
    inWin.forEach(function(r){
      var k=keyFn(r); if(!k) return;
      if(!map[k]) map[k]={ name:k, weekly:weeks.map(function(w){return {week:w,ptSum:0,avgPt:null,winCount:0,joinCount:0};}), totalPt:0 };
      var c=map[k].weekly[weekIdx[r.week]];
      c.ptSum+=r.pt; c.winCount+=r.win; c.joinCount+=1; map[k].totalPt+=r.pt;
    });
    var arr=Object.keys(map).map(function(k){
      var e=map[k];
      e.weekly.forEach(function(c){ c.avgPt=c.joinCount>0?Math.round(c.ptSum/c.joinCount):null; });
      return e;
    });
    arr.sort(function(a,b){return b.totalPt-a.totalPt;});
    return arr;
  }
  var byOrg=buildEntity(function(r){return r.org;});
  var byLabel=buildEntity(function(r){return r.label;});
  var lmap={};
  inWin.forEach(function(r){
    var k=r.liver; if(!k) return;
    if(!lmap[k]) lmap[k]={ name:k, office:r.org, label:r.label, weekly:weeks.map(function(w){return {week:w,rank:0,pt:0,win:false,joined:false};}) };
    var c=lmap[k].weekly[weekIdx[r.week]]; c.rank=r.rank; c.pt=r.pt; c.win=r.win===1; c.joined=true; if(r.noEvent) c.noEvent=true;
  });
  var byLiver=Object.keys(lmap).map(function(k){return lmap[k];});
  byLiver.sort(function(a,b){
    var aw=a.weekly[0].win?1:0, bw=b.weekly[0].win?1:0;
    return (bw-aw) || (b.weekly[0].pt - a.weekly[0].pt);
  });
  function weekTotals(idx){
    if(idx<0||idx>=weeks.length) return null;
    var w=weeks[idx], pt=0,win=0,join=0;
    inWin.forEach(function(r){ if(r.week===w){ pt+=r.pt; win+=r.win; join+=1; } });
    return { week:w, joinCount:join, winCount:win, winRate: join>0?Math.round(win/join*100):0, avgPt: join>0?Math.round(pt/join):0 };
  }
  var s0=weekTotals(0), s1=weekTotals(1);
  var summary=s0 ? { week:s0.week, joinCount:s0.joinCount, winCount:s0.winCount, winRate:s0.winRate, avgPt:s0.avgPt,
    prev: s1 ? { joinCount:s1.joinCount, winCount:s1.winCount, winRate:s1.winRate, avgPt:s1.avgPt } : null } : null;
  var evMap={};
  inWin.forEach(function(r){
    var key=r.week+'|'+r.eventId+'|'+r.block;
    if(!evMap[key]) evMap[key]={ week:r.week, eventId:r.eventId, blockId:r.block, eventName:r.eventName, office:r.org, start:r.start, end:r.end, participants:[] };
    evMap[key].participants.push({ name:r.liver, office:r.org, label:r.label, rank:r.rank, pt:r.pt, win:r.win===1 });
  });
  var events=Object.keys(evMap).map(function(k){
    var e=evMap[k];
    e.participants.sort(function(a,b){ var ar=a.rank>0?a.rank:999999, br=b.rank>0?b.rank:999999; return (ar-br)||(b.pt-a.pt); });
    e.count=e.participants.length;
    e.winCount=0; for(var i=0;i<e.participants.length;i++){ if(e.participants[i].win) e.winCount++; }
    return e;
  });
  events.sort(function(a,b){ if(a.week!==b.week) return a.week<b.week?1:-1; return b.count-a.count; });
  return { baseDate: base, weeks: weeks, metrics: METRICS, byOrg: byOrg, byLabel: byLabel, byLiver: byLiver, events: events, summary: summary, noEventCount: noEventInWin };
}

// ※ tmp/banner_aggregate.mjs の parseBannerRows / aggregateBannersMonthly と同一ロジック。
//    変更時は両方を必ず同期すること（tmp/test_gas_banner_sync.mjs で機械検証）。
function parseBannerRows_(values) {
  var C_ORG=2, C_ID=11, C_LIV=12, C_LBL=13, C_RANK=15, C_PT=16, C_EVT=4, C_EVTNAME=5, C_START=6, C_END=7, C_BLOCK=14;
  function fmtMD(v){
    if (v && typeof v.getMonth === 'function') return (v.getMonth()+1)+'/'+v.getDate();
    var s=String(v==null?'':v);
    var m=s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if(m) return parseInt(m[2],10)+'/'+parseInt(m[3],10);
    var d=s.match(/^(\d{4})(\d{2})(\d{2})/);
    if(d) return parseInt(d[2],10)+'/'+parseInt(d[3],10);
    return s.substring(0,10);
  }
  var rows=[];
  for (var i=0;i<values.length;i++){
    var r=values[i];
    var id=String(r[C_ID]==null?'':r[C_ID]).trim();
    if(!id) continue;
    var eid=String(r[C_EVT]==null?'':r[C_EVT]).trim();
    var hasEid=/^\d{8}/.test(eid);
    var rank=Number(r[C_RANK])||0;
    rows.push({ org:String(r[C_ORG]||'').trim(), label:String(r[C_LBL]||'').trim(), liver:String(r[C_LIV]||'').trim(),
      week:(hasEid?eid.substring(0,8):''), noEvent:!hasEid, rank:rank, pt:Number(r[C_PT])||0, win:(rank>=1 && rank<=100)?1:0,
      eventId:eid, eventName:String(r[C_EVTNAME]||'').trim(),
      start:fmtMD(r[C_START]), end:fmtMD(r[C_END]), block:String(r[C_BLOCK]==null?'':r[C_BLOCK]).trim() });
  }
  return rows;
}

// 月次集計: 期間キー＝EventId先頭8桁のYYYYMM（バナイベ開始日の月）
function aggregateBannersMonthly_(values, baseMonth) {
  var empty = { baseMonth:'', months:[], allMonths:[], byOrg:[], byLabel:[], byLiver:[], summary:null, trend:[], noEventCount:0 };
  var rows = parseBannerRows_(values);
  if (!rows.length) return empty;
  var weekSet={}; rows.forEach(function(r){ if(r.week) weekSet[r.week]=true; });
  var allWeeks=Object.keys(weekSet).sort();
  if (!allWeeks.length) return empty;
  var latestWk=allWeeks[allWeeks.length-1];
  rows.forEach(function(r){ if(!r.week && r.noEvent) r.week=latestWk; });
  rows.forEach(function(r){ r.month=r.week.substring(0,6); });
  var monthSet={}; rows.forEach(function(r){ monthSet[r.month]=true; });
  var allMonths=Object.keys(monthSet).sort();
  var base=(baseMonth && monthSet[baseMonth]) ? baseMonth : allMonths[allMonths.length-1];
  var months=allMonths.filter(function(m){return m<=base;}).slice(-6).reverse();
  var monthIdx={}; months.forEach(function(m,i){monthIdx[m]=i;});
  var inWin=rows.filter(function(r){return monthIdx[r.month]!==undefined;});
  var noEventInWin=0; inWin.forEach(function(r){ if(r.noEvent) noEventInWin++; });
  function buildEntity(keyFn){
    var map={};
    inWin.forEach(function(r){
      var k=keyFn(r); if(!k) return;
      if(!map[k]) map[k]={ name:k, monthly:months.map(function(m){return {month:m,ptSum:0,avgPt:null,winCount:0,joinCount:0};}), totalPt:0 };
      var c=map[k].monthly[monthIdx[r.month]];
      c.ptSum+=r.pt; c.winCount+=r.win; c.joinCount+=1; map[k].totalPt+=r.pt;
    });
    var arr=Object.keys(map).map(function(k){
      var e=map[k];
      e.monthly.forEach(function(c){ c.avgPt=c.joinCount>0?Math.round(c.ptSum/c.joinCount):null; });
      return e;
    });
    arr.sort(function(a,b){return b.totalPt-a.totalPt;});
    return arr;
  }
  var byOrg=buildEntity(function(r){return r.org;});
  var byLabel=buildEntity(function(r){return r.label;});
  var lmap={};
  inWin.forEach(function(r){
    var k=r.liver; if(!k) return;
    if(!lmap[k]) lmap[k]={ name:k, office:r.org, label:r.label, monthly:months.map(function(m){return {month:m,joinCount:0,winCount:0,ptSum:0,bestRank:0};}) };
    var c=lmap[k].monthly[monthIdx[r.month]];
    c.joinCount+=1; c.winCount+=r.win; c.ptSum+=r.pt;
    if(r.rank>0 && (c.bestRank===0 || r.rank<c.bestRank)) c.bestRank=r.rank;
  });
  var byLiver=Object.keys(lmap).map(function(k){return lmap[k];});
  byLiver.sort(function(a,b){ return (b.monthly[0].winCount-a.monthly[0].winCount)||(b.monthly[0].ptSum-a.monthly[0].ptSum); });
  var tmap={};
  rows.forEach(function(r){
    if(!tmap[r.month]) tmap[r.month]={ ptSum:0, joinCount:0, winCount:0, evKeys:{} };
    var t=tmap[r.month];
    t.ptSum+=r.pt; t.joinCount+=1; t.winCount+=r.win;
    t.evKeys[r.eventId+'|'+r.block]=true;
  });
  var trend=allMonths.map(function(m){
    var t=tmap[m];
    return { month:m, ptSum:t.ptSum, joinCount:t.joinCount, winCount:t.winCount,
      winRate: t.joinCount>0?Math.round(t.winCount/t.joinCount*100):0,
      avgPt: t.joinCount>0?Math.round(t.ptSum/t.joinCount):0,
      eventCount: Object.keys(t.evKeys).length };
  });
  function monthStats(m){
    for (var i=0;i<trend.length;i++){
      if(trend[i].month===m) return { joinCount:trend[i].joinCount, winCount:trend[i].winCount, winRate:trend[i].winRate, avgPt:trend[i].avgPt, eventCount:trend[i].eventCount };
    }
    return null;
  }
  var cur=monthStats(months[0]);
  var prevM=allMonths[allMonths.indexOf(months[0])-1];
  var prev=prevM?monthStats(prevM):null;
  var summary=cur?{ month:months[0], joinCount:cur.joinCount, winCount:cur.winCount, winRate:cur.winRate, avgPt:cur.avgPt, eventCount:cur.eventCount, prev:prev }:null;
  return { baseMonth:base, months:months, allMonths:allMonths, byOrg:byOrg, byLabel:byLabel, byLiver:byLiver, summary:summary, trend:trend, noEventCount:noEventInWin };
}
