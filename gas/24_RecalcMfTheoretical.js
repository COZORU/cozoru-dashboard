// 24_RecalcMfTheoretical.gs
// 既存 RAW_ライバー月次 の AH列「MF理論値」を再計算する
//
// 用途:
//   M_月次ボーナス（区分:最高/基本/最低）を後から変更した場合、
//   AH列が古い区分のままになるため、再計算が必要。
//   メニュー「② ダッシュボードのみ再構築」内で自動呼び出される。
//
// 計算式:
//   MF理論値 = ROUND(応援ダイヤ × (基本MF率 + 月次ボーナス補正))
//   tier=4（応援ダイヤ=0）は 0
//
// 仕様:
//   - 全RAW行を一括再計算（差分判定なし）
//   - M_月次ボーナス・M_事務所 マスタを最新で読み直す
//   - 区分未入力（=未登録）は「基本」（補正0）として扱う

function recalcMfTheoreticalInRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_RAW);
  if (!sh) {
    Logger.log('!! RAW シートが見つかりません');
    return;
  }

  var lastRow = sh.getLastRow();
  if (lastRow < 2) {
    Logger.log('RAW データなし');
    return;
  }

  // マスタを最新で再読込
  var officeMaster = loadOfficeMaster_(ss);
  var monthlyBonus = loadMonthlyBonusMaster_(ss);

  // 必要列だけ取得（A=対象月, B=事務所, P=応援ダイヤ(16番目), AC=Tier(29番目), AH=MF理論値(34番目)）
  var n = lastRow - 1;
  var monthCol  = sh.getRange(2, 1, n, 1).getValues();    // A列
  var officeCol = sh.getRange(2, 2, n, 1).getValues();    // B列
  var ouenCol   = sh.getRange(2, 16, n, 1).getValues();   // P列（応援ダイヤ）
  var tierCol   = sh.getRange(2, 29, n, 1).getValues();   // AC列（Tier判定）

  var newMfValues = new Array(n);
  var changed = 0;

  // 現在のAH列値を取得して比較（変化件数集計用）
  var oldMfCol = sh.getRange(2, 34, n, 1).getValues();    // AH列

  for (var i = 0; i < n; i++) {
    var ym = monthCol[i][0];
    var ymStr;
    if (ym instanceof Date) {
      ymStr = Utilities.formatDate(ym, 'JST', 'yyyy-MM');
    } else {
      ymStr = String(ym || '').substring(0, 7);
    }
    var office = officeCol[i][0];
    var ouenDia = Number(ouenCol[i][0]) || 0;
    var tier = Number(tierCol[i][0]) || 4;

    var mf = calcMfTheoretical(ouenDia, tier, office, officeMaster, monthlyBonus, ymStr);
    newMfValues[i] = [mf];

    var oldMf = Number(oldMfCol[i][0]) || 0;
    if (oldMf !== mf) changed++;
  }

  // AH列を一括書込
  sh.getRange(2, 34, n, 1).setValues(newMfValues);

  Logger.log('recalcMfTheoreticalInRaw 完了: ' + n + ' 行のうち ' + changed + ' 行が変化');
  return { total: n, changed: changed };
}
