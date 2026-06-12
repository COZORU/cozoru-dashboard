// Tier分類: **応援ダイヤ**で 3万↑=1 / 1万↑=2 / >0=3 / ==0=4
// 注：時間ダイヤは Tier判定に含めない（iriam仕様、4/30 MTG後の検証で確定）
function classifyTier(ouenDia, t1Th, t2Th) {
  var n = Number(ouenDia) || 0;
  if (n >= t1Th) return 1;
  if (n >= t2Th) return 2;
  if (n > 0) return 3;
  return 4; // 売上ゼロ
}

// アクティブ判定: 配信日数>0
function isActive(haishinNissu) {
  return Number(haishinNissu) > 0;
}

// デビュー判定: 初回配信日時の年月が対象月と一致
function isDebut(shokaiHaishinDate, targetMonthYmm) {
  if (!shokaiHaishinDate) return false;
  var s = String(shokaiHaishinDate);
  var m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return (m[1] + '-' + m[2]) === targetMonthYmm;
}

// 新規獲得判定: オーガナイザー登録日の年月が対象月と一致
function isNewContract(tourokuDate, targetMonthYmm) {
  if (!tourokuDate) return false;
  var s = String(tourokuDate);
  var m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return (m[1] + '-' + m[2]) === targetMonthYmm;
}

// レベシェア対象判定: ライバーダイヤ料率 が指定閾値と一致
function isLevShareTarget(raibaaRyoritsu, threshold) {
  var n = Number(raibaaRyoritsu);
  if (!isFinite(n)) return false;
  return n === threshold;
}
