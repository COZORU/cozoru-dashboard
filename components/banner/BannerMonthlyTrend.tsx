'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { type BannerTrendPoint } from './types'
import { ymToLabel, fmt } from './format'

const fmtTick = (v: number) => (v >= 10000 ? `${Math.round(v / 10000)}万` : v.toLocaleString())

export default function BannerMonthlyTrend({ trend, months }: { trend: BannerTrendPoint[]; months?: string[] }) {
  // 個社別マトリクスと同じ「基準月＋過去5ヶ月＝直近6ヶ月」窓に揃える。
  // months は新しい順、trend は昇順。trend 側の並び（昇順）を保ったまま窓内だけに絞り込む。
  const allow = months && months.length ? new Set(months) : null
  const scoped = trend && allow ? trend.filter(t => allow.has(t.month)) : (trend || [])
  if (scoped.length < 2) return null
  const data = scoped.map(t => ({ ...t, label: ymToLabel(t.month) }))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800">参加・100位以内の月次推移（直近6ヶ月）</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-2">薄棒＝のべ参加 / 濃棒＝100位以内 / 線＝100位以内率（右軸）</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="r" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, name) => [String(name).includes('率') ? `${Number(v)}%` : Number(v).toLocaleString(), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="joinCount" name="のべ参加" fill="#90caf9" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="l" dataKey="winCount" name="100位以内" fill="#1565c0" radius={[2, 2, 0, 0]} />
              <Line yAxisId="r" dataKey="winRate" name="100位以内率" stroke="#e65100" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800">応援ptの月次推移（直近6ヶ月）</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-2">棒＝pt合計 / 線＝参加者平均pt（右軸）</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="l" tickFormatter={fmtTick} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="r" orientation="right" tickFormatter={fmtTick} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, name) => [fmt(Number(v)), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="ptSum" name="pt合計" fill="#a5d6a7" radius={[2, 2, 0, 0]} />
              <Line yAxisId="r" dataKey="avgPt" name="平均pt" stroke="#2e7d32" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
