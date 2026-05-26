'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'

type Point = { month: string; act?: number; pl?: number; fc?: number }

type Props = {
  months: { month: string; isActual: boolean }[]
  actual: { month: string; value: number }[]
  plan: { month: string; value: number }[]
  forecast: { month: string; value: number }[]
  color?: string
}

const fmtYen = (v: number) => v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`

export default function TimelineSalesChart({ months, actual, plan, forecast, color = '#1565c0' }: Props) {
  // 表示対象月のmap
  const map: Record<string, Point> = {}
  months.forEach(m => { map[m.month] = { month: m.month } })

  actual.forEach(p => { if (map[p.month]) map[p.month].act = p.value })
  plan.forEach(p   => { if (map[p.month]) map[p.month].pl  = p.value })
  forecast.forEach(p => { if (map[p.month]) map[p.month].fc = p.value })

  // 実績→予測の連結ポイント
  const lastActualMonth = months.filter(m => m.isActual).slice(-1)[0]?.month
  if (lastActualMonth && map[lastActualMonth]?.act != null) {
    map[lastActualMonth].fc = map[lastActualMonth].act
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
            let label = '実績'
            if (key === 'pl') label = '計画'
            else if (key === 'fc') label = '予測（DB_成長予測）'
            return [fmtYen(v), label]
          }}
          labelFormatter={(m) => `${m}`}
        />
        {lastActualMonth && (
          <ReferenceLine
            x={lastActualMonth}
            stroke="#90caf9"
            strokeDasharray="4 2"
          />
        )}
        <Line type="monotone" dataKey="act" name="実績"
              stroke={color} strokeWidth={2.5}
              dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="pl" name="計画"
              stroke="#999999" strokeWidth={2}
              dot={{ r: 2 }} connectNulls={false} />
        <Line type="monotone" dataKey="fc" name="予測"
              stroke={color} strokeWidth={2} strokeDasharray="6 3"
              dot={{ r: 3, fill: '#fff', stroke: color, strokeWidth: 2 }}
              connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
