'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

type TrendItem = { month: string; revTaxIn: number }

function fmt(v: number) {
  if (v >= 1_000_000) return `¥${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000)    return `¥${(v / 10_000).toFixed(0)}万`
  return `¥${v.toLocaleString()}`
}

export default function RevenueChart({ data }: { data: TrendItem[] }) {
  const chartData = [...data].sort((a, b) => a.month < b.month ? -1 : 1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-6 mb-4">
        <span className="text-sm font-semibold text-gray-700">売上トレンド（税込・実績）</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#1565c0" strokeWidth="2"/></svg>実績
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={70} />
          <Tooltip
            formatter={(v: number) => [fmt(v), '売上（実績）']}
            labelFormatter={(l: string) => l}
          />
          <Line
            type="monotone" dataKey="revTaxIn" name="売上（実績）"
            stroke="#1565c0" strokeWidth={2.5} dot={{ r: 3 }}
            connectNulls={false} activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
