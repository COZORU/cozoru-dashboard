// 12_C5Dashboard.gs
// DB_新人C5達成率：レーベル別の月次推移（デビュー数 / C5達成数 / 達成率の3点セット）
// CSV取込時に自動再構築 → 新月のCSVを追加すれば列も自動で増える
function rebuildC5Dashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var profileSh = ss.getSheetByName('_ライバープロファイル');
  var labelSh = ss.getSheetByName(CONFIG.SHEET_M_LABEL);
  if (!profileSh || profileSh.getLastRow() < 2) {
    Logger.log('rebuildC5Dashboard: _ライバープロファイル が無い/空');
    return;
  }

  // _ライバープロファイル 読込
  var profiles = profileSh.getRange(2, 1, profileSh.getLastRow() - 1, 8).getValues().map(function(row) {
    return { office: row[2], label: row[3] || '(不明)', debutMonth: String(row[4] || '').substring(0, 7) };
  });

  // 月一覧
  var monthSet = {};
  profiles.forEach(function(p) { if (p.debutMonth) monthSet[p.debutMonth] = true; });
  var allMonths = Object.keys(monthSet).sort();
  if (allMonths.length === 0) { Logger.log('rebuildC5Dashboard: デビュー記録なし'); return; }
  var latestMonth = allMonths[allMonths.length - 1];
  var confirmedMonths = allMonths.slice(0, -1);

  // 事務所一覧
  var officeSet = {};
  profiles.forEach(function(p) { if (p.office) officeSet[p.office] = true; });
  var offices = Object.keys(officeSet).sort();

  // レーベル一覧（事務所別）
  var labelsByOffice = {};
  offices.forEach(function(o) { labelsByOffice[o] = {}; });
  profiles.forEach(function(p) { if (p.office && p.label && labelsByOffice[p.office]) labelsByOffice[p.office][p.label] = true; });

  // M_レーベル のソート順
  var labelOrder = {};
  if (labelSh && labelSh.getLastRow() >= 2) {
    var lr = labelSh.getRange(2, 1, labelSh.getLastRow() - 1, 4).getValues();
    lr.forEach(function(row) {
      var off = row[0]; var disp = row[2]; var ord = Number(row[3]);
      if (!off || !disp) return;
      if (!labelOrder[off]) labelOrder[off] = {};
      if (labelOrder[off][disp] === undefined) labelOrder[off][disp] = ord;
    });
  }

  // 既存シート削除→新規作成（フォーマット完全クリーン）
  var oldSh = ss.getSheetByName('DB_新人C5達成率');
  if (oldSh) ss.deleteSheet(oldSh);
  var sh = ss.insertSheet('DB_新人C5達成率');
  // 列数: 事務所(1) + レーベル(1) + 確定月数 × 3 + 平均/デビュー計/C5計(3)
  var numCols = 2 + confirmedMonths.length * 3 + 3;

  // 数式ヘルパー
  var P = "'_ライバープロファイル'";
  function debutCount(oRef, lRef, mRef) { return 'COUNTIFS(' + P + '!E:E,' + mRef + ',' + P + '!C:C,' + oRef + ',' + P + '!D:D,' + lRef + ')'; }
  function c5Count(oRef, lRef, mRef) { return 'COUNTIFS(' + P + '!E:E,' + mRef + ',' + P + '!C:C,' + oRef + ',' + P + '!D:D,' + lRef + ',' + P + '!H:H,"達成")'; }
  function allDebut(mRef) { return 'COUNTIFS(' + P + '!E:E,' + mRef + ')'; }
  function allC5(mRef) { return 'COUNTIFS(' + P + '!E:E,' + mRef + ',' + P + '!H:H,"達成")'; }

  // データ構築
  var data = [];
  data.push(['DB_新人C5達成率（デビュー後30日以内にC5「30日50時間達成」へ到達できた割合、レーベル別月次推移）']);
  data.push(['※ 新人がプロライバーとして立ち上がっているかを測る、育成プロセスの成功率KPI']);
  data.push(['※ サマリ→ドリルダウン構造：DB_サマリで全体を確認 → 気になったらこのシートで時系列を確認']);
  data.push([]);

  // ヘッダー1段目（合計・平均が最左）
  var head1 = ['', '', '合計・平均', '', ''];
  confirmedMonths.forEach(function(m) { head1.push("'" + m, '', ''); });
  data.push(head1);

  // ヘッダー2段目
  var head2 = ['事務所', 'レーベル(カテゴリ)', '平均達成率', 'デビュー計', 'C5達成計'];
  confirmedMonths.forEach(function() { head2.push('デビュー数', 'C5達成数', '達成率'); });
  data.push(head2);

  var dataStartRow = data.length;  // 0-indexed開始行

  offices.forEach(function(off) {
    var oRef = '"' + off + '"';
    var labels = Object.keys(labelsByOffice[off]).sort(function(a, b) {
      var oa = (labelOrder[off] || {})[a] !== undefined ? labelOrder[off][a] : 999;
      var ob = (labelOrder[off] || {})[b] !== undefined ? labelOrder[off][b] : 999;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
    labels.forEach(function(label) {
      var lRef = '"' + label.replace(/"/g, '""') + '"';
      var dSum = confirmedMonths.map(function(m) { return debutCount(oRef, lRef, '"' + m + '"'); }).join('+');
      var cSum = confirmedMonths.map(function(m) { return c5Count(oRef, lRef, '"' + m + '"'); }).join('+');
      var row = [off, label,
        '=IFERROR((' + cSum + ')/(' + dSum + '),0)',
        '=' + dSum,
        '=' + cSum
      ];
      confirmedMonths.forEach(function(m) {
        var mRef = '"' + m + '"';
        row.push('=' + debutCount(oRef, lRef, mRef));
        row.push('=' + c5Count(oRef, lRef, mRef));
        row.push('=IFERROR(' + c5Count(oRef, lRef, mRef) + '/' + debutCount(oRef, lRef, mRef) + ',0)');
      });
      data.push(row);
    });
  });

  // 全体行
  var dSumAll = confirmedMonths.map(function(m) { return allDebut('"' + m + '"'); }).join('+');
  var cSumAll = confirmedMonths.map(function(m) { return allC5('"' + m + '"'); }).join('+');
  var allRow = ['', '全体（合算）',
    '=IFERROR((' + cSumAll + ')/(' + dSumAll + '),0)',
    '=' + dSumAll,
    '=' + cSumAll
  ];
  confirmedMonths.forEach(function(m) {
    var mRef = '"' + m + '"';
    allRow.push('=' + allDebut(mRef));
    allRow.push('=' + allC5(mRef));
    allRow.push('=IFERROR(' + allC5(mRef) + '/' + allDebut(mRef) + ',0)');
  });
  data.push(allRow);
  var dataEndRow = data.length;  // 0-indexed終了行（exclusive）

  // 集計中
  data.push([]);
  data.push(['【最新月 ' + latestMonth + ' デビュー組（集計中、翌月のT列確定後に判定）】']);
  data.push(['事務所', 'レーベル(カテゴリ)', latestMonth + ' デビュー数', '判定状況']);
  offices.forEach(function(off) {
    var oRef = '"' + off + '"';
    var labels = Object.keys(labelsByOffice[off]).sort(function(a, b) {
      var oa = (labelOrder[off] || {})[a] !== undefined ? labelOrder[off][a] : 999;
      var ob = (labelOrder[off] || {})[b] !== undefined ? labelOrder[off][b] : 999;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
    labels.forEach(function(label) {
      var lRef = '"' + label.replace(/"/g, '""') + '"';
      data.push([off, label, '=' + debutCount(oRef, lRef, '"' + latestMonth + '"'), '集計中']);
    });
  });

  // 値書込（行ごとに長さを numCols に揃える）
  var paddedData = data.map(function(row) {
    var r = row.slice();
    while (r.length < numCols) r.push('');
    if (r.length > numCols) r = r.slice(0, numCols);
    return r;
  });
  sh.getRange(1, 1, paddedData.length, numCols).setValues(paddedData);

  // フォーマット
  sh.getRange(1, 1, 1, numCols).setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1, 2, numCols).setFontStyle('italic').setFontColor('#737373');
  sh.getRange(5, 1, 1, numCols).setBackground('#FCEDC7').setFontWeight('bold').setHorizontalAlignment('CENTER');
  sh.getRange(6, 1, 1, numCols).setBackground('#334D80').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('CENTER');
  sh.getRange(dataEndRow, 1, 1, numCols).setBackground('#EBF0FA').setFontWeight('bold');

  // 達成率列を％フォーマット & 条件付き書式
  // 列順: 事務所(1)/レーベル(2)/平均達成率(3)/デビュー計(4)/C5達成計(5)/月別(6,7,8=月1)/...（1-indexed）
  var rateCols = [3];  // 平均達成率列
  for (var i = 0; i < confirmedMonths.length; i++) rateCols.push(5 + i * 3 + 3);  // 各月の達成率列: 8, 11, 14, ...

  rateCols.forEach(function(c) {
    sh.getRange(dataStartRow + 1, c, dataEndRow - dataStartRow, 1).setNumberFormat('0.0%');
  });

  // 列幅
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 240);
  for (var j = 3; j <= numCols; j++) sh.setColumnWidth(j, 90);

  // 固定行＆列
  sh.setFrozenRows(6);
  sh.setFrozenColumns(2);

  // タブ色（メイン閲覧 = 緑）
  sh.setTabColor('#4FAB4F');

  // 条件付き書式（達成率列を3段階で色分け）
  var rules = [];
  rateCols.forEach(function(c) {
    var range = sh.getRange(dataStartRow + 1, c, dataEndRow - dataStartRow, 1);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(0.5).setBackground('#A0D196').setRanges([range]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(0.3, 0.4999).setBackground('#FFE699').setRanges([range]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.3).setBackground('#F5BFBF').setRanges([range]).build());
  });
  sh.setConditionalFormatRules(rules);

  Logger.log('rebuildC5Dashboard done: ' + offices.length + '事務所, ' + confirmedMonths.length + '確定月');
}
