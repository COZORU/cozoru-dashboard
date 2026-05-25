'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type TrendItem = { month: string; revTaxIn: number; dia: number; debut: number }

function fmt(v: number) {
  if (v >= 1_000_000) return `¥${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000)    return `¥${(v / 10_000).toFixed(0)}万`
  return `¥${v.toLocaleString()}`
}

export default function RevenueChart({ data }: { data: TrendItem[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="text-sm font-semibold text-gray-700 mb-4">売上トレンド（税込）</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={70} />
          <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : String(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="revTaxIn" name="売上(税込)" stroke="#1565c0" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="dia"      name="応援ダイヤ" stroke="#43a047" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
