// GAS(20_WebApp.js) と mjs(banner_aggregate.mjs) の集計関数が同一出力か機械検証
import fs from 'node:fs';
import assert from 'node:assert';
import { aggregateBanners, aggregateBannersMonthly } from './banner_aggregate.mjs';

const src = fs.readFileSync(new URL('../gas/20_WebApp.js', import.meta.url), 'utf8');
// ファイル全体を評価（トップレベルは関数定義のみ。SpreadsheetApp 等は呼ばなければ未参照）
const gas = new Function(src + '\n;return { aggregateBanners_: aggregateBanners_, aggregateBannersMonthly_: aggregateBannersMonthly_ };')();

function row(org, label, liver, week, rank, pt, win, eventId = week, block = '') {
  const r = new Array(18).fill('');
  r[2] = org; r[3] = week; r[4] = eventId; r[11] = 'IRIAM-' + liver; r[12] = liver;
  r[13] = label; r[14] = block; r[15] = rank; r[16] = pt; r[17] = win ? 'TRUE' : 'FALSE';
  return r;
}

const values = [
  row('OrgA','L1','liverA','20260428',5,100,true),
  row('OrgA','L1','liverA','20260512',8,200,true),
  row('OrgA','L1','liverA','20260526',120,50,false),
  row('OrgB','L3','liverD','20260526',2,400,true,'20260526010','1'),
  row('OrgB','L3','liverE','20260526',150,80,false,'20260526010','2'),
  row('OrgA','L2','liverC','20260602',70,70,true),
  row('O','L','y','20260101',0,50,false,'',''),   // noEvent 行
];

assert.deepStrictEqual(gas.aggregateBanners_(values, ''), aggregateBanners(values, ''));
assert.deepStrictEqual(gas.aggregateBanners_(values, '20260526'), aggregateBanners(values, '20260526'));
assert.deepStrictEqual(gas.aggregateBannersMonthly_(values, ''), aggregateBannersMonthly(values, ''));
assert.deepStrictEqual(gas.aggregateBannersMonthly_(values, '202605'), aggregateBannersMonthly(values, '202605'));
assert.deepStrictEqual(gas.aggregateBannersMonthly_([], ''), aggregateBannersMonthly([], ''));
console.log('OK: GAS↔mjs 同期（回別・月次とも同一出力）');
