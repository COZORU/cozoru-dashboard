import assert from 'node:assert'
import { median, retreatRates, buildOutflowForecast } from '../lib/liverForecast.mjs'

// median: 偶数個は中央2つの平均
assert.strictEqual(median([3, 1, 2, 4]), 2.5)
assert.strictEqual(median([5, 1, 3]), 3)
assert.strictEqual(median([]), 0)

// 退会率: outflow_i / registered_{i-1}。outflow<=0 と null はスキップ。
const history = [
  { month: '2026-01', registered: 3218, outflow: 0 },   // 先頭=分母提供のみ（自身の0は不採用）
  { month: '2026-02', registered: 3213, outflow: 53 },
  { month: '2026-03', registered: 3180, outflow: 72 },
  { month: '2026-04', registered: 3064, outflow: 169 },
  { month: '2026-05', registered: 3151, outflow: 76 },
]
const rates = retreatRates(history)
assert.strictEqual(rates.length, 4)
assert.ok(Math.abs(median(rates) - 0.023607) < 0.0005, 'median rate ≈ 2.36%')

// 流出予測: 退会率 × 前月所属（連鎖）。Jun は May(3151) を分母、以降は予測所属を分母。
const rosterForecast = [
  { month: '2026-06', registered: 3132 },
  { month: '2026-07', registered: 3116 },
  { month: '2026-08', registered: 3133 },
]
const fc = buildOutflowForecast(history, rosterForecast, 3151)
assert.deepStrictEqual(fc, [
  { month: '2026-06', value: 74 },
  { month: '2026-07', value: 74 },
  { month: '2026-08', value: 74 },
])
console.log('OK: liverForecast all assertions passed')
