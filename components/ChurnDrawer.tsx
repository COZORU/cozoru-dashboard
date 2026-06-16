'use client'
import { useMemo, useState } from 'react'

export type Leaver = {
  uid: string; name: string; office: string; label: string
  lastMonth: string; debutMonth: string; tenureMonths: number
  dia: number; tier: 'T1' | 'T2' | 'T3'; rank: string
}
export type ChurnData = {
  month: string; scope: string; count: number
  diaLostTotal: number; topTierCount: number; leavers: Leaver[]
}
type SortKey = 'dia' | 'tenureMonths' | 'tier'

const fmt = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString())
const tenure = (m: number) => (m >= 12 ? `${Math.floor(m / 12)}年${m % 12 ? `${m % 12}ヶ月` : ''}` : `${m}ヶ月`)

export default function ChurnDrawer({
  month, data, loading, onClose,
}: { month: string | null; data: ChurnData | null; loading: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<SortKey>('dia')
  const rows = useMemo(() => {
    const l = [...(data?.leavers || [])]
    if (sort === 'tier') l.sort((a, b) => a.tier.localeCompare(b.tier) || b.dia - a.dia)
    else l.sort((a, b) => (b[sort] as number) - (a[sort] as number))
    return l
  }, [data, sort])

  if (!month) return null

  const exportCsv = () => {
    const head = ['アカウント名', '事務所', 'レーベル', '在籍', '最終月', '最終月ダイヤ', 'Tier', 'ランク']
    const lines = rows.map(r =>
      [r.name, r.office, r.label, tenure(r.tenureMonths), r.lastMonth, r.dia, r.tier, r.rank]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `退会者_${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-xl overflow-y-auto p-5 text-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-bold text-gray-800">{month} の流出（退会）</h2>
          <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded">{data?.count ?? 0}人</span>
          <span className="text-[11px] text-gray-400">最終在籍は前月</span>
          <button onClick={onClose} aria-label="閉じる" className="ml-auto text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">読み込み中…</div>
        ) : !data || data.count === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">この月の流出はありません</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-600">退会人数</div>
                <div className="text-xl font-bold">{data.count}<span className="text-xs font-normal"> 人</span></div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-600">失った応援ダイヤ</div>
                <div className="text-xl font-bold">{fmt(data.diaLostTotal)}</div>
              </div>
              <div className={`rounded-lg p-3 ${data.topTierCount > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <div className={`text-xs ${data.topTierCount > 0 ? 'text-red-700' : 'text-slate-600'}`}>上位Tier(T1)退会</div>
                <div className={`text-xl font-bold ${data.topTierCount > 0 ? 'text-red-700' : ''}`}>{data.topTierCount}<span className="text-xs font-normal"> 人</span></div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
              <span>並べ替え:</span>
              {(['dia', 'tenureMonths', 'tier'] as SortKey[]).map(k => (
                <button key={k} onClick={() => setSort(k)} className={`px-2 py-0.5 rounded ${sort === k ? 'bg-blue-100 text-blue-700 font-bold' : 'hover:bg-gray-100'}`}>
                  {k === 'dia' ? 'ダイヤ' : k === 'tenureMonths' ? '在籍' : 'Tier'}
                </button>
              ))}
              <button onClick={exportCsv} className="ml-auto px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50">CSV出力</button>
            </div>

            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="text-left text-xs text-slate-600 border-b border-gray-200">
                  <th className="py-2 pr-2">アカウント名</th>
                  <th className="py-2 pr-2">事務所</th>
                  <th className="py-2 pr-2">在籍</th>
                  <th className="py-2 pr-2 text-right">最終月ダイヤ</th>
                  <th className="py-2 text-center">Tier</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.uid} className="border-b border-gray-100">
                    <td className="py-2 pr-2 font-medium text-gray-900">{r.name}</td>
                    <td className="py-2 pr-2 text-slate-600">{r.office}</td>
                    <td className="py-2 pr-2 text-slate-600">{tenure(r.tenureMonths)}</td>
                    <td className="py-2 pr-2 text-right font-medium text-gray-900">{fmt(r.dia)}</td>
                    <td className="py-2 text-center">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${r.tier === 'T1' ? 'bg-red-50 text-red-700' : r.tier === 'T2' ? 'bg-amber-50 text-amber-700' : 'text-slate-400'}`}>{r.tier}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
