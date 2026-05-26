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
  _filledFields?: string[]  // 補完したフィールド一覧
}

function fmtYen(v: number): string {
  if (!v && v !== 0) return '—'
  if (v === 0) return '—'
  const sign = v < 0 ? '-' : ''
  return `${sign}¥${Math.round(Math.abs(v) / 10000).toLocaleString()}万`
}
function fmtDia(v: number): string {
  if (!v) return '—'
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

function DiffCell({ actual, plan }: { actual: number; plan: number }) {
  if (!plan || !actual) return <span className="text-gray-300">—</span>
  const diff = actual - plan
  const pct = (diff / plan) * 100
  const positive = diff >= 0
  return (
    <div className="text-[10px] leading-tight">
      <div className={positive ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
        {positive ? '+' : ''}{fmtYen(diff)}
      </div>
      <div className={positive ? 'text-emerald-500' : 'text-red-500'}>
        ({positive ? '+' : ''}{pct.toFixed(1)}%)
      </div>
    </div>
  )
}

// 行ラベル横に「ⓘ」アイコン、ホバーでデータソース説明
function InfoIcon({ desc }: { desc: string }) {
  return (
    <span className="relative inline-block ml-1 group align-middle">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-300 text-gray-400 text-[8px] font-bold cursor-help hover:border-blue-400 hover:text-blue-500">
        i
      </span>
      <span className="absolute z-30 left-5 top-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-[10px] text-gray-600 leading-snug hidden group-hover:block">
        {desc}
      </span>
    </span>
  )
}

export default function MonthlySummaryTable({ latestMonth }: { latestMonth: string }) {
  const [data, setData] = useState<MonthSnap[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/data?action=fullpl').then(r => r.json()),
      fetch('/api/data?action=summary').then(r => r.json())
    ])
      .then(([plRes, sumRes]) => {
        if (plRes.status !== 'ok' || !plRes.data?.fullpl?.monthly) {
          setError('PLデータが取得できませんでした')
          return
        }
        const monthly: MonthSnap[] = plRes.data.fullpl.monthly
        const sum = sumRes.data?.summary || {}
        const revForecast: { month: string; revTaxIn: number }[] = sum.revForecast || []
        const diaForecast: { month: string; dia: number }[]      = sum.diaForecast || []
        const revMap = Object.fromEntries(revForecast.map(f => [f.month, f.revTaxIn / 1.1]))
        const diaMap = Object.fromEntries(diaForecast.map(f => [f.month, f.dia]))

        const merged = monthly.map(m => {
          if (m.isActual) return m
          const out: MonthSnap = { ...m, _filledFields: [] }
          if ((!m.revTaxEx || m.revTaxEx === 0) && revMap[m.month]) {
            out.revTaxEx = revMap[m.month]
            out.revTaxIn = revMap[m.month] * 1.1
            out._filledFields!.push('revTaxEx')
          }
          if ((!m.dia || m.dia === 0) && diaMap[m.month]) {
            out.dia = diaMap[m.month]
            out._filledFields!.push('dia')
          }
          if (out._filledFields!.includes('revTaxEx')) {
            out.profit = out.revTaxEx - m.expTotal
            out._filledFields!.push('profit')
          }
          return out
        })
        setData(merged)
      })
      .catch(() => setError('通信エラー'))
  }, [])

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

  type RowDef = {
    label: string
    accessor: (m: MonthSnap) => number
    format: (v: number) => string
    indent?: boolean
    section?: string
    showDiff?: boolean
    info: string                 // ホバー説明
    filledKey?: string           // 補完判定用キー
  }

  const ROWS: RowDef[] = [
    {
      section: '売上（税抜）',
      label: '計画',
      accessor: m => m.planRevTaxEx,
      format: fmtYen,
      info: 'PL(全社) シート 4行目（経営計画値）'
    },
    {
      label: '実績／予測',
      accessor: m => m.revTaxEx,
      format: fmtYen,
      info: 'PL(全社) シート 80行目 ／ 予測月でPL空欄なら DB_成長予測（成長ボーナス込み）÷ 1.1 で補完',
      filledKey: 'revTaxEx'
    },
    {
      label: '乖離',
      accessor: m => m.revTaxEx - m.planRevTaxEx,
      format: v => '',
      showDiff: true,
      info: '実績/予測 − 計画 ／ +は計画超過、−は未達'
    },

    {
      section: 'KPI',
      label: '応援ダイヤ',
      accessor: m => m.dia,
      format: fmtDia,
      info: 'PL(全社) シート 81行目 ／ 予測月でPL空欄なら DB_成長予測（直近3ヶ月平均×成長補正）で補完',
      filledKey: 'dia'
    },

    {
      section: '経費',
      label: '買取',
      accessor: m => m.expKaito,
      format: fmtYen,
      indent: true,
      info: 'PL(全社) シート 139行目（経営計画として全月入力済み）'
    },
    { label: '運用',         accessor: m => m.expUnyo,     format: fmtYen, indent: true, info: 'PL(全社) シート 140行目' },
    { label: 'マーケ',       accessor: m => m.expMk,       format: fmtYen, indent: true, info: 'PL(全社) シート 142行目' },
    { label: 'クリエイティブ', accessor: m => m.expCreative, format: fmtYen, indent: true, info: 'PL(全社) シート 174行目' },
    { label: 'デザイン',     accessor: m => m.expDesign,   format: fmtYen, indent: true, info: 'PL(全社) シート 193行目' },
    { label: 'マネジメント', accessor: m => m.expMgmt,     format: fmtYen, indent: true, info: 'PL(全社) シート 212行目' },
    { label: 'コーポレート', accessor: m => m.expCorp,     format: fmtYen, indent: true, info: 'PL(全社) シート 228行目' },
    { label: 'その他',       accessor: m => m.expOther,    format: fmtYen, indent: true, info: 'PL(全社) シート 237行目' },
    {
      label: '経費合計',
      accessor: m => m.expTotal,
      format: fmtYen,
      info: 'PL(全社) シート 138行目（全月入力済み）'
    },

    {
      section: '事業利益',
      label: '事業利益',
      accessor: m => m.profit,
      format: fmtYen,
      info: 'PL(全社) シート 270行目 ／ 売上を補完した予測月は (補完売上 − 経費合計) で自動再計算',
      filledKey: 'profit'
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-bold text-gray-800 text-sm tracking-tight">月別サマリ（前後3ヶ月）</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          PL(全社) シートの値と連動 ／ 灰背景=予測月 ／ <span className="text-amber-600 font-semibold">★</span> = DB_成長予測（成長ボーナス込み）から補完
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2.5 text-left font-medium text-gray-500 sticky left-0 bg-white z-10 min-w-[180px]">指標</th>
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
                    <InfoIcon desc={row.info} />
                  </td>
                  {displayMonths.map(m => {
                    const isFilled = !!(row.filledKey && m._filledFields?.includes(row.filledKey))
                    return (
                      <td key={m.month}
                          className={`px-3 py-2 text-right tabular-nums whitespace-nowrap
                                      ${m.isActual ? '' : 'bg-gray-50/40 text-gray-500'}`}>
                        {row.showDiff
                          ? <DiffCell actual={m.revTaxEx} plan={m.planRevTaxEx} />
                          : (
                            <span>
                              {row.format(row.accessor(m)) || '—'}
                              {isFilled && (
                                <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="DB_成長予測から補完">★</span>
                              )}
                            </span>
                          )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
