// Drive の input フォルダから未処理のCSVペアを検出
// 戻り値: [{targetMonth, office, streamingFile, invoiceFile}, ...]
function findUnprocessedCsvPairs() {
  var folder = getFolderByName_(CONFIG.INPUT_FOLDER);
  if (!folder) {
    Logger.log('INPUT_FOLDER not found: ' + CONFIG.INPUT_FOLDER);
    return [];
  }

  var files = folder.getFiles();
  var indexed = {}; // key = targetMonth + '|' + office, value = {streaming, invoice}

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (!/\.csv$/i.test(name)) continue;
    var kind = detectCsvKind(name);
    var office = extractOrganizerFromFilename(name);
    var ym = extractTargetMonth(name);
    if (!kind || !office || !ym) continue;
    var key = ym + '|' + office;
    if (!indexed[key]) indexed[key] = { targetMonth: ym, office: office, streaming: null, invoice: null };
    if (kind === 'streaming') indexed[key].streaming = f;
    else if (kind === 'invoice') indexed[key].invoice = f;
  }

  var pairs = [];
  for (var k in indexed) {
    var x = indexed[k];
    if (x.streaming && x.invoice) {
      pairs.push({
        targetMonth: x.targetMonth,
        office: x.office,
        streamingFile: x.streaming,
        invoiceFile: x.invoice
      });
    }
  }
  return pairs;
}

// Drive の input フォルダから未処理の日次CSVを検出
// 戻り値: [{endDate, targetMonth, office, file}, ...]
// ファイル名形式: YYYYMMDD_YYYYMMDD_streaming_report_<office>.csv
function findUnprocessedDailyCsvs() {
  var folder = getFolderByName_(CONFIG.INPUT_FOLDER);
  if (!folder) return [];

  var RE = /^(\d{4})(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})_streaming_report_(.+?)\.csv$/i;
  var results = [];
  var files = folder.getFiles();

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    var m = RE.exec(name);
    if (!m) continue;
    // m[4..6] = 集計終了日の年月日
    var endDate = m[4] + '-' + m[5] + '-' + m[6]; // yyyy-MM-dd
    var targetMonth = m[4] + '-' + m[5];           // yyyy-MM
    var office = m[7];
    results.push({ endDate: endDate, targetMonth: targetMonth, office: office, file: f });
  }
  return results;
}

// フォルダ検索: PARENT_FOLDER が設定されていればその配下を検索、なければルート検索
function getFolderByName_(name) {
  if (CONFIG.PARENT_FOLDER && CONFIG.PARENT_FOLDER.length > 0) {
    var pit = DriveApp.getFoldersByName(CONFIG.PARENT_FOLDER);
    if (!pit.hasNext()) return null;
    var parent = pit.next();
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : null;
  } else {
    var rit = DriveApp.getFoldersByName(name);
    return rit.hasNext() ? rit.next() : null;
  }
}

function moveToArchive_(file, targetMonth) {
  var root = getFolderByName_(CONFIG.ARCHIVE_FOLDER);
  if (!root) {
    // archive フォルダが無ければ親配下に作成
    var parent = null;
    if (CONFIG.PARENT_FOLDER && CONFIG.PARENT_FOLDER.length > 0) {
      var pit = DriveApp.getFoldersByName(CONFIG.PARENT_FOLDER);
      if (pit.hasNext()) parent = pit.next();
    }
    root = parent ? parent.createFolder(CONFIG.ARCHIVE_FOLDER) : DriveApp.createFolder(CONFIG.ARCHIVE_FOLDER);
  }
  var monthFolder = null;
  var it = root.getFoldersByName(targetMonth);
  if (it.hasNext()) monthFolder = it.next();
  else monthFolder = root.createFolder(targetMonth);
  file.moveTo(monthFolder);
}
