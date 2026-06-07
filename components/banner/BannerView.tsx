'use client'
import { useEffect, useState } from 'react'
import { type BannerData } from './types'
import { ymdToLabel } from './format'
import BannerKpiHeader from './BannerKpiHeader'
import BannerMatrix from './BannerMatrix'
import BannerLiverTable from './BannerLiverTable'

export default function BannerView() {
  const [data, setData] = useState<BannerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [base, setBase] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = base ? `/api/data?action=banners&base=${base}` : '/api/data?action=banners'
    fetch(url)
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok' && j.data?.banners) setData(j.data.banners)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [base])

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-gray-400 text-sm">
        <div className="inline-flex items-center gap-2"><div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />バナイベ実績を読み込み中…</div>
      </div>
    )
  }
  if (!data || data.weeks.length === 0) {
    return <div className="p-12 text-center text-gray-400 text-sm">バナイベ実績データがありません</div>
  }

  const labels = activeOnly ? data.byLabel.filter(e => e.totalPt > 0) : data.byLabel
  const baseOptions = [data.baseDate, ...data.weeks.filter(w => w !== data.baseDate)]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-xs text-gray-500">基準日</label>
        <select
          value={base || data.baseDate}
          onChange={e => setBase(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          {baseOptions.map(w => (
            <option key={w} value={w}>{ymdToLabel(w)}（{w}）</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none ml-2">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded" />
          実績ありのレーベルのみ
        </label>
        {loading && <span className="text-xs text-gray-400">更新中…</span>}
        <span className="ml-auto text-xs text-gray-400">「100位内」＝順位100位以内</span>
      </div>

      <BannerKpiHeader summary={data.summary} />
      <BannerMatrix title="① 個社別 — 回別バナイベ実績" subtitle="pt合計の降順。「100位内」＝順位100位以内の人数。バー＝pt合計のヒート。名前下＝直近4回pt推移。" entities={data.byOrg} weeks={data.weeks} />
      <BannerMatrix title="② レーベル別 — 回別バナイベ実績" subtitle="レーベル単位の戦闘力。指標は個社別と同じ。" entities={labels} weeks={data.weeks} />
      <BannerLiverTable livers={data.byLiver} weeks={data.weeks} />
    </div>
  )
}
