'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'

type TrendItem = { month: string; revTaxIn: number; dia: number; isForecast?: boolean }

function fmt(v: number) {
  if (v >= 1_000_000) return `¥${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000)    return `¥${(v / 10_000).toFixed(0)}万`
  return `¥${v.toLocaleString()}`
}

export default function RevenueChart({ data }: { data: TrendItem[] }) {
  // 実績と予測を同一月にマージ（接続点で両系列が同じ値を持ちグラフが繋がる）
  const monthMap: Record<string, { month: string; rev?: number; revFc?: number }> = {}
  data.forEach(t => {
    if (!monthMap[t.month]) monthMap[t.month] = { month: t.month }
    if (t.isForecast) monthMap[t.month].revFc = t.revTaxIn
    else              monthMap[t.month].rev   = t.revTaxIn
  })
  const chartData = Object.values(monthMap).sort((a, b) => a.month < b.month ? -1 : 1)

  const latestActual = data.filter(t => !t.isForecast).slice(-1)[0]?.month
  const fcMonths     = data.filter(t => t.isForecast && t.month !== latestActual).map(t => t.month)
  const lastFc       = fcMonths.slice(-1)[0]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-6 mb-4">
        <span className="text-sm font-semibold text-gray-700">売上トレンド（税込）</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#1565c0" strokeWidth="2"/></svg>実績
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#1565c0" strokeWidth="2" strokeDasharray="6 3"/></svg>予測
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          {latestActual && lastFc && (
            <ReferenceArea x1={latestActual} x2={lastFc} fill="#e3f2fd" fillOpacity={0.4} />
          )}
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={70} />
          <Tooltip
            formatter={(v, name) => {
              if (v == null || typeof v !== 'number') return [null, name]
              return [fmt(v), name === 'revFc' ? '売上（予測）' : '売上（実績）']
            }}
            labelFormatter={(l: string) => l}
          />
          {latestActual && (
            <ReferenceLine
              x={latestActual}
              stroke="#90caf9"
              strokeDasharray="4 2"
              label={{ value: '予測 →', position: 'insideTopRight', fontSize: 10, fill: '#64b5f6', dy: -4 }}
            />
          )}
          <Line
            type="monotone" dataKey="rev" name="売上（実績）"
            stroke="#1565c0" strokeWidth={2.5} dot={{ r: 3 }}
            connectNulls={false} activeDot={{ r: 5 }}
          />
          <Line
            type="monotone" dataKey="revFc" name="売上（予測）"
            stroke="#1565c0" strokeWidth={2} strokeDasharray="6 3"
            dot={{ r: 3, fill: '#fff', stroke: '#1565c0', strokeWidth: 2 }}
            connectNulls={false} activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
