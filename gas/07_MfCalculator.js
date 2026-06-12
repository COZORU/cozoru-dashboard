// MF/ダイヤボーナス 計算（2026-04-30 MTG結果反映、4源泉モデル対応）

// MF理論値計算（検証用）: 応援ダイヤ × 実MF率（ベース率＋月次ボーナス補正）
// officeMaster は { '事務所名': {t1,t2,t3,bonusMax,bonusMin}, ... }
// monthlyBonus は { 'YYYY-MM_事務所名': { class, actual }, ... }
// 月次ボーナスが未入力なら「基本」（補正0）として扱う
function calcMfTheoretical(ouenDia, tier, office, officeMaster, monthlyBonus, targetMonth) {
  if (tier === 4) return 0;
  var m = officeMaster[office];
  if (!m) return 0;
  var baseRate;
  if (tier === 1) baseRate = m.t1;
  else if (tier === 2) baseRate = m.t2;
  else if (tier === 3) baseRate = m.t3;
  else return 0;

  var correction = 0;
  if (monthlyBonus) {
    var key = targetMonth + '_' + office;
    var rec = monthlyBonus[key];
    if (rec && rec.class) {
      if (rec.class === '最高') correction = m.bonusMax || 0;
      else if (rec.class === '最低') correction = m.bonusMin || 0;
      // '基本' なら 0
    }
  }
  var actualRate = baseRate + correction;
  return Math.round(Number(ouenDia || 0) * actualRate);
}

// ダイヤボーナス Tier係数（成長判定区分による）
// ベース率（80/70/30）+ 補正値（最高+40 / 基本0 / 最低-30）
var DIA_BONUS_TIER_COEFS = {
  '最高': { 1: 1.20, 2: 1.10, 3: 0.70 },
  '基本': { 1: 0.80, 2: 0.70, 3: 0.30 },
  '最低': { 1: 0.50, 2: 0.40, 3: 0.00 },
};

// ダイヤボーナス算出（事務所×月単位）
// rows: RAW_ライバー月次の対象月×事務所行
// monthlyBonusClass: '最高' | '基本' | '最低'
// 戻り値: { tier1, tier2, tier3, total, capped, capExceeded }
function calcDiaBonus(rows, monthlyBonusClass) {
  var coefs = DIA_BONUS_TIER_COEFS[monthlyBonusClass] || DIA_BONUS_TIER_COEFS['基本'];
  var sums = { 1: 0, 2: 0, 3: 0 };  // 新規・移籍×Tier別の応援ダイヤ合計

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var type = r['配信者種別'] || r[27];  // RAW列28（インデックス27）
    if (CONFIG.DIA_BONUS_TARGET_TYPES.indexOf(type) < 0) continue;
    var tier = Number(r['Tier判定'] || r[28]);  // RAW列29（インデックス28）
    if (tier < 1 || tier > 3) continue;
    var ouenDia = Number(r['応援ダイヤ'] || r[15]);  // RAW列16（インデックス15）
    sums[tier] += ouenDia;
  }

  var bonusT1 = sums[1] * coefs[1];
  var bonusT2 = sums[2] * coefs[2];
  var bonusT3 = sums[3] * coefs[3];
  var rawTotal = bonusT1 + bonusT2 + bonusT3;
  var capped = Math.min(rawTotal, CONFIG.DIA_BONUS_MONTHLY_CAP);

  return {
    tier1Source: sums[1], tier2Source: sums[2], tier3Source: sums[3],
    tier1: Math.round(bonusT1),
    tier2: Math.round(bonusT2),
    tier3: Math.round(bonusT3),
    rawTotal: Math.round(rawTotal),
    total: Math.round(capped),
    capExceeded: rawTotal > CONFIG.DIA_BONUS_MONTHLY_CAP,
    capRemaining: Math.max(0, CONFIG.DIA_BONUS_MONTHLY_CAP - rawTotal),
    growthClass: monthlyBonusClass || '基本',
  };
}
