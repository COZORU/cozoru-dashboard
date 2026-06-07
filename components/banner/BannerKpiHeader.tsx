import { type BannerSummary } from './types'
import { fmt, ymdToLabel } from './format'

function Delta({ cur, prev, suffix = '' }: { cur: number; prev: number | undefined; suffix?: string }) {
  if (prev === undefined || prev === null) return null
  const d = cur - prev
  if (d === 0) return <span className="text-[10px] text-gray-400">±0{suffix}</span>
  const up = d > 0
  return <span className={`text-[10px] font-semibold ${up ? 'text-emerald-500' : 'text-red-400'}`}>{up ? '▲' : '▼'}{Math.abs(d)}{suffix}</span>
}

export default function BannerKpiHeader({ summary }: { summary: BannerSummary | null }) {
  if (!summary) return null
  const p = summary.prev
  const cards = [
    { label: '参加数',  value: summary.joinCount.toLocaleString(), delta: <Delta cur={summary.joinCount} prev={p?.joinCount} /> },
    { label: '100位以内数', value: summary.winCount.toLocaleString(), delta: <Delta cur={summary.winCount} prev={p?.winCount} /> },
    { label: '100位以内率', value: `${summary.winRate}%`,             delta: <Delta cur={summary.winRate} prev={p?.winRate} suffix="%" /> },
    { label: '平均pt',  value: fmt(summary.avgPt),                 delta: <Delta cur={summary.avgPt} prev={p?.avgPt} /> },
  ]
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">最新週 {ymdToLabel(summary.week)} の全社サマリ</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
