// CSV を行配列に分解。最初の行をヘッダーとしてキー付きオブジェクト配列を返す
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); // BOM除去
  var lines = text.split(/\r?\n/).filter(function(l) { return l.length > 0; });
  if (lines.length < 2) return [];
  var headers = splitCsvLine_(lines[0]);
  return lines.slice(1).map(function(line) {
    var cols = splitCsvLine_(line);
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = cols[i] !== undefined ? cols[i] : '';
    }
    return obj;
  });
}

// CSV行をカンマ分割（クォート対応）
function splitCsvLine_(line) {
  var out = [];
  var cur = '';
  var inQuote = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ファイル名からオーガナイザー名を抽出
// 例: "20260301_20260331_streaming_report_株式会社cozoru.csv" → "株式会社cozoru"
// ブラウザ重複DLの " (1)", " (2)" 等のサフィックスは自動除去
// iriam の正式名と cozoru_dashboard 内部表記の差を正規化
function extractOrganizerFromFilename(filename) {
  var m = filename.match(/(?:streaming_report|monthly_invoice_report)_(.+?)\.csv$/);
  if (!m) return null;
  var raw = m[1].replace(/\s*\(\d+\)\s*$/, '').trim();
  return normalizeOfficeName_(raw);
}

// 事務所名の正規化
// iriam ファイル名上の表記 → cozoru_dashboard 内部表記
function normalizeOfficeName_(name) {
  var MAP = {
    '株式会社ライブナウ': 'ライブナウV'
    // 他の事務所が必要になれば追加
  };
  return MAP[name] || name;
}

// ファイル名から対象月（YYYY-MM）を抽出
// iriamは月によって命名規則が変動:
//   streaming (full range):  "20260301_20260331_streaming_report_xxx.csv"
//   streaming (month only):  "202601_streaming_report_xxx.csv"
//   invoice:                 "202603_monthly_invoice_report_xxx.csv"
function extractTargetMonth(filename) {
  // Pattern 1: YYYYMMDD_YYYYMMDD_streaming_report_ （2日付範囲形式）
  var m1 = filename.match(/^(\d{4})(\d{2})\d{2}_\d{8}_streaming_report_/);
  if (m1) return m1[1] + '-' + m1[2];
  // Pattern 2: YYYYMM_... （月のみ形式。streaming/invoice両対応）
  var m2 = filename.match(/^(\d{4})(\d{2})_(?:streaming_report|monthly_invoice_report)_/);
  if (m2) return m2[1] + '-' + m2[2];
  return null;
}

// ファイル名からCSV種別を判定
function detectCsvKind(filename) {
  if (/streaming_report_/.test(filename)) return 'streaming';
  if (/monthly_invoice_report_/.test(filename)) return 'invoice';
  return null;
}
