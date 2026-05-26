'use client'
import { useEffect, useState } from 'react'

type MonthSnap = {
  month: string
  isActual: boolean
  planRevTaxEx: number
  revTaxIn: number; revTaxEx: number; dia: number
  expTotal: number; expKaito: number; expUnyo: number; expMk: number
  expCreative: number; expDesign: number; expMgmt: number; expCorp: number; expOther: number
  profit: number
}

type FullPL = { monthly: MonthSnap[] }

function fmtYen(v: number, unit: '千' | '万' = '万'): string {
  if (!v) return '—'
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (unit === '万') {
    return `${sign}¥${Math.round(abs / 10000).toLocaleString()}万`
  }
  return `${sign}¥${Math.round(abs / 1000).toLocaleString()}千`
}
function fmtDia(v: number): string {
  if (!v) return '—'
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}
function fmtNum(v: number, suffix = ''): string {
  if (!v && v !== 0) return '—'
  return `${v.toLocaleString()}${suffix}`
}

function DiffCell({ actual, plan }: { actual: number; plan: number }) {
  if (!plan) return <span className="text-gray-300">—</span>
  const diff = actual - plan
  const pct = (diff / plan) * 100
  const positive = diff >= 0
  return (
    <div className="text-[10px] leading-tight">
      <div className={positive ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
        {positive ? '+' : ''}{fmtYen(diff, '万')}
      </div>
      <div className={positive ? 'text-emerald-500' : 'text-red-500'}>
        ({positive ? '+' : ''}{pct.toFixed(1)}%)
      </div>
    </div>
  )
}

export default function MonthlySummaryTable({ latestMonth }: { latestMonth: string }) {
  const [data, setData] = useState<MonthSnap[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/data?action=fullpl')
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok' && j.data?.fullpl?.monthly) {
          setData(j.data.fullpl.monthly)
        } else {
          setError('データが取得できませんでした')
        }
      })
      .catch(() => setError('通信エラー'))
  }, [])

  // 表示対象月：latest を中心に過去3 + 当月 + 未来3 = 7ヶ月
  const displayMonths = (() => {
    if (!data || !latestMonth) return []
    const idx = data.findIndex(m => m.month === latestMonth)
    if (idx < 0) return data.slice(-7)
    const start = Math.max(0, idx - 3)
    const end   = Math.min(data.length, idx + 4)
    return data.slice(start, end)
  })()

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-600">
        {error}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center h-40">
        <div className="flex items-center gap-2 text-gray-300 text-xs">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          月別サマリ読み込み中…
        </div>
      </div>
    )
  }

  // 行定義（指標と取得関数）
  type RowDef = {
    label: string
    accessor: (m: MonthSnap) => number
    format: (v: number) => string
    indent?: boolean
    section?: string
    showDiff?: boolean
  }

  const ROWS: RowDef[] = [
    { section: '売上（税抜）', label: '計画', accessor: m => m.planRevTaxEx, format: v => fmtYen(v) },
    { label: '実績/予測',    accessor: m => m.revTaxEx,     format: v => fmtYen(v) },
    { label: '乖離',         accessor: m => m.revTaxEx - m.planRevTaxEx, format: v => '', showDiff: true },

    { section: 'KPI', label: '応援ダイヤ',     accessor: m => m.dia,    format: v => fmtDia(v) },

    { section: '経費', label: '買取',          accessor: m => m.expKaito,    format: v => fmtYen(v), indent: true },
    { label: '運用',                            accessor: m => m.expUnyo,     format: v => fmtYen(v), indent: true },
    { label: 'マーケ',                          accessor: m => m.expMk,       format: v => fmtYen(v), indent: true },
    { label: 'クリエイティブ',                  accessor: m => m.expCreative, format: v => fmtYen(v), indent: true },
    { label: 'デザイン',                        accessor: m => m.expDesign,   format: v => fmtYen(v), indent: true },
    { label: 'マネジメント',                    accessor: m => m.expMgmt,     format: v => fmtYen(v), indent: true },
    { label: 'コーポレート',                    accessor: m => m.expCorp,     format: v => fmtYen(v), indent: true },
    { label: 'その他',                          accessor: m => m.expOther,    format: v => fmtYen(v), indent: true },
    { label: '経費合計',                        accessor: m => m.expTotal,    format: v => fmtYen(v) },

    { section: '事業利益', label: '事業利益', accessor: m => m.profit, format: v => fmtYen(v) },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-bold text-gray-800 text-sm tracking-tight">月別サマリ（前後3ヶ月）</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">PL(全社) シートの値と連動 ／ 灰背景=予測月</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2.5 text-left font-medium text-gray-500 sticky left-0 bg-white z-10 min-w-[140px]">指標</th>
              {displayMonths.map(m => (
                <th key={m.month}
                    className={`px-3 py-2.5 text-right font-medium ${m.isActual ? 'text-gray-700 bg-white' : 'text-gray-500 bg-gray-50'}`}>
                  <div>{m.month.substring(5)}月</div>
                  <div className="text-[9px] font-normal mt-0.5">
                    {m.isActual ? '実績' : '予測'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => {
              const isSection = !!row.section
              return (
                <tr key={i}
                    className={`${isSection ? 'border-t-2 border-gray-200' : 'border-t border-gray-50'}
                                ${row.label === '乖離' ? 'bg-amber-50/50' : 'hover:bg-gray-50/50'}`}>
                  <td className={`px-4 py-2 sticky left-0 z-10
                                  ${row.indent ? 'pl-8 text-gray-500' : 'font-semibold text-gray-700'}
                                  ${isSection ? 'border-l-4 border-l-blue-400' : ''}
                                  ${row.label === '乖離' ? 'bg-amber-50/50' : 'bg-white'}`}>
                    {isSection && (
                      <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mr-2">
                        {row.section}
                      </span>
                    )}
                    {row.label}
                  </td>
                  {displayMonths.map(m => (
                    <td key={m.month}
                        className={`px-3 py-2 text-right tabular-nums whitespace-nowrap
                                    ${m.isActual ? '' : 'bg-gray-50/40 text-gray-500'}`}>
                      {row.showDiff
                        ? <DiffCell actual={m.revTaxEx} plan={m.planRevTaxEx} />
                        : row.format(row.accessor(m)) || '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
