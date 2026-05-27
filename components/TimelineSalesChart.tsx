'use client'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts'

type Point = {
  month: string
  revPlan?: number
  profitPlan?: number
  revAct?: number
  expAct?: number
}

type Series = { month: string; value: number }

type Props = {
  months: { month: string; isActual: boolean }[]
  // 計画（折れ線）
  revPlan: Series[]
  profitPlan: Series[]
  // 実績（棒）— 予測月もここに入れる
  revActual: Series[]      // 実績月＋予測月の売上
  expActual: Series[]      // 実績月＋予測月の経費
}

const REV_COLOR    = '#1565c0'  // 売上（青）
const EXP_COLOR    = '#e65100'  // 経費（オレンジ）
const PROFIT_COLOR = '#2e7d32'  // 利益計画（緑）

const fmtYen = (v: number) => v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`

export default function TimelineSalesChart({
  months, revPlan, profitPlan, revActual, expActual
}: Props) {
  const map: Record<string, Point> = {}
  months.forEach(m => { map[m.month] = { month: m.month } })

  revPlan.forEach(p     => { if (map[p.month]) map[p.month].revPlan    = p.value })
  profitPlan.forEach(p  => { if (map[p.month]) map[p.month].profitPlan = p.value })
  revActual.forEach(p   => { if (map[p.month]) map[p.month].revAct     = p.value })
  expActual.forEach(p   => { if (map[p.month]) map[p.month].expAct     = p.value })

  const chartData = months.map(m => map[m.month])
  const firstForecastMonth = months.find(m => !m.isActual)?.month
  const lastMonth = months.slice(-1)[0]?.month

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={{ top: 8, right: 0, left: 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        {firstForecastMonth && lastMonth && (
          <ReferenceArea x1={firstForecastMonth} x2={lastMonth} fill="#e3f2fd" fillOpacity={0.35} />
        )}
        <XAxis
          dataKey="month"
          tick={false}
          axisLine={false}
          padding={{ left: 16, right: 16 }}
        />
        <YAxis
          tickFormatter={fmtYen}
          tick={{ fontSize: 10 }}
          width={70}
          axisLine={false}
        />
        <Tooltip
          formatter={(v, key) => {
            if (v == null || typeof v !== 'number') return [null, key]
            const labels: Record<string, string> = {
              revPlan:    '売上 計画',
              profitPlan: '利益 計画',
              revAct:     '売上 実績/予測',
              expAct:     '経費 実績/予測',
            }
            return [fmtYen(v), labels[key as string] || key]
          }}
          labelFormatter={(m) => `${m}`}
        />

        {/* 棒グラフ（売上実績・経費実績） — 同じカテゴリで横並び */}
        <Bar dataKey="revAct" name="売上 実績/予測" fill={REV_COLOR}  barSize={14} radius={[3,3,0,0]} />
        <Bar dataKey="expAct" name="経費 実績/予測" fill={EXP_COLOR}  barSize={14} radius={[3,3,0,0]} />

        {/* 折れ線（売上計画・利益計画） — 棒の上に重ねる */}
        <Line type="monotone" dataKey="revPlan"    name="売上 計画"
              stroke={REV_COLOR}    strokeWidth={2}  strokeDasharray="5 3"
              dot={{ r: 3, fill: '#fff', stroke: REV_COLOR, strokeWidth: 2 }}
              connectNulls={false} />
        <Line type="monotone" dataKey="profitPlan" name="利益 計画"
              stroke={PROFIT_COLOR} strokeWidth={2.5}
              dot={{ r: 3 }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
