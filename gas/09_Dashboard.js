// 09_Dashboard.gs
// DB_サマリ 再構築（PL個社別構造対応版）
// 列 = 月別（RAW内の全月 + 6ヶ月予測）
// 行 = 17セクション × 53 KPI項目積み重ね
// ・達成人数（C5/B2/A/S）追加
// ・Tier別アクティブ数 追加
// ・PL(個社別) と同一の項目・階層・順序

function colNumToLetter_09_(n) {
  var s = '';
  while (n > 0) { var m = (n-1)%26; s = String.fromCharCode(65+m)+s; n = Math.floor((n-1)/26); }
  return s;
}

function rebuildSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var sumSh = ss.getSheetByName(CONFIG.SHEET_DB_SUMMARY);
  var officeSh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  if (!sumSh) { Logger.log('DB_サマリ シート未検出'); return; }

  // --- 事務所リスト（全社合計ダイヤボーナス式用） ---
  var offices = [];
  if (officeSh && officeSh.getLastRow() >= 2) {
    officeSh.getRange(2, 1, officeSh.getLastRow() - 1, 3).getValues().forEach(function(r) {
      if (r[0] && (r[2] === true || r[2] === 'TRUE')) offices.push(r[0]);
    });
  }

  // --- 月リスト: RAW内の全月 + 6ヶ月予測 ---
  var monthSet = {};
  var rawLast = rawSh ? rawSh.getLastRow() : 1;
  if (rawLast > 1) {
    rawSh.getRange(2, 1, rawLast - 1, 1).getValues().forEach(function(r) {
      if (!r[0]) return;
      var ym = (r[0] instanceof Date) ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM') : String(r[0]).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) monthSet[ym] = true;
    });
  }
  var months = Object.keys(monthSet).sort();
  if (months.length === 0) months = [Utilities.formatDate(new Date(), 'JST', 'yyyy-MM')];
  var tail = months[months.length - 1].split('-');
  for (var fi = 1; fi <= 6; fi++) {
    var tm = Number(tail[1]) - 1 + fi;
    var ty = Number(tail[0]) + Math.floor(tm / 12);
    months.push(ty + '-' + ('0' + ((tm % 12) + 1)).slice(-2));
  }

  // --- セクション定義（17個、PL個社別と同構成） ---
  var SECTIONS = [
    { header: '全社合計',                   office: null,                label: null },
    { header: 'cozoru:全社',               office: '"株式会社cozoru"',  label: null },
    { header: 'cozoruレーベル',             office: '"株式会社cozoru"',  label: '"株式会社cozoru"' },
    { header: 'D3レーベル',               office: '"株式会社cozoru"',  label: '"D3"' },
    { header: 'ライブナウV',               office: '"ライブナウV"',     label: null },
    { header: 'Tolance:全社',              office: '"株式会社Tolance"', label: null },
    { header: 'Tolance',                   office: '"株式会社Tolance"', label: '"Tolance"' },
    { header: 'BUBBLE',                    office: '"株式会社Tolance"', label: '"BUBBLE"' },
    { header: 'Deeper Deeper',             office: '"株式会社Tolance"', label: '"Deeper Deeper"' },
    { header: 'Mofile',                    office: '"株式会社Tolance"', label: '"Mofile"' },
    { header: 'ヴィラプロ',               office: '"株式会社Tolance"', label: '"ヴィラプロ"' },
    { header: 'アライアンス：アクトワン', office: '"株式会社Tolance"', label: '"アライアンス：アクトワン"' },
    { header: 'アライアンス：アドモンド', office: '"株式会社Tolance"', label: '"アライアンス：アドモンド"' },
    { header: 'アライアンス：TOIRO',       office: '"株式会社Tolance"', label: '"アライアンス：TOIRO"' },
    { header: 'アライアンス：PODD',        office: '"株式会社Tolance"', label: '"アライアンス：PODD"' },
    { header: 'アライアンス：その他',      office: '"株式会社Tolance"', label: '"アライアンス：その他"' },
    { header: 'アライアンス：トビラ',      office: '"株式会社Tolance"', label: '"アライアンス：トビラ"' },
  ];

  // --- 数式ビルダ（$B$2 → 月列参照に一括置換して使用） ---
  var RAW  = "'" + CONFIG.SHEET_RAW + "'";
  var MB   = "'" + CONFIG.SHEET_M_MONTHLY_BONUS + "'";
  var MO   = "'" + CONFIG.SHEET_M_OFFICE + "'";
  var MCPN = "'" + CONFIG.SHEET_M_CPN + "'";
  var MONTH = '$B$2';

  function sumifs(col, officeF, labelF, conds) {
    var s = 'SUMIFS(' + RAW + '!' + col + ':' + col + ',' + RAW + '!A:A,' + MONTH;
    if (officeF) s += ',' + RAW + '!B:B,' + officeF;
    if (labelF)  s += ',' + RAW + '!AK:AK,' + labelF;
    if (conds) for (var i = 0; i < conds.length; i += 2) s += ',' + RAW + '!' + conds[i] + ':' + conds[i] + ',' + conds[i+1];
    return s + ')';
  }
  function countifs(officeF, labelF, conds) {
    var s = 'COUNTIFS(' + RAW + '!A:A,' + MONTH;
    if (officeF) s += ',' + RAW + '!B:B,' + officeF;
    if (labelF)  s += ',' + RAW + '!AK:AK,' + labelF;
    if (conds) for (var i = 0; i < conds.length; i += 2) s += ',' + RAW + '!' + conds[i] + ':' + conds[i] + ',' + conds[i+1];
    return s + ')';
  }
  function sumifsOuen(col, officeF, labelF, conds) {
    return sumifs(col, officeF, labelF, (conds || []).concat(['AB', '"<>既存"']));
  }
  function countifsRegistered(officeF, labelF, conds) {
    return countifs(officeF, labelF, (conds || []).concat(['G', '"<>未配信"']));
  }
  function bonusForOffice(t, oc, lc) {
    // AH列（MF理論値）はCSV取込時に ライバー単位で計算・ROUND済み。
    // 月次ボーナス区分（最高/基本/最低）も反映済み → iriam請求書実額と一致する。
    // 新規/移籍ライバーのみ対象、Tier別に集計。
    return '(' +
      sumifs('AH', oc, lc, ['AC', t, 'AB', '"新規"']) + '+' +
      sumifs('AH', oc, lc, ['AC', t, 'AB', '"移籍"']) +
    ')';
  }
  function bonusTier(t, c) {
    if (c.office === null) return offices.map(function(o) { return bonusForOffice(t, '"' + o + '"', null); }).join('+');
    return bonusForOffice(t, c.office, c.label);
  }
  function bonusTotal(c)  { return '(' + bonusTier(1, c) + '+' + bonusTier(2, c) + '+' + bonusTier(3, c) + ')'; }
  function cpnTotal(c) {
    return '(' + sumifs('T', c.office, c.label) + '+' + sumifs('U', c.office, c.label) + '+' + sumifs('V', c.office, c.label) + '+' + sumifs('W', c.office, c.label) + '+' + sumifs('X', c.office, c.label) + ')';
  }
  function taxIncl(c) { return 'ROUND((' + sumifs('Y', c.office, c.label) + '+' + bonusTotal(c) + '+' + cpnTotal(c) + ')*1.10,0)'; }
  function taxExcl(c) { return '(' + sumifs('Y', c.office, c.label) + '+' + bonusTotal(c) + '+' + cpnTotal(c) + ')'; }

  // --- KPI行定義（PL個社別と同一、達成人数・Tier別アクティブ数を追加） ---
  // section:true → ◆見出し行（黄背景）  isHead:true → 小見出し（斜体）  isPct:true → パーセント書式
  var kpiRows = [
    // ◆ 売上
    { label: '売上（税込　iriam請求書と一致）', section: true,
      fn: function(c) { return taxIncl(c); } },
    { label: '売上（税抜　CSV値合計）',
      fn: function(c) { return taxExcl(c); } },
    { label: '総応援ダイヤ数（既存ライバー除外）',
      fn: function(c) { return sumifsOuen('P', c.office, c.label); } },
    { label: '獲得pt数',
      fn: function(c) { return sumifs('I', c.office, c.label); } },

    // ◆ 投げ銭報酬（応援ダイヤ×Tier係数×成長補正）
    // 計算結果が iriam実額（請求書ベース）と一致することを目指す。実額の直接参照は不可。
    { label: '投げ銭報酬（応援ダイヤ×Tier係数）', section: true,
      fn: function(c) { return 'ROUND(' + bonusTotal(c) + ',0)'; } },
    { label: '　獲得pt数（Tier別）', isHead: true },
    { label: '　　Tier1（応援ダイヤ3万以上）',
      fn: function(c) { return sumifs('I', c.office, c.label, ['AC', 1]); } },
    { label: '　　Tier2（応援ダイヤ1万～3万未満）',
      fn: function(c) { return sumifs('I', c.office, c.label, ['AC', 2]); } },
    { label: '　　Tier3（応援ダイヤ1万未満）',
      fn: function(c) { return sumifs('I', c.office, c.label, ['AC', 3]); } },
    { label: '　応援ダイヤ Tier別（既存ライバー除外）', isHead: true },
    { label: '　　Tier1',
      fn: function(c) { return sumifsOuen('P', c.office, c.label, ['AC', 1]); } },
    { label: '　　Tier2',
      fn: function(c) { return sumifsOuen('P', c.office, c.label, ['AC', 2]); } },
    { label: '　　Tier3',
      fn: function(c) { return sumifsOuen('P', c.office, c.label, ['AC', 3]); } },
    { label: '　マネジメントフィー（Tier別ダイヤボーナス＝新規・移籍×Tier係数）', isHead: true },
    { label: '　　Tier1',
      fn: function(c) { return 'ROUND(' + bonusTier(1, c) + ',0)'; } },
    { label: '　　Tier2',
      fn: function(c) { return 'ROUND(' + bonusTier(2, c) + ',0)'; } },
    { label: '　　Tier3',
      fn: function(c) { return 'ROUND(' + bonusTier(3, c) + ',0)'; } },
    { label: '　時間ダイヤ（時給由来・プラットフォーム原資）',
      fn: function(c) { return sumifs('O', c.office, c.label); } },
    { label: '　ダイヤボーナス利率（マネジメントフィー÷応援ダイヤ）', isPct: true,
      fn: function(c) { return 'IFERROR(' + bonusTotal(c) + '/' + sumifsOuen('P', c.office, c.label) + ',0)'; } },
    { label: '　投げ銭平均額（応援ダイヤ÷登録ライバー数）',
      fn: function(c) { return 'IFERROR(' + sumifsOuen('P', c.office, c.label) + '/' + countifsRegistered(c.office, c.label) + ',0)'; } },
    { label: '　アクティブ平均金額（応援ダイヤ÷アクティブ数）',
      fn: function(c) { return 'IFERROR(' + sumifsOuen('P', c.office, c.label) + '/' + countifs(c.office, c.label, ['AD', 'TRUE']) + ',0)'; } },
    { label: '　　Tier1 平均ダイヤ金額',
      fn: function(c) { return 'IFERROR(' + sumifsOuen('P', c.office, c.label, ['AC', 1]) + '/' + countifs(c.office, c.label, ['AC', 1, 'AD', 'TRUE']) + ',0)'; } },
    { label: '　　Tier2 平均ダイヤ金額',
      fn: function(c) { return 'IFERROR(' + sumifsOuen('P', c.office, c.label, ['AC', 2]) + '/' + countifs(c.office, c.label, ['AC', 2, 'AD', 'TRUE']) + ',0)'; } },
    { label: '　　Tier3 平均ダイヤ金額',
      fn: function(c) { return 'IFERROR(' + sumifsOuen('P', c.office, c.label, ['AC', 3]) + '/' + countifs(c.office, c.label, ['AC', 3, 'AD', 'TRUE']) + ',0)'; } },

    // ◆ CPN報酬（達成人数を各CPN直後に追加）
    { label: 'C5：イラスト報酬（30日50時間達成、単価6万）', section: true,
      fn: function(c) { return sumifs('T', c.office, c.label); } },
    { label: '　C5：達成人数',
      fn: function(c) { return countifs(c.office, c.label, ['T', '">0"']); } },
    { label: '　C5：報酬利率（達成人数÷登録ライバー数）', isPct: true,
      fn: function(c) { return 'IFERROR(' + countifs(c.office, c.label, ['T', '">0"']) + '/' + countifsRegistered(c.office, c.label) + ',0)'; } },
    { label: '　C5：報酬単価合計（達成人数×6万）',
      fn: function(c) { return countifs(c.office, c.label, ['T', '">0"']) + '*VLOOKUP("C5",' + MCPN + '!A:B,2,FALSE)'; } },
    { label: 'B2：イラスト報酬（デビューB2到達応援CPN）',
      fn: function(c) { return sumifs('X', c.office, c.label); } },
    { label: '　B2：達成人数',
      fn: function(c) { return countifs(c.office, c.label, ['X', '">0"']); } },
    { label: '　B2：報酬利率（達成人数÷登録ライバー数）', isPct: true,
      fn: function(c) { return 'IFERROR(' + countifs(c.office, c.label, ['X', '">0"']) + '/' + countifsRegistered(c.office, c.label) + ',0)'; } },
    { label: '　B2：報酬単価合計（達成人数×7.5万）',
      fn: function(c) { return countifs(c.office, c.label, ['X', '">0"']) + '*VLOOKUP("B2",' + MCPN + '!A:B,2,FALSE)'; } },
    { label: 'A：Aランク報酬（A1ランク到達、単価4万）',
      fn: function(c) { return sumifs('U', c.office, c.label); } },
    { label: '　A：達成人数',
      fn: function(c) { return countifs(c.office, c.label, ['U', '">0"']); } },
    { label: '　A：報酬利率（達成人数÷登録ライバー数）', isPct: true,
      fn: function(c) { return 'IFERROR(' + countifs(c.office, c.label, ['U', '">0"']) + '/' + countifsRegistered(c.office, c.label) + ',0)'; } },
    { label: '　A：報酬単価合計（達成人数×4万）',
      fn: function(c) { return countifs(c.office, c.label, ['U', '">0"']) + '*VLOOKUP("A",' + MCPN + '!A:B,2,FALSE)'; } },
    { label: 'S：Sランク報酬（S1ランク到達、単価6万）',
      fn: function(c) { return sumifs('V', c.office, c.label); } },
    { label: '　S：達成人数',
      fn: function(c) { return countifs(c.office, c.label, ['V', '">0"']); } },
    { label: '　S：報酬利率（達成人数÷登録ライバー数）', isPct: true,
      fn: function(c) { return 'IFERROR(' + countifs(c.office, c.label, ['V', '">0"']) + '/' + countifsRegistered(c.office, c.label) + ',0)'; } },
    { label: '　S：報酬単価合計（達成人数×6万）',
      fn: function(c) { return countifs(c.office, c.label, ['V', '">0"']) + '*VLOOKUP("S",' + MCPN + '!A:B,2,FALSE)'; } },
    { label: 'その他報酬（配信応援CPN／デビューイラストCPN）',
      fn: function(c) { return sumifs('W', c.office, c.label); } },

    // ◆ レベシェ
    { label: 'レベシェ30%手数料（事務所ダイヤ合計、料率反映後の事務所取り分）', section: true,
      fn: function(c) { return sumifs('Y', c.office, c.label); } },
    { label: '　応援ダイヤ部分',
      fn: function(c) {
        var s = 'SUMPRODUCT((' + RAW + '!A2:A=' + MONTH + ')';
        if (c.office) s += '*(' + RAW + '!B2:B=' + c.office + ')';
        if (c.label)  s += '*(' + RAW + '!AK2:AK=' + c.label + ')';
        return s + '*' + RAW + '!P2:P*(1-' + RAW + '!AA2:AA/100))';
      } },
    { label: '　時間ダイヤ部分',
      fn: function(c) {
        var s = 'SUMPRODUCT((' + RAW + '!A2:A=' + MONTH + ')';
        if (c.office) s += '*(' + RAW + '!B2:B=' + c.office + ')';
        if (c.label)  s += '*(' + RAW + '!AK2:AK=' + c.label + ')';
        return s + '*' + RAW + '!O2:O*(1-' + RAW + '!AA2:AA/100))';
      } },

    // ◆ ライバー基盤（Tier別アクティブ数を追加）
    { label: '登録ライバー数（過去に1回でも配信したライバーの累計人数）', section: true,
      fn: function(c) { return countifsRegistered(c.office, c.label); } },
    { label: 'アクティブライバー数（当月配信日数>0）',
      fn: function(c) { return countifs(c.office, c.label, ['AD', 'TRUE']); } },
    { label: '　Tier1 アクティブ数',
      fn: function(c) { return countifs(c.office, c.label, ['AC', 1, 'AD', 'TRUE']); } },
    { label: '　Tier2 アクティブ数',
      fn: function(c) { return countifs(c.office, c.label, ['AC', 2, 'AD', 'TRUE']); } },
    { label: '　Tier3 アクティブ数',
      fn: function(c) { return countifs(c.office, c.label, ['AC', 3, 'AD', 'TRUE']); } },
    { label: '　アクティブ率（アクティブ÷登録）', isPct: true,
      fn: function(c) { return 'IFERROR(' + countifs(c.office, c.label, ['AD', 'TRUE']) + '/' + countifsRegistered(c.office, c.label) + ',0)'; } },
    { label: 'デビュー数（初回配信日時が当月内）',
      fn: function(c) { return countifs(c.office, c.label, ['AE', 'TRUE']); } },
    { label: '　C5達成率（当月デビュー組×30日以内）', isPct: true,
      fn: function(c) {
        var P = "'_ライバープロファイル'";
        var num = 'COUNTIFS(' + P + '!E:E,' + MONTH + ',' + P + '!H:H,"達成"';
        if (c.office) num += ',' + P + '!C:C,' + c.office;
        if (c.label)  num += ',' + P + '!D:D,' + c.label;
        num += ')';
        var den = 'COUNTIFS(' + P + '!E:E,' + MONTH;
        if (c.office) den += ',' + P + '!C:C,' + c.office;
        if (c.label)  den += ',' + P + '!D:D,' + c.label;
        den += ')';
        return 'IFERROR(' + num + '/' + den + ',0)';
      } },
    { label: '　C5達成数（当月デビュー組、30日以内達成）',
      fn: function(c) {
        var P = "'_ライバープロファイル'";
        var s = 'COUNTIFS(' + P + '!E:E,' + MONTH + ',' + P + '!H:H,"達成"';
        if (c.office) s += ',' + P + '!C:C,' + c.office;
        if (c.label)  s += ',' + P + '!D:D,' + c.label;
        return s + ')';
      } },
  ];

  // --- シート再構築 ---
  sumSh.clear();

  // タイトル（row 1）
  sumSh.getRange('A1').setValue('cozoru 経営ダッシュボード（PL個社別ビュー）')
    .setFontWeight('bold').setFontSize(13).setBackground('#1A237E').setFontColor('#FFFFFF');
  sumSh.getRange('B1:' + colNumToLetter_09_(1 + months.length) + '1').setBackground('#1A237E');

  // 月ヘッダー（row 2）: 文字列 "yyyy-MM" 形式で格納（RAW!A:A との SUMIFS 比較用）
  var hRow = [['KPI（▼セクション、→月別推移）'].concat(months)];
  sumSh.getRange(2, 1, 1, 1 + months.length).setValues(hRow)
    .setFontWeight('bold').setBackground('#334D80').setFontColor('#FFFFFF');
  sumSh.setFrozenRows(2);
  sumSh.setFrozenColumns(1);

  // --- セクション×KPI 書き込み（Pass 1: データ） ---
  var rowIdx = 3;
  var secHdrRows = [];
  var secKpiRows = [];
  var headRows = [];
  var pctRowArr = [];

  SECTIONS.forEach(function(sec) {
    // セクションヘッダー行
    secHdrRows.push(rowIdx);
    sumSh.getRange(rowIdx, 1).setValue('▼ ' + sec.header);
    rowIdx++;

    // KPIラベル一括書き込み
    sumSh.getRange(rowIdx, 1, kpiRows.length, 1)
      .setValues(kpiRows.map(function(k) { return [k.label]; }));

    // 数式マトリクス構築 & 一括書き込み
    var formulaMatrix = kpiRows.map(function(kpi) {
      if (!kpi.fn) return months.map(function() { return ''; });
      return months.map(function(m, mIdx) {
        var colLetter = colNumToLetter_09_(mIdx + 2);
        return '=' + kpi.fn(sec).replace(/\$B\$2/g, colLetter + '$2');
      });
    });
    sumSh.getRange(rowIdx, 2, kpiRows.length, months.length).setFormulas(formulaMatrix);

    // 書式行番号収集
    kpiRows.forEach(function(kpi, ki) {
      var r = rowIdx + ki;
      if (kpi.section) secKpiRows.push(r);
      if (kpi.isHead)  headRows.push(r);
      if (kpi.isPct)   pctRowArr.push(r);
    });

    rowIdx += kpiRows.length;
  });

  var lastDataRow = rowIdx - 1;
  var lastDataCol = 1 + months.length;

  // --- Pass 2: 書式適用（バッチ処理） ---

  // 全データ列: #,##0
  sumSh.getRange(3, 2, lastDataRow - 2, months.length).setNumberFormat('#,##0');

  // セクションヘッダー行: 濃緑
  secHdrRows.forEach(function(r) {
    sumSh.getRange(r, 1, 1, lastDataCol)
      .setFontWeight('bold').setBackground('#C8E6C9').setFontColor('#1B5E20').setFontSize(10);
  });

  // ◆KPI見出し行: 黄背景
  secKpiRows.forEach(function(r) {
    sumSh.getRange(r, 1, 1, lastDataCol).setBackground('#FCEDC7').setFontWeight('bold');
  });

  // 小見出し行（Tier別等）: 斜体グレー
  headRows.forEach(function(r) {
    sumSh.getRange(r, 1).setFontStyle('italic').setFontColor('#737373');
  });

  // パーセント書式
  pctRowArr.forEach(function(r) {
    sumSh.getRange(r, 2, 1, months.length).setNumberFormat('0.0%');
  });

  // 列幅
  sumSh.setColumnWidth(1, 420);
  for (var ci = 2; ci <= lastDataCol; ci++) sumSh.setColumnWidth(ci, 92);

  // 行高
  sumSh.setRowHeight(1, 28);
  sumSh.setRowHeight(2, 24);
  sumSh.setRowHeights(3, lastDataRow - 2, 21);

  Logger.log('rebuildSummary 完了: ' + SECTIONS.length + 'セクション × ' + kpiRows.length + 'KPI × ' + months.length + '月 = ' + (SECTIONS.length * kpiRows.length) + '行');
}

function rebuildByOffice() {
  Logger.log('rebuildByOffice: rebuildSummary に統合済み（スキップ）');
}
