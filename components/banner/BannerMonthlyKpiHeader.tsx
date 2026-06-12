import { type BannerMonthlySummary } from './types'
import { fmt, ymToLabel } from './format'
import { Delta } from './BannerKpiHeader'

export default function BannerMonthlyKpiHeader({ summary }: { summary: BannerMonthlySummary | null }) {
  if (!summary) return null
  const p = summary.prev
  const cards = [
    { label: '開催回数',   value: `${summary.eventCount}回`,            delta: <Delta cur={summary.eventCount} prev={p?.eventCount} suffix="回" /> },
    { label: 'のべ参加',   value: summary.joinCount.toLocaleString(),   delta: <Delta cur={summary.joinCount} prev={p?.joinCount} /> },
    { label: '100位以内数', value: summary.winCount.toLocaleString(),    delta: <Delta cur={summary.winCount} prev={p?.winCount} /> },
    { label: '100位以内率', value: `${summary.winRate}%`,                delta: <Delta cur={summary.winRate} prev={p?.winRate} suffix="%" /> },
    { label: '平均pt',     value: fmt(summary.avgPt),                   delta: <Delta cur={summary.avgPt} prev={p?.avgPt} /> },
  ]
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">{ymToLabel(summary.month)} の全社サマリ（前月比）</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs text-gray-400">{c.label}</div>
            <div className="text-2xl font-bold text-gray-900 leading-tight mt-1 tabular-nums">{c.value}</div>
            <div className="mt-0.5">{c.delta}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
