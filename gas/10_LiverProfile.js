// 10_LiverProfile.gs
// _ライバープロファイル シートを生成
// 各ライバー（User ID単位）のデビュー月・C5達成月・30日以内達成フラグを算出
// CSV取込時に自動再構築 → DB_コホート分析がSheets関数で即時集計される
function rebuildLiverProfile() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSh = ss.getSheetByName(CONFIG.SHEET_RAW);
  var profileSh = ss.getSheetByName('_ライバープロファイル');
  if (!profileSh) {
    profileSh = ss.insertSheet('_ライバープロファイル');
  }

  var rawLastRow = rawSh.getLastRow();
  if (rawLastRow < 2) { Logger.log('rebuildLiverProfile: RAWが空'); return; }
  var rawData = rawSh.getRange(2, 1, rawLastRow - 1, 37).getValues();

  // User IDでグループ化、各ライバーのデビュー月・C5達成月を抽出
  var profiles = {};
  rawData.forEach(function(row) {
    var month = toYYYYMM_(row[0]);    // A: 対象月
    var office = row[1];               // B: 事務所名
    var userId = row[2];               // C: User ID
    var accountName = row[3];          // D: アカウント名
    var akLabel = row[36] || '(不明)'; // AK: カテゴリ表示名
    var c5 = Number(row[19] || 0);     // T: C5報酬
    var debutFlag = row[30];           // AE: デビュー判定

    if (!userId) return;
    if (!profiles[userId]) {
      profiles[userId] = {
        userId: userId, accountName: accountName, office: office,
        label: akLabel, debutMonth: null, c5Month: null,
      };
    }
    var p = profiles[userId];
    if (akLabel) p.label = akLabel;
    // デビュー月: AE=TRUEの月のうち最初のもの
    if (debutFlag === true || debutFlag === 'TRUE') {
      if (!p.debutMonth || month < p.debutMonth) p.debutMonth = month;
    }
    // C5達成月: T>0 の月のうち最初のもの
    if (c5 > 0) {
      if (!p.c5Month || month < p.c5Month) p.c5Month = month;
    }
  });

  // 各ライバーの30日以内達成判定（同月 or 翌月達成 = 月差0 or 1）
  var rows = [];
  for (var uid in profiles) {
    var p = profiles[uid];
    var diff = (p.debutMonth && p.c5Month) ? monthDiff_(p.debutMonth, p.c5Month) : '';
    var within = (p.debutMonth && p.c5Month && diff >= 0 && diff <= 1) ? '達成' : (p.debutMonth ? '未達成' : '');
    rows.push([
      p.userId, p.accountName, p.office, p.label,
      p.debutMonth || '', p.c5Month || '', diff, within,
    ]);
  }

  // シート全クリア＆書込（USER_ENTEREDだと"2026-01"が日付解釈されるため、setValuesでRAW相当）
  profileSh.clear();
  var header = ['User ID', 'アカウント名', '事務所', 'レーベル(カテゴリ)', 'デビュー月', 'C5達成月', '達成までの月数', '30日以内達成'];
  var allRows = [header].concat(rows);
  profileSh.getRange(1, 1, allRows.length, 8).setValues(allRows);

  // ヘッダー書式＆固定行
  profileSh.getRange(1, 1, 1, 8).setBackground('#334D80').setFontColor('#FFFFFF').setFontWeight('bold');
  profileSh.setFrozenRows(1);
  // E列・F列を文字列強制（"2026-01"が日付解釈されないように）
  profileSh.getRange(2, 5, rows.length, 2).setNumberFormat('@');

  Logger.log('rebuildLiverProfile done: ' + rows.length + '件');
}

// YYYY-MM 形式への変換（シリアル日付・Date・文字列対応）
function toYYYYMM_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    return value.getFullYear() + '-' + ('0' + (value.getMonth() + 1)).slice(-2);
  }
  if (typeof value === 'number') {
    var ms = Date.UTC(1899, 11, 30) + value * 86400000;
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }
  return String(value).substring(0, 7);
}

// 月差（YYYY-MM 形式）
function monthDiff_(m1, m2) {
  if (!m1 || !m2) return -1;
  var s1 = String(m1).substring(0, 7).split('-');
  var s2 = String(m2).substring(0, 7).split('-');
  var y1 = Number(s1[0]), mo1 = Number(s1[1]);
  var y2 = Number(s2[0]), mo2 = Number(s2[1]);
  if (isNaN(y1) || isNaN(mo1) || isNaN(y2) || isNaN(mo2)) return -1;
  return (y2 - y1) * 12 + (mo2 - mo1);
}
