'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'

type Point = {
  month: string
  // 売上
  revAct?: number; revPlan?: number; revFc?: number
  // 経費
  expAct?: number; expPlan?: number; expFc?: number
}

type Series = { month: string; value: number }

type Props = {
  months: { month: string; isActual: boolean }[]
  // 売上
  revActual: Series[]
  revPlan: Series[]
  revForecast: Series[]
  // 経費
  expActual: Series[]
  expPlan: Series[]
  expForecast: Series[]
}

const REV_COLOR = '#1565c0'
const EXP_COLOR = '#e65100'

const fmtYen = (v: number) => v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`

export default function TimelineSalesChart({
  months, revActual, revPlan, revForecast, expActual, expPlan, expForecast
}: Props) {
  const map: Record<string, Point> = {}
  months.forEach(m => { map[m.month] = { month: m.month } })

  revActual.forEach(p => { if (map[p.month]) map[p.month].revAct = p.value })
  revPlan.forEach(p   => { if (map[p.month]) map[p.month].revPlan = p.value })
  revForecast.forEach(p => { if (map[p.month]) map[p.month].revFc = p.value })
  expActual.forEach(p => { if (map[p.month]) map[p.month].expAct = p.value })
  expPlan.forEach(p   => { if (map[p.month]) map[p.month].expPlan = p.value })
  expForecast.forEach(p => { if (map[p.month]) map[p.month].expFc = p.value })

  // 実績→予測の連結ポイント
  const lastActualMonth = months.filter(m => m.isActual).slice(-1)[0]?.month
  if (lastActualMonth) {
    if (map[lastActualMonth]?.revAct != null) map[lastActualMonth].revFc = map[lastActualMonth].revAct
    if (map[lastActualMonth]?.expAct != null) map[lastActualMonth].expFc = map[lastActualMonth].expAct
  }

  const chartData = months.map(m => map[m.month])
  const firstForecastMonth = months.find(m => !m.isActual)?.month
  const lastMonth = months.slice(-1)[0]?.month

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 0, left: 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        {firstForecastMonth && lastMonth && (
          <ReferenceArea x1={firstForecastMonth} x2={lastMonth} fill="#e3f2fd" fillOpacity={0.4} />
        )}
        <XAxis
          dataKey="month"
          tick={false}
          axisLine={false}
          padding={{ left: 0, right: 0 }}
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
              revAct: '売上 実績', revPlan: '売上 計画', revFc: '売上 予測',
              expAct: '経費 実績', expPlan: '経費 計画', expFc: '経費 予測',
            }
            return [fmtYen(v), labels[key as string] || key]
          }}
          labelFormatter={(m) => `${m}`}
        />
        {lastActualMonth && (
          <ReferenceLine x={lastActualMonth} stroke="#90caf9" strokeDasharray="4 2" />
        )}

        {/* 売上系 */}
        <Line type="monotone" dataKey="revPlan" name="売上 計画"
              stroke="#bdbdbd" strokeWidth={2}
              dot={{ r: 2 }} connectNulls={false} />
        <Line type="monotone" dataKey="revAct" name="売上 実績"
              stroke={REV_COLOR} strokeWidth={2.5}
              dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="revFc" name="売上 予測"
              stroke={REV_COLOR} strokeWidth={2} strokeDasharray="6 3"
              dot={{ r: 3, fill: '#fff', stroke: REV_COLOR, strokeWidth: 2 }}
              connectNulls={false} />

        {/* 経費系 */}
        <Line type="monotone" dataKey="expPlan" name="経費 計画"
              stroke="#ffcc80" strokeWidth={2}
              dot={{ r: 2 }} connectNulls={false} />
        <Line type="monotone" dataKey="expAct" name="経費 実績"
              stroke={EXP_COLOR} strokeWidth={2.5}
              dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="expFc" name="経費 予測"
              stroke={EXP_COLOR} strokeWidth={2} strokeDasharray="6 3"
              dot={{ r: 3, fill: '#fff', stroke: EXP_COLOR, strokeWidth: 2 }}
              connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
