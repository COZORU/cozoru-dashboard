// joined rows を RAW_ライバー月次 へ upsert
// 同 対象月×事務所×UserID は既存行を削除後に挿入（上書き）
// 2026-04-30 MTG結果反映: M_事務所マスタが8列構造（+ボーナス補正_最高/最低）に対応
function upsertRawRows(rows, targetMonth, office, sourceFilename) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_RAW);
  var cols = CONFIG.RAW_COLUMNS;
  var lastRow = sheet.getLastRow();
  var lastCol = cols.length;

  // 既存データから対象月×事務所の行を削除
  // 注: data[i][0] は Google Sheets により Date 型に自動変換される場合があるため正規化する
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var keepRows = [];
    for (var i = 0; i < data.length; i++) {
      var rowMonth = data[i][0] instanceof Date
        ? Utilities.formatDate(data[i][0], 'JST', 'yyyy-MM')
        : String(data[i][0]).substring(0, 7);
      if (!(rowMonth === targetMonth && data[i][1] === office)) {
        keepRows.push(data[i]);
      }
    }
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    if (keepRows.length > 0) {
      sheet.getRange(2, 1, keepRows.length, lastCol).setValues(keepRows);
    }
  }

  var officeMaster = loadOfficeMaster_(ss);
  var tierMaster = loadTierMaster_(ss);
  var rateMaster = loadRateMaster_(ss);
  var monthlyBonus = loadMonthlyBonusMaster_(ss);
  var labelMaster = loadLabelMaster_(ss);

  var now = new Date();
  var newRows = rows.map(function(r) {
    var ouenDia = Number(r['応援ダイヤ'] || 0);
    var jikanDia = Number(r['時間ダイヤ'] || 0);
    var total = ouenDia + jikanDia;
    // Tier判定は **応援ダイヤ基準**（4/30 MTG後の検証でiriam仕様と確定）
    var tier = classifyTier(ouenDia, tierMaster.t1, tierMaster.t2);
    var active = isActive(r['配信日数']);
    var debut = isDebut(r['初回配信日時'], targetMonth);
    var newC = isNewContract(r['オーガナイザー登録日'], targetMonth);
    var levTarget = isLevShareTarget(r['ライバーダイヤ料率'], rateMaster.levShareRyoritsu);
    // MF理論値: 実MF率（ベース率＋月次ボーナス補正）× 応援ダイヤ
    var mfTheory = calcMfTheoretical(ouenDia, tier, office, officeMaster, monthlyBonus, targetMonth);

    return [
      targetMonth, office, r['User ID'], r['アカウント名'], r['レーベル名'],
      r['オーガナイザー登録日'], r['初回配信日時'],
      num(r['応援ポイント']), num(r['獲得ポイント']),
      num(r['配信回数']), num(r['配信日数']), num(r['総配信時間']),
      num(r['平均視聴数']), num(r['課金者数']),
      num(r['時間ダイヤ']), num(r['応援ダイヤ']), total,
      r['ランク'], num(r['ダイヤボーナス']),
      num(r['30日50時間C5到達CPN達成報酬金額']),
      num(r['ランク到達CPN(A1)報酬金額']),
      num(r['ランク到達CPN(S1)報酬金額']),
      num(r['デビューイラストCPN達成報酬金額']),
      num(r['デビューランクCPN達成報酬金額']),
      num(r['事務所ダイヤ']), num(r['ライバーダイヤ']),
      num(r['ライバーダイヤ料率']),
      r['配信者種別'],
      tier, active, debut, newC, levTarget, mfTheory,
      now, sourceFilename,
      normalizeLabel_(office, r['レーベル名'], labelMaster)
    ];
  });

  var startRow = sheet.getLastRow() + 1;
  if (newRows.length > 0) {
    sheet.getRange(startRow, 1, newRows.length, lastCol).setValues(newRows);
  }
  return newRows.length;
}

function num(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

// M_事務所 を読み込む（4/30 MTG後の8列構造に対応）
// 列: 事務所名, 表示名, アクティブ, MF率_T1, MF率_T2, MF率_T3, ボーナス補正_最高, ボーナス補正_最低
function loadOfficeMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  var rows = sh.getRange(2, 1, lastRow - 1, 8).getValues();
  var m = {};
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i][0];
    if (!name) continue;
    m[name] = {
      displayName: rows[i][1],
      active: rows[i][2],
      t1: Number(rows[i][3]),
      t2: Number(rows[i][4]),
      t3: Number(rows[i][5]),
      bonusMax: Number(rows[i][6]),  // 最高ボーナス補正（+0.40）
      bonusMin: Number(rows[i][7]),  // 最低ボーナス補正（-0.30）
    };
  }
  return m;
}

function loadTierMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_TIER);
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var m = { t1: 30000, t2: 10000 };
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'Tier1_合計ダイヤ以上') m.t1 = Number(rows[i][1]);
    if (rows[i][0] === 'Tier2_合計ダイヤ以上') m.t2 = Number(rows[i][1]);
  }
  return m;
}

// レベシェア対象判定の閾値（M_料率シート廃止により固定値化、4/30 MTG後）
// 料率70=レベシェア対象。CSV「ライバーダイヤ料率」列の値で自動判定
function loadRateMaster_(ss) {
  return { levShareRyoritsu: 70 };
}

// M_月次ボーナス を読み込む（4/30 MTG後の新マスタ）
// 列: 年月, 事務所名, 区分（最高/基本/最低）, iriam実額（任意）
// 戻り値: { 'YYYY-MM_事務所名': { class: '最高'|'基本'|'最低', actual: number } }
function loadMonthlyBonusMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_MONTHLY_BONUS);
  if (!sh) return {};
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  var rows = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  var m = {};
  for (var i = 0; i < rows.length; i++) {
    var ym = rows[i][0];
    var office = rows[i][1];
    if (!ym || !office) continue;
    var ymStr;
    if (ym instanceof Date) {
      ymStr = Utilities.formatDate(ym, 'JST', 'yyyy-MM');
    } else {
      ymStr = String(ym).substring(0, 7);
    }
    m[ymStr + '_' + office] = {
      class: rows[i][2] || '基本',
      actual: Number(rows[i][3] || 0),
    };
  }
  return m;
}

// M_レーベル を読み込む（事務所別: { subLabel: displayName, __default__: ... }）
function loadLabelMaster_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEET_M_LABEL);
  if (!sh) return {};
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  var rows = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  var m = {};
  for (var i = 0; i < rows.length; i++) {
    var office = rows[i][0];
    var subLabel = rows[i][1];
    var displayName = rows[i][2];
    if (!office || !subLabel || !displayName) continue;
    if (!m[office]) m[office] = {};
    m[office][subLabel] = displayName;
  }
  return m;
}

// レーベル名を正規化（マスタなし→そのまま、__default__→デフォルト分類）
function normalizeLabel_(office, rawLabel, labelMaster) {
  var officeLabels = labelMaster[office];
  if (!officeLabels) return rawLabel;
  if (officeLabels[rawLabel]) return officeLabels[rawLabel];
  if (officeLabels['__default__']) return officeLabels['__default__'];
  return rawLabel;
}
