// エントリポイント: Driveを走査して新規CSVペアを処理
function processAll() {
  var pairs = findUnprocessedCsvPairs();
  var hasPairs = pairs.length > 0;
  if (!hasPairs) {
    appendLog_('INFO', '-', '-', '処理対象なし（月次）');
  }
  for (var i = 0; i < pairs.length; i++) {
    try {
      processPair_(pairs[i]);
    } catch (e) {
      appendLog_('ERROR', pairs[i].targetMonth, pairs[i].office, 'processPair failed: ' + e.message);
    }
  }

  // 日次CSV取込
  processDailyCsvs();

  rebuildDashboards_();
}

function processPair_(pair) {
  var sText = pair.streamingFile.getBlob().getDataAsString('UTF-8');
  var iText = pair.invoiceFile.getBlob().getDataAsString('UTF-8');
  var sRows = parseCsv(sText);
  var iRows = parseCsv(iText);
  var joined = joinByUserId(sRows, iRows);
  var count = upsertRawRows(joined, pair.targetMonth, pair.office, pair.streamingFile.getName());
  appendLog_('SUCCESS', pair.targetMonth, pair.office, count + '件を取込');
  moveToArchive_(pair.streamingFile, pair.targetMonth);
  moveToArchive_(pair.invoiceFile, pair.targetMonth);
}

function rebuildDashboards_() {
  try {
    // rebuildSummary();   // DB_サマリ廃止(2026-05): syncToPLはRAW最新月を直接参照
    rebuildByOffice();
    rebuildLiverProfile();
    rebuildC5Dashboard();
    rebuildGrowthForecast();
    rebuildProgressDashboard();
    rebuildLiverMonthly();
    syncToPL();            // PL(個社別) リーフセルへ書き込み
    applyPlBackgrounds();  // PL(個社別) 全体の色分け（実績/予測 × 自動/手入力）
  } catch (e) {
    appendLog_('ERROR', '-', '-', 'rebuildDashboards failed: ' + e.message);
  }
}

function appendLog_(level, targetMonth, office, message) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_LOG);
  sh.appendRow([new Date(), level, targetMonth, office, message]);
}
