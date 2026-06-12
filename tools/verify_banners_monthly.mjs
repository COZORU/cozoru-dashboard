// 本番GASの monthly を検証: 内部整合 + 回別4週合算と5月分を突合
import assert from 'node:assert';
const EXEC = 'https://script.google.com/macros/s/AKfycbx97ckfoqqvD7Ozl834rPVChYmPuNBmbWlwnJMMLKWfYXB0ktgsE3kKznpvw7OjRjeg/exec';

const j = await (await fetch(`${EXEC}?action=banners`)).json();
const b = j?.data?.banners;
if (!b) { console.log('BAD_RESPONSE'); process.exit(2); }
const m = b.monthly;
if (!m) { console.log('NG: monthly なし（owner再デプロイが未完了の可能性）'); process.exit(1); }

console.log('baseMonth:', m.baseMonth);
console.log('months:', JSON.stringify(m.months));
console.log('allMonths:', m.allMonths.length, '件:', m.allMonths[0], '〜', m.allMonths[m.allMonths.length - 1]);
console.log('byOrg:', m.byOrg.length, '/ byLabel:', m.byLabel.length, '/ byLiver:', m.byLiver.length);
console.log('summary:', JSON.stringify(m.summary));
console.log('trend:');
m.trend.forEach(t => console.log(`  ${t.month}: 回${t.eventCount} 参加${t.joinCount} 入賞${t.winCount} (${t.winRate}%) pt=${t.ptSum.toLocaleString()}`));

// 内部整合1: byOrg 最新月合計 = summary
const sum = (arr, f) => arr.reduce((s, e) => s + f(e.monthly[0]), 0);
assert.strictEqual(sum(m.byOrg, c => c.joinCount), m.summary.joinCount, 'byOrg joinCount 合計 ≠ summary');
assert.strictEqual(sum(m.byOrg, c => c.winCount), m.summary.winCount, 'byOrg winCount 合計 ≠ summary');

// 内部整合2: trend の基準月 = summary
const t0 = m.trend.find(t => t.month === m.baseMonth);
assert.strictEqual(t0.joinCount, m.summary.joinCount, 'trend ≠ summary (joinCount)');
assert.strictEqual(t0.winCount, m.summary.winCount, 'trend ≠ summary (winCount)');

// 突合: 2026-05（確定月・火曜4回=20260505,0512,0519,0526）を回別APIの4週合算と比較
const w = (await (await fetch(`${EXEC}?action=banners&base=20260526`)).json()).data.banners;
assert.deepStrictEqual(w.weeks, ['20260526', '20260519', '20260512', '20260505'], '5月の週構成が想定と違う: ' + JSON.stringify(w.weeks));
const wByOrg = {};
w.byOrg.forEach(e => { wByOrg[e.name] = e.weekly.reduce((s, c) => s + c.ptSum, 0); });
const may = {};
m.byOrg.forEach(e => { const c = e.monthly.find(x => x.month === '202605'); if (c) may[e.name] = c.ptSum; });
for (const name of Object.keys(may)) {
  assert.strictEqual(may[name], wByOrg[name] ?? 0, `202605 ptSum 不一致: ${name} 月次=${may[name]} 回別合算=${wByOrg[name]}`);
}
console.log('OK: 内部整合 + 2026-05 回別合算と一致');
