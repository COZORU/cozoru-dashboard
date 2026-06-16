'use client'
import { useEffect, useState } from 'react'
import { type BannerData, type BannerEntity, type BannerMonthlyEntity } from './types'
import { ymdToLabel, ymToLabel } from './format'
import BannerKpiHeader from './BannerKpiHeader'
import BannerMonthlyKpiHeader from './BannerMonthlyKpiHeader'
import BannerMonthlyTrend from './BannerMonthlyTrend'
import BannerMatrix from './BannerMatrix'
import BannerLiverTable from './BannerLiverTable'
import BannerLiverMonthlyTable from './BannerLiverMonthlyTable'

// 月次エンティティ → BannerMatrix が受ける既存型へ詰め替え（month を week 枠で運ぶ）
const toEntity = (e: BannerMonthlyEntity): BannerEntity => ({
  name: e.name,
  totalPt: e.totalPt,
  weekly: e.monthly.map(c => ({ week: c.month, ptSum: c.ptSum, avgPt: c.avgPt, winCount: c.winCount, joinCount: c.joinCount })),
})

export default function BannerView() {
  const [data, setData] = useState<BannerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [base, setBase] = useState('')
  const [basem, setBasem] = useState('')
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly')
  const [activeOnly, setActiveOnly] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ action: 'banners' })
    if (base) params.set('base', base)
    if (basem) params.set('basem', basem)
    fetch(`/api/data?${params.toString()}`)
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok' && j.data?.banners) setData(j.data.banners)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [base, basem])

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

  const monthly = data.monthly ?? null            // 旧GASレスポンスでは undefined → 月次UI非表示
  const showMonthly = mode === 'monthly' && !!monthly

  const labels = activeOnly ? data.byLabel.filter(e => e.totalPt > 0) : data.byLabel
  const baseOptions = [data.baseDate, ...data.weeks.filter(w => w !== data.baseDate)]
  const mLabels = monthly ? (activeOnly ? monthly.byLabel.filter(e => e.totalPt > 0) : monthly.byLabel) : []
  const basemOptions = monthly ? [...monthly.allMonths].reverse() : []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {monthly && (
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setMode('weekly')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition ${mode === 'weekly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >回別</button>
            <button
              onClick={() => setMode('monthly')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition ${mode === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >月次</button>
          </div>
        )}

        {showMonthly && monthly ? (
          <>
            <label className="text-xs text-gray-500">基準月</label>
            <select
              value={basem || monthly.baseMonth}
              onChange={e => setBasem(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {basemOptions.map(m => (
                <option key={m} value={m}>{ymToLabel(m)}</option>
              ))}
            </select>
            <span className="text-[11px] text-gray-400">← 一覧の左端＝基準月（直近6ヶ月・左ほど新しい）</span>
          </>
        ) : (
          <>
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
            <span className="text-[11px] text-gray-400">← 一覧の左端＝基準日（左ほど新しい回）</span>
          </>
        )}

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none ml-2">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded" />
          実績ありのレーベルのみ
        </label>
        {loading && <span className="text-xs text-gray-400">更新中…</span>}
        <span className="ml-auto text-xs text-gray-400">「100位内」＝順位100位以内</span>
      </div>

      {showMonthly && monthly ? (
        <>
          <BannerMonthlyKpiHeader summary={monthly.summary} />
          <BannerMonthlyTrend trend={monthly.trend} months={monthly.months} />
          <BannerMatrix
            title="① 個社別 — 月次バナイベ実績"
            subtitle="pt合計の降順。「100位内」＝のべ100位以内回数。「参加」＝のべ参加。バー＝pt合計のヒート。名前下＝月次pt推移。"
            entities={monthly.byOrg.map(toEntity)}
            weeks={monthly.months}
            labelFn={ymToLabel}
            baseBadge="基準月"
          />
          <BannerMatrix
            title="② レーベル別 — 月次バナイベ実績"
            subtitle="レーベル単位の戦闘力（月次）。指標は個社別と同じ。"
            entities={mLabels.map(toEntity)}
            weeks={monthly.months}
            labelFn={ymToLabel}
            baseBadge="基準月"
          />
          <BannerLiverMonthlyTable livers={monthly.byLiver} months={monthly.months} />
        </>
      ) : (
        <>
          <BannerKpiHeader summary={data.summary} />
          <BannerMatrix title="① 個社別 — 回別バナイベ実績" subtitle="pt合計の降順。「100位内」＝順位100位以内の人数。バー＝pt合計のヒート。名前下＝直近4回pt推移。" entities={data.byOrg} weeks={data.weeks} />
          <BannerMatrix title="② レーベル別 — 回別バナイベ実績" subtitle="レーベル単位の戦闘力。指標は個社別と同じ。" entities={labels} weeks={data.weeks} />
          <BannerLiverTable livers={data.byLiver} weeks={data.weeks} />
        </>
      )}
    </div>
  )
}
