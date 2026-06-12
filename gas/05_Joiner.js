// streamingをベースにinvoiceの列をUser IDでLEFT JOINで付加
// invoiceのみに存在する行は現状捨てる（異常データ）
function joinByUserId(streamingRows, invoiceRows) {
  var invoiceMap = {};
  for (var i = 0; i < invoiceRows.length; i++) {
    var inv = invoiceRows[i];
    if (inv['User ID']) invoiceMap[inv['User ID']] = inv;
  }
  var result = [];
  for (var j = 0; j < streamingRows.length; j++) {
    var s = streamingRows[j];
    var inv = invoiceMap[s['User ID']] || {};
    var merged = {};
    // streamingのキーをコピー
    for (var k in s) if (s.hasOwnProperty(k)) merged[k] = s[k];
    // invoiceで上書き（ただし共通キー以外）
    var addKeys = [
      'ダイヤボーナス率', 'ダイヤボーナス',
      '30日50時間C5到達CPN達成報酬金額',
      'ランク到達CPN(A1)報酬金額',
      'ランク到達CPN(S1)報酬金額',
      'デビューイラストCPN達成報酬金額',
      'デビューランクCPN達成報酬金額',
      '合計ダイヤ', '事務所ダイヤ', 'ライバーダイヤ',
      'ライバーダイヤ料率', '配信者種別', '累計配信日数'
    ];
    for (var m = 0; m < addKeys.length; m++) {
      var key = addKeys[m];
      merged[key] = inv[key] !== undefined ? inv[key] : '';
    }
    result.push(merged);
  }
  return result;
}
