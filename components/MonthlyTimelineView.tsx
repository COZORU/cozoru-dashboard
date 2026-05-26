'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const TimelineSalesChart = dynamic(() => import('./TimelineSalesChart'), { ssr: false })

type MonthSnap = {
  month: string
  isActual: boolean
  planRevTaxEx: number
  revTaxIn: number; revTaxEx: number; dia: number
  expTotal: number; expKaito: number; expUnyo: number; expMk: number
  expCreative: number; expDesign: number; expMgmt: number; expCorp: number; expOther: number
  profit: number
  _filledFields?: string[]
}

type GrowthOffice = { office: string; months: { month: string; judge: string; isActual: boolean }[] }

// 列幅定義（CSS Grid で全セクション統一）
const LABEL_COL = '200px'

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

function InfoIcon({ desc }: { desc: string }) {
  return (
    <span className="relative inline-block ml-1 group align-middle">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-300 text-gray-400 text-[8px] font-bold cursor-help hover:border-blue-400 hover:text-blue-500">i</span>
      <span className="absolute z-30 left-5 top-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-[10px] text-gray-600 leading-snug hidden group-hover:block">
        {desc}
      </span>
    </span>
  )
}

function JudgeBadge({ judge, isActual }: { judge: string; isActual: boolean }) {
  const colors: Record<string, string> = {
    '◎': 'bg-emerald-500 text-white',
    '○': 'bg-amber-400 text-white',
    '✖': 'bg-red-500 text-white',
  }
  const base = colors[judge] || 'bg-gray-100 text-gray-400'
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-sm font-bold ${base} ${isActual ? 'shadow-sm' : 'opacity-50'}`}>
      {judge || '—'}
    </span>
  )
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

type Props = { latestMonth: string }

export default function MonthlyTimelineView({ latestMonth }: Props) {
  const [data, setData] = useState<MonthSnap[] | null>(null)
  const [growthBonus, setGrowthBonus] = useState<GrowthOffice[]>([])
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
        setGrowthBonus(sum.growthBonus?.offices || [])
      })
      .catch(() => setError('通信エラー'))
  }, [])

  // 表示対象月: latest を中心に過去3 + 当月 + 未来3 = 7ヶ月
  const displayMonths = (() => {
    if (!data || !latestMonth) return []
    const idx = data.findIndex(m => m.month === latestMonth)
    if (idx < 0) return data.slice(-7)
    const start = Math.max(0, idx - 3)
    const end   = Math.min(data.length, idx + 4)
    return data.slice(start, end)
  })()

  if (error) {
    return <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-600">{error}</div>
  }
  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center h-40">
        <div className="flex items-center gap-2 text-gray-300 text-xs">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          月別タイムライン読み込み中…
        </div>
      </div>
    )
  }

  // CSS Grid のテンプレート: [指標ラベル列] [7ヶ月の均等列]
  const gridStyle = { gridTemplateColumns: `${LABEL_COL} repeat(${displayMonths.length}, 1fr)` }

  // 事務所×月のマップ
  const judgeMap: Record<string, Record<string, { judge: string; isActual: boolean }>> = {}
  growthBonus.forEach(o => {
    judgeMap[o.office] = {}
    o.months.forEach(m => { judgeMap[o.office][m.month] = { judge: m.judge, isActual: m.isActual } })
  })
  // 順序固定（cozoru → Tolance）
  const officeOrder = growthBonus
    .map(o => o.office)
    .sort((a, b) => a.includes('cozoru') ? -1 : b.includes('cozoru') ? 1 : 0)

  // データ準備
  const actual   = displayMonths.filter(m => m.isActual).map(m => ({ month: m.month, value: m.revTaxEx || 0 }))
  const planPts  = displayMonths.map(m => ({ month: m.month, value: m.planRevTaxEx || 0 }))
  const forecastPts = displayMonths
    .filter(m => !m.isActual)
    .map(m => ({ month: m.month, value: m.revTaxEx || 0 }))

  // 各セルの背景・テキスト色決定
  const monthBg = (m: MonthSnap) => m.isActual ? 'bg-white' : 'bg-gray-50/60'
  const monthText = (m: MonthSnap) => m.isActual ? 'text-gray-700' : 'text-gray-500'

  type RowDef = {
    label: string
    accessor: (m: MonthSnap) => number
    format: (v: number) => string
    indent?: boolean
    section?: string
    showDiff?: boolean
    info: string
    filledKey?: string
  }
  const ROWS: RowDef[] = [
    { section: '売上（税抜）', label: '計画',     accessor: m => m.planRevTaxEx, format: fmtYen, info: 'PL(全社) シート 4行目（経営計画値）' },
    {                          label: '実績／予測', accessor: m => m.revTaxEx,     format: fmtYen, info: 'PL(全社) 80行目／予測月でPL空欄ならDB_成長予測（成長ボーナス込み）÷1.1で補完', filledKey: 'revTaxEx' },
    {                          label: '乖離',     accessor: m => m.revTaxEx - m.planRevTaxEx, format: () => '', showDiff: true, info: '実績/予測 − 計画 ／ +は計画超過、−は未達' },
    { section: 'KPI',          label: '応援ダイヤ', accessor: m => m.dia,    format: fmtDia, info: 'PL(全社) 81行目／予測月でPL空欄ならDB_成長予測 直近3ヶ月平均×成長補正で補完', filledKey: 'dia' },
    { section: '経費',         label: '買取',           accessor: m => m.expKaito,    format: fmtYen, indent: true, info: 'PL(全社) 139行目' },
    {                          label: '運用',           accessor: m => m.expUnyo,     format: fmtYen, indent: true, info: 'PL(全社) 140行目' },
    {                          label: 'マーケ',         accessor: m => m.expMk,       format: fmtYen, indent: true, info: 'PL(全社) 142行目' },
    {                          label: 'クリエイティブ', accessor: m => m.expCreative, format: fmtYen, indent: true, info: 'PL(全社) 174行目' },
    {                          label: 'デザイン',       accessor: m => m.expDesign,   format: fmtYen, indent: true, info: 'PL(全社) 193行目' },
    {                          label: 'マネジメント',   accessor: m => m.expMgmt,     format: fmtYen, indent: true, info: 'PL(全社) 212行目' },
    {                          label: 'コーポレート',   accessor: m => m.expCorp,     format: fmtYen, indent: true, info: 'PL(全社) 228行目' },
    {                          label: 'その他',         accessor: m => m.expOther,    format: fmtYen, indent: true, info: 'PL(全社) 237行目' },
    {                          label: '経費合計',       accessor: m => m.expTotal,    format: fmtYen, info: 'PL(全社) 138行目（全月入力済み）' },
    { section: '事業利益',     label: '事業利益', accessor: m => m.profit, format: fmtYen, info: 'PL(全社) 270行目／売上補完時は (補完売上 − 経費合計) で再計算', filledKey: 'profit' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-bold text-gray-800 text-sm tracking-tight">月別タイムライン（売上トレンド × 成長判定 × 経営指標）</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          PL(全社) と連動 ／ 灰背景=予測月 ／ <span className="text-amber-600 font-semibold">★</span>=DB_成長予測（成長ボーナス込み）から補完
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">

          {/* ── 月ヘッダー ── */}
          <div className="grid border-b-2 border-gray-200 bg-gradient-to-b from-gray-50 to-white" style={gridStyle}>
            <div className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">指標 / 月</div>
            {displayMonths.map(m => (
              <div key={m.month} className={`px-2 py-3 text-center border-l border-gray-100 ${monthBg(m)}`}>
                <div className={`text-sm font-bold ${monthText(m)}`}>{m.month.substring(5)}月</div>
                <div className="text-[9px] font-medium mt-0.5 text-gray-400">{m.isActual ? '実績' : '予測'}</div>
              </div>
            ))}
          </div>

          {/* ── ① 売上トレンドグラフ ── */}
          <div className="grid border-b border-gray-100" style={gridStyle}>
            <div className="px-4 py-4 flex flex-col justify-center">
              <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">売上トレンド</div>
              <div className="text-xs text-gray-600 mt-1">実績 / 計画 / 予測</div>
              <div className="flex flex-col gap-1 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1">
                  <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#1565c0" strokeWidth="2.5"/></svg>実績
                </span>
                <span className="flex items-center gap-1">
                  <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#999" strokeWidth="2"/></svg>計画
                </span>
                <span className="flex items-center gap-1">
                  <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#1565c0" strokeWidth="2" strokeDasharray="4 2"/></svg>予測
                </span>
              </div>
            </div>
            <div className="col-span-7 h-[220px]" style={{ gridColumn: `2 / span ${displayMonths.length}` }}>
              <TimelineSalesChart
                months={displayMonths.map(m => ({ month: m.month, isActual: m.isActual }))}
                actual={actual}
                plan={planPts}
                forecast={forecastPts}
              />
            </div>
          </div>

          {/* ── ② 成長判定（事務所別） ── */}
          {officeOrder.length > 0 && (
            <>
              {officeOrder.map((office, oi) => (
                <div key={office} className={`grid ${oi === 0 ? 'border-t-2 border-gray-200' : 'border-t border-gray-50'} hover:bg-gray-50/30`} style={gridStyle}>
                  <div className="px-4 py-2.5 flex items-center">
                    {oi === 0 && (
                      <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mr-2">成長判定</span>
                    )}
                    <span className={`text-xs ${oi === 0 ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{office}</span>
                    {oi === 0 && <InfoIcon desc="iriam 月次成長判定（◎=最高/○=基準/✖=最低）。Tier係数が補正される。実績=塗りつぶし、予測=透過。" />}
                  </div>
                  {displayMonths.map(m => {
                    const j = judgeMap[office]?.[m.month]
                    return (
                      <div key={m.month} className={`flex items-center justify-center py-2 border-l border-gray-100 ${monthBg(m)}`}>
                        {j ? <JudgeBadge judge={j.judge} isActual={j.isActual} /> : <span className="text-gray-300 text-xs">—</span>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          )}

          {/* ── ③ 月別サマリ（数値） ── */}
          {ROWS.map((row, i) => {
            const isSection = !!row.section
            return (
              <div key={i}
                   className={`grid ${isSection ? 'border-t-2 border-gray-200' : 'border-t border-gray-50'} ${row.label === '乖離' ? 'bg-amber-50/30' : 'hover:bg-gray-50/30'}`}
                   style={gridStyle}>
                <div className={`px-4 py-2 flex items-center
                                ${row.indent ? 'pl-10 text-gray-500' : 'font-semibold text-gray-700'}
                                text-xs`}>
                  {isSection && (
                    <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mr-2">{row.section}</span>
                  )}
                  {row.label}
                  <InfoIcon desc={row.info} />
                </div>
                {displayMonths.map(m => {
                  const isFilled = !!(row.filledKey && m._filledFields?.includes(row.filledKey))
                  return (
                    <div key={m.month}
                         className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                      {row.showDiff
                        ? <DiffCell actual={m.revTaxEx} plan={m.planRevTaxEx} />
                        : (
                          <span>
                            {row.format(row.accessor(m)) || '—'}
                            {isFilled && <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="DB_成長予測から補完">★</span>}
                          </span>
                        )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
