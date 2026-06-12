import assert from 'node:assert';
import { aggregateBanners, aggregateBannersMonthly } from './banner_aggregate.mjs';

// 列: 0..17。使う列 → 個社(2) 週(3) ID(11) ライバー(12) レーベル(13) 順位(15) pt(16) 入賞(17)
function row(org, label, liver, week, rank, pt, win, eventId = week, block = '') {
  const r = new Array(18).fill('');
  r[2] = org; r[3] = week; r[4] = eventId; r[11] = 'IRIAM-' + liver; r[12] = liver;
  r[13] = label; r[14] = block; r[15] = rank; r[16] = pt; r[17] = win ? 'TRUE' : 'FALSE';
  return r;
}

const values = [
  row('OrgA','L1','liverA','20260501',1,9999,true),
  row('OrgA','L2','liverC','20260508',70,70,true),
  row('OrgA','L1','liverB','20260515',60,60,true),
  row('OrgA','L1','liverA','20260522',10,80,true),
  row('OrgB','L3','liverD','20260522',2,400,true),
  row('OrgA','L1','liverA','20260529',5,100,true),
  row('OrgA','L1','liverB','20260529',150,50,false),
  row('OrgA','L2','liverC','20260529',99,200,true),
  row('OrgB','L3','liverD','20260529',101,300,false),
];

const out = aggregateBanners(values, '');

assert.deepStrictEqual(out.weeks, ['20260529','20260522','20260515','20260508']);
assert.strictEqual(out.baseDate, '20260529');

assert.strictEqual(out.byOrg[0].name, 'OrgB');
assert.strictEqual(out.byOrg[0].totalPt, 700);
assert.strictEqual(out.byOrg[1].name, 'OrgA');
assert.strictEqual(out.byOrg[1].totalPt, 560);

const orgA0529 = out.byOrg[1].weekly[0];
assert.deepStrictEqual(
  { week: orgA0529.week, ptSum: orgA0529.ptSum, avgPt: orgA0529.avgPt, winCount: orgA0529.winCount, joinCount: orgA0529.joinCount },
  { week:'20260529', ptSum:350, avgPt:117, winCount:2, joinCount:3 }
);
const orgB0515 = out.byOrg[0].weekly[2];
assert.strictEqual(orgB0515.joinCount, 0);
assert.strictEqual(orgB0515.avgPt, null);

assert.deepStrictEqual(out.byLabel.map(e => [e.name, e.totalPt]), [['L3',700],['L1',290],['L2',270]]);

assert.deepStrictEqual(out.byLiver.map(l => l.name), ['liverC','liverA','liverD','liverB']);
assert.strictEqual(out.byLiver[2].office, 'OrgB');
assert.strictEqual(out.byLiver[2].label, 'L3');
assert.strictEqual(out.byLiver[0].weekly[0].win, true);

// joined フラグ：参加週=true / 不参加週=false（週順 [0529,0522,0515,0508]）
assert.deepStrictEqual(out.byLiver.find(l => l.name === 'liverA').weekly.map(w => w.joined), [true, true, false, false]);
assert.deepStrictEqual(out.byLiver.find(l => l.name === 'liverC').weekly.map(w => w.joined), [true, false, false, true]);

assert.deepStrictEqual(out.summary, {
  week:'20260529', joinCount:4, winCount:2, winRate:50, avgPt:163,
  prev:{ joinCount:2, winCount:2, winRate:100, avgPt:240 }
});

// 入賞は順位(1..100)で判定（元の入賞フラグに依存しない）
const out2 = aggregateBanners([
  row('X','LX','winnerByRank','20260529', 50, 1000, false),  // flag=false でも 50位 → 入賞
  row('X','LX','loserByRank','20260529', 120, 2000, true),   // flag=true でも 120位 → 非入賞
], '');
assert.strictEqual(out2.byLiver.find(l => l.name === 'winnerByRank').weekly[0].win, true);
assert.strictEqual(out2.byLiver.find(l => l.name === 'loserByRank').weekly[0].win, false);
assert.strictEqual(out2.summary.winCount, 1);

// 回(EventId×Block)ごとのグルーピング：同じ週でも別EventId=別ランキング、回内は順位昇順
const ev = aggregateBanners([
  row('cozoru','cozoru','A1','20260529', 150, 22000, false, '20260529010', '1'),
  row('cozoru','cozoru','A2','20260529', 1, 50000, true,  '20260529010', '1'),
  row('ライブナウV','ライブナウ','B1','20260529', 33, 28000, false, '20260529020', '1'),
  row('ライブナウV','ライブナウ','B2','20260529', 2, 90000, true,  '20260529020', '1'),
], '20260529');
const ev0529 = ev.events.filter(e => e.week === '20260529');
assert.strictEqual(ev0529.length, 2);
const evA = ev.events.find(e => e.eventId === '20260529010');
const evB = ev.events.find(e => e.eventId === '20260529020');
assert.deepStrictEqual(evA.participants.map(p => p.name), ['A2','A1']);  // 回内 順位昇順
assert.deepStrictEqual(evB.participants.map(p => p.name), ['B2','B1']);
assert.strictEqual(evA.office, 'cozoru');
assert.strictEqual(evB.office, 'ライブナウV');
assert.strictEqual(evA.count, 2);
assert.strictEqual(evA.winCount, 1);   // 1位=入賞 / 150位=非入賞
assert.strictEqual(evB.winCount, 2);   // 2位・33位とも100位以内

// 期間キー＝EventId先頭8桁（targetDateではない）
const evd = aggregateBanners([
  row('o','l','X','20260529', 5, 100, true, '20260602140', '1'),  // targetDate=20260529 だが EventId日付=20260602
  row('o','l','Y','20260529', 9, 80, true, '20260526200', '1'),   // EventId日付=20260526
], '20260602');
assert.deepStrictEqual(evd.weeks, ['20260602','20260526']);  // targetDateの20260529ではなくEventId日付で2期間に分離
assert.strictEqual(evd.byLiver.find(l => l.name === 'X').weekly[0].week, '20260602');

// EventId無しの行 → 最新回に配置＋noEventフラグ＋noEventCount
const ne = aggregateBanners([
  row('o','l','HasEv','20260529', 5, 100, true, '20260602140', '1'),  // 通常（EventId日付=6/2）
  row('o','l','NoEv','20260529', 50, 200, true, '', '1'),             // EventId無し→最新回(6/2)に配置
], '20260602');
assert.strictEqual(ne.noEventCount, 1);
assert.strictEqual(ne.byLiver.find(l => l.name === 'NoEv').weekly[0].week, '20260602');  // 最新回に配置
assert.strictEqual(ne.byLiver.find(l => l.name === 'NoEv').weekly[0].noEvent, true);      // フラグ
assert.ok(!ne.byLiver.find(l => l.name === 'HasEv').weekly[0].noEvent);                   // 通常はフラグ無し

console.log('OK: all banner aggregate assertions passed');

// ───────────────────────────────────────────────
// 月次集計 aggregateBannersMonthly
// ───────────────────────────────────────────────

// 月またぎ回の帰属・月内複数回合算・bestRank・eventCount
const mvalues = [
  row('OrgA','L1','liverA','20260428',5,100,true),                     // 4/28開始(→5/4終了)も「4月」帰属
  row('OrgA','L1','liverA','20260512',8,200,true),                     // 5月 1回目
  row('OrgA','L1','liverA','20260526',120,50,false),                   // 5月 2回目(非入賞)
  row('OrgB','L3','liverD','20260526',2,400,true,'20260526010','1'),
  row('OrgB','L3','liverE','20260526',150,80,false,'20260526010','2'), // 同EventId別Block→別回
  row('OrgA','L2','liverC','20260602',70,70,true),                     // 6月
];
const m = aggregateBannersMonthly(mvalues, '');

assert.strictEqual(m.baseMonth, '202606');
assert.deepStrictEqual(m.allMonths, ['202604','202605','202606']);   // 昇順
assert.deepStrictEqual(m.months, ['202606','202605','202604']);      // 新しい順(ウィンドウ)

// ライバー別: 月内2回参加の合算と bestRank
const la = m.byLiver.find(l => l.name === 'liverA');
assert.deepStrictEqual(la.monthly[1], { month:'202605', joinCount:2, winCount:1, ptSum:250, bestRank:8 });
assert.deepStrictEqual(la.monthly[2], { month:'202604', joinCount:1, winCount:1, ptSum:100, bestRank:5 });

// 個社別: OrgA 5月 = liverA 2回分
const orgA = m.byOrg.find(e => e.name === 'OrgA');
assert.deepStrictEqual(orgA.monthly[1], { month:'202605', ptSum:250, avgPt:125, winCount:1, joinCount:2 });

// trend(全期間・昇順): 5月 = のべ4参加・2入賞・eventCount4(20260512 / 20260526 / 20260526010|1 / 20260526010|2)
const t5 = m.trend.find(t => t.month === '202605');
assert.deepStrictEqual(t5, { month:'202605', ptSum:730, joinCount:4, winCount:2, winRate:50, avgPt:183, eventCount:4 });

// summary: 基準月=6月、prev=5月（trend値と一致）
assert.deepStrictEqual(m.summary, {
  month:'202606', joinCount:1, winCount:1, winRate:100, avgPt:70, eventCount:1,
  prev:{ joinCount:4, winCount:2, winRate:50, avgPt:183, eventCount:4 }
});

// byLiver ソート: 最新月 winCount desc → ptSum desc
const m2 = aggregateBannersMonthly([
  row('O','L','noWinBigPt','20260602',150,9999,false),
  row('O','L','winnerSmallPt','20260602',1,10,true),
], '');
assert.deepStrictEqual(m2.byLiver.map(l => l.name), ['winnerSmallPt','noWinBigPt']);

// 6ヶ月ウィンドウ: 7ヶ月分 → 最古が落ちる。基準月指定で過去へ。trend は常に全期間
const wvalues = ['202501','202502','202503','202504','202505','202506','202507']
  .map((ym,i) => row('O','L','lv'+i, ym+'07', 10+i, 100, true));
const w = aggregateBannersMonthly(wvalues, '');
assert.deepStrictEqual(w.months, ['202507','202506','202505','202504','202503','202502']);
assert.strictEqual(w.allMonths.length, 7);
const w2 = aggregateBannersMonthly(wvalues, '202504');
assert.strictEqual(w2.baseMonth, '202504');
assert.deepStrictEqual(w2.months, ['202504','202503','202502','202501']);  // 残り4ヶ月のみ
assert.strictEqual(w2.trend.length, 7);
assert.deepStrictEqual(w2.summary.prev, { joinCount:1, winCount:1, winRate:100, avgPt:100, eventCount:1 }); // prev=202503

// EventId未設定行 → 最新月に帰属 + noEventCount
const nvalues = [
  row('O','L','x','20260602',5,100,true),
  row('O','L','y','20260101',0,50,false,'',''),   // eventId空 → 最新月(202606)へ
];
const n = aggregateBannersMonthly(nvalues, '');
assert.strictEqual(n.noEventCount, 1);
const ny = n.byLiver.find(l => l.name === 'y');
assert.strictEqual(ny.monthly[0].month, '202606');
assert.strictEqual(ny.monthly[0].joinCount, 1);

// 空データ
const emptyOut = aggregateBannersMonthly([], '');
assert.deepStrictEqual(emptyOut, { baseMonth:'', months:[], allMonths:[], byOrg:[], byLabel:[], byLiver:[], summary:null, trend:[], noEventCount:0 });

console.log('OK: aggregateBannersMonthly');
