'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const TimelineSalesChart = dynamic(() => import('./TimelineSalesChart'), { ssr: false })

// ─── 型 ─────────────────────────────────────────────────────
type MonthSnap = {
  month: string
  isActual: boolean

  // 計画
  plan_revTaxEx: number; plan_dia: number; plan_pt: number
  plan_registered: number; plan_active: number; plan_inactive: number
  plan_acquired: number; plan_debut: number
  plan_expTotal: number; plan_expAcq: number; plan_expOps: number; plan_expOther: number
  plan_profit: number; plan_cfOps: number

  // 実績/予測
  revTaxIn: number; revTaxEx: number; dia: number; pt: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number
  registered: number; active: number; acquired: number; debut: number
  expTotal: number; expAcq: number; expOps: number; expOther: number
  profit: number; cfOps: number; bankEst: number; bankAct: number

  _filledFields?: string[]
}

type GrowthMonth = {
  month: string; judge: string; isActual: boolean
  dia?: number; singleThreshold?: number; req3m?: number; minDia?: number
}
type GrowthOffice = { office: string; months: GrowthMonth[] }

const LABEL_COL = '240px'

// ─── フォーマッタ ────────────────────────────────────────────
function fmtYen(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (v === 0) return '¥0'
  const sign = v < 0 ? '-' : ''
  return `${sign}¥${Math.round(Math.abs(v) / 10000).toLocaleString()}万`
}
function fmtDia(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (v === 0) return '0'
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}
function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${Math.round(v).toLocaleString()} 人`
}
function fmtPt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (v === 0) return '0'
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万pt` : `${v.toLocaleString()}pt`
}

// ─── UI部品 ──────────────────────────────────────────────────
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

// ─── 行定義型 ────────────────────────────────────────────────
type Fmt = (v: number | null | undefined) => string
type RowDef = {
  label: string
  planKey?: keyof MonthSnap     // 計画値のキー
  actualKey: keyof MonthSnap    // 実績/予測値のキー
  format: Fmt
  info: string
  filledKey?: string            // 補完判定キー
  actualOnly?: boolean          // 実績のみ（計画なし）
}
type SectionDef = {
  title: string                  // セクション見出し
  parent: RowDef                 // 親項目（計画/実績/乖離の3行を表示）
  children?: RowDef[]            // 子項目（クリック展開、実績のみ表示）
  hasDiff?: boolean              // 乖離行を表示するか（デフォルト true）
}

// ─── 行構造定義 ──────────────────────────────────────────────
const SECTIONS: SectionDef[] = [
  {
    title: '売上',
    parent: { label: '総売上（税抜）', planKey: 'plan_revTaxEx', actualKey: 'revTaxEx', format: fmtYen, info: '計画=PL Row 4 ／ 実績・予測=PL Row 80', filledKey: 'revTaxEx' },
    children: [
      { label: '総ダイヤ数',            planKey: 'plan_dia',        actualKey: 'dia',        format: fmtDia,   info: '計画=Row 5 ／ 実績=Row 81',  filledKey: 'dia' },
      { label: '獲得pt数',              planKey: 'plan_pt',         actualKey: 'pt',         format: fmtPt,    info: '計画=Row 6 ／ 実績=Row 82' },
      { label: '投げ銭報酬（MF）',      actualKey: 'mf',                                     format: fmtYen,   info: '実績=Row 83（計画値なし）', actualOnly: true },
      { label: 'C5：イラスト報酬',      actualKey: 'cpnC5',                                  format: fmtYen,   info: '実績=Row 103', actualOnly: true },
      { label: 'A：Aランク報酬',        actualKey: 'cpnA',                                   format: fmtYen,   info: '実績=Row 109', actualOnly: true },
      { label: 'S：Sランク報酬',        actualKey: 'cpnS',                                   format: fmtYen,   info: '実績=Row 112', actualOnly: true },
      { label: 'レベシェア30%',          actualKey: 'leveshe',                                format: fmtYen,   info: '実績=Row 116', actualOnly: true },
      { label: '累計所属ライバー数',    planKey: 'plan_registered', actualKey: 'registered', format: fmtCount, info: '計画=Row 22 ／ 実績=Row 119' },
      { label: '累計アクティブライバー数', planKey: 'plan_active',  actualKey: 'active',     format: fmtCount, info: '計画=Row 23 ／ 実績=Row 120' },
      { label: '獲得人数',              planKey: 'plan_acquired',   actualKey: 'acquired',   format: fmtCount, info: '計画=Row 25 ／ 実績=Row 121' },
      { label: 'デビュー数',            planKey: 'plan_debut',      actualKey: 'debut',      format: fmtCount, info: '計画=Row 26 ／ 実績=Row 122' },
    ]
  },
  {
    title: '経費',
    parent: { label: '総経費', planKey: 'plan_expTotal', actualKey: 'expTotal', format: fmtYen, info: '計画=Row 41 ／ 実績=Row 138' },
    children: [
      { label: '獲得コスト合計（マーケ+製作）',         planKey: 'plan_expAcq',   actualKey: 'expAcq',   format: fmtYen, info: '計画=Row 42 ／ 実績=Row 139' },
      { label: '運用コスト合計（マネジメント）',         planKey: 'plan_expOps',   actualKey: 'expOps',   format: fmtYen, info: '計画=Row 43 ／ 実績=Row 140' },
      { label: 'その他経費合計（コーポレート+その他）', planKey: 'plan_expOther', actualKey: 'expOther', format: fmtYen, info: '計画=Row 44 ／ 実績=Row 141' },
    ]
  },
  {
    title: '利益',
    parent: { label: '事業利益', planKey: 'plan_profit', actualKey: 'profit', format: fmtYen, info: '計画=Row 62 ／ 実績=Row 270 ／ 売上補完時は (補完売上 − 経費合計) で再計算', filledKey: 'profit' },
  },
  {
    title: 'キャッシュ',
    parent: { label: '現金増減額（営業CF）', planKey: 'plan_cfOps', actualKey: 'cfOps', format: fmtYen, info: '計画=Row 75 ／ 実績=Row 339' },
  },
]

// 残高は計画/実績/乖離の3行構造ではなく、単独の実績行
const STANDALONE_ROWS: RowDef[] = [
  { label: '想定の預金残高 ※実績のみ', actualKey: 'bankEst', format: fmtYen, info: 'PL Row 340 ／ 予測月は空欄', actualOnly: true },
  { label: '実際の預金残高 ※実績のみ', actualKey: 'bankAct', format: fmtYen, info: 'PL Row 341（毎月10日時点）／ 予測月は空欄', actualOnly: true },
]

// ─── 本体 ────────────────────────────────────────────────────
type Props = { latestMonth: string }

export default function MonthlyTimelineView({ latestMonth }: Props) {
  const [data, setData] = useState<MonthSnap[] | null>(null)
  const [growthBonus, setGrowthBonus] = useState<GrowthOffice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedOffices, setExpandedOffices] = useState<Record<string, boolean>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  function toggleOffice(office: string) {
    setExpandedOffices(prev => ({ ...prev, [office]: !prev[office] }))
  }
  function toggleSection(title: string) {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }
  function fmtDiaLocal(v: number) {
    if (!v) return '—'
    return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
  }

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

        // 予測月でPL値が空ならDB_成長予測から補完（成長ボーナス込み）
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

  const gridStyle = { gridTemplateColumns: `${LABEL_COL} repeat(${displayMonths.length}, 1fr)` }
  const monthBg = (m: MonthSnap) => m.isActual ? 'bg-white' : 'bg-gray-50/60'
  const monthText = (m: MonthSnap) => m.isActual ? 'text-gray-700' : 'text-gray-500'

  // 事務所×月のマップ
  const judgeMap: Record<string, Record<string, GrowthMonth>> = {}
  growthBonus.forEach(o => {
    judgeMap[o.office] = {}
    o.months.forEach(m => { judgeMap[o.office][m.month] = m })
  })
  const officeOrder = growthBonus
    .map(o => o.office)
    .sort((a) => a.includes('cozoru') ? -1 : 1)

  // グラフデータ
  const revActualPts   = displayMonths.filter(m => m.isActual).map(m => ({ month: m.month, value: m.revTaxEx || 0 }))
  const revPlanPts     = displayMonths.map(m => ({ month: m.month, value: m.plan_revTaxEx || 0 }))
  const revForecastPts = displayMonths.filter(m => !m.isActual).map(m => ({ month: m.month, value: m.revTaxEx || 0 }))
  const expActualPts   = displayMonths.filter(m => m.isActual).map(m => ({ month: m.month, value: m.expTotal || 0 }))
  const expPlanPts     = displayMonths.map(m => ({ month: m.month, value: m.plan_expTotal || 0 }))
  const expForecastPts = displayMonths.filter(m => !m.isActual).map(m => ({ month: m.month, value: m.expTotal || 0 }))

  // ─── 子行レンダリング（実績のみ） ──────────────────────────
  function renderActualRow(row: RowDef, key: string, isChild: boolean = false) {
    return (
      <div key={key} className={`grid border-t border-gray-50 hover:bg-gray-50/30`} style={gridStyle}>
        <div className={`px-4 py-2 flex items-center text-xs ${isChild ? 'pl-10 text-gray-500' : 'font-semibold text-gray-700'}`}>
          {row.label}
          <InfoIcon desc={row.info} />
        </div>
        {displayMonths.map(m => {
          const v = m[row.actualKey] as number
          const isFilled = !!(row.filledKey && m._filledFields?.includes(row.filledKey))
          return (
            <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
              <span>
                {row.format(v) || '—'}
                {isFilled && <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="DB_成長予測から補完">★</span>}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── 子行レンダリング（計画 vs 実績、インデント） ──────────
  function renderPlanActualChild(row: RowDef, key: string) {
    if (row.actualOnly) {
      return renderActualRow(row, key, true)
    }
    return (
      <div key={key}>
        {/* 計画 */}
        <div className="grid border-t border-gray-50 hover:bg-gray-50/30" style={gridStyle}>
          <div className="px-4 py-1.5 pl-10 text-[11px] text-gray-500 flex items-center">
            {row.label} <span className="ml-1 text-[9px] text-gray-400">/ 計画</span>
            <InfoIcon desc={row.info} />
          </div>
          {displayMonths.map(m => {
            const v = row.planKey ? (m[row.planKey] as number) : undefined
            return (
              <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[11px] border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                {row.format(v)}
              </div>
            )
          })}
        </div>
        {/* 実績/予測 */}
        <div className="grid border-t border-gray-50 hover:bg-gray-50/30" style={gridStyle}>
          <div className="px-4 py-1.5 pl-10 text-[11px] text-gray-500 flex items-center">
            <span className="ml-0 text-[9px] text-gray-400">{row.label} / 実績・予測</span>
          </div>
          {displayMonths.map(m => {
            const v = m[row.actualKey] as number
            const isFilled = !!(row.filledKey && m._filledFields?.includes(row.filledKey))
            return (
              <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[11px] border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                {row.format(v)}
                {isFilled && <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="DB_成長予測から補完">★</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── セクションレンダリング ────────────────────────────────
  function renderSection(section: SectionDef) {
    const expanded = !!expandedSections[section.title]
    const hasChildren = !!(section.children && section.children.length > 0)
    const hasDiff = section.hasDiff !== false  // デフォルト true

    return (
      <div key={section.title}>
        {/* 親 計画行（クリックで展開） */}
        <div className={`grid border-t-2 border-gray-200 ${hasChildren ? 'cursor-pointer' : ''} hover:bg-gray-50/30`}
             style={gridStyle}
             onClick={() => hasChildren && toggleSection(section.title)}>
          <div className="px-4 py-2 flex items-center text-xs">
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mr-2">{section.title}</span>
            {hasChildren && (
              <span className={`text-[10px] mr-1.5 transition-transform inline-block ${expanded ? 'rotate-90' : ''} text-gray-400`}>▶</span>
            )}
            <span className="font-semibold text-gray-700">{section.parent.label}</span>
            <span className="ml-2 text-[9px] text-gray-400">計画</span>
            <InfoIcon desc={section.parent.info} />
          </div>
          {displayMonths.map(m => {
            const v = section.parent.planKey ? (m[section.parent.planKey] as number) : undefined
            return (
              <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                {section.parent.format(v)}
              </div>
            )
          })}
        </div>

        {/* 親 実績/予測行 */}
        <div className="grid border-t border-gray-100 hover:bg-gray-50/30" style={gridStyle}>
          <div className="px-4 py-2 flex items-center text-xs">
            <span className="font-semibold text-gray-700 ml-[88px]">{section.parent.label}</span>
            <span className="ml-2 text-[9px] text-gray-400">実績・予測</span>
          </div>
          {displayMonths.map(m => {
            const v = m[section.parent.actualKey] as number
            const isFilled = !!(section.parent.filledKey && m._filledFields?.includes(section.parent.filledKey))
            return (
              <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                {section.parent.format(v)}
                {isFilled && <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="DB_成長予測から補完">★</span>}
              </div>
            )
          })}
        </div>

        {/* 親 乖離行 */}
        {hasDiff && section.parent.planKey && (
          <div className="grid border-t border-gray-100 bg-amber-50/30" style={gridStyle}>
            <div className="px-4 py-2 flex items-center text-xs">
              <span className="font-semibold text-gray-700 ml-[88px]">{section.parent.label}</span>
              <span className="ml-2 text-[9px] text-gray-400">乖離</span>
            </div>
            {displayMonths.map(m => {
              const planV = m[section.parent.planKey!] as number
              const actualV = m[section.parent.actualKey] as number
              return (
                <div key={m.month} className={`px-2 py-1.5 text-right whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)}`}>
                  <DiffCell actual={actualV} plan={planV} />
                </div>
              )
            })}
          </div>
        )}

        {/* 展開時：子項目 */}
        {expanded && hasChildren && section.children!.map((child, ci) => renderPlanActualChild(child, `${section.title}-${ci}`))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-bold text-gray-800 text-sm tracking-tight">月別タイムライン（売上 × 経費 × 成長判定 × 詳細指標）</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          PL(全社) と連動 ／ 親項目は計画/実績・予測/乖離 ／ 展開で子項目表示 ／ 灰背景=予測月 ／ <span className="text-amber-600 font-semibold">★</span>=DB_成長予測補完
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

          {/* ── ① 売上×経費トレンドグラフ ── */}
          <div className="grid border-b border-gray-100" style={gridStyle}>
            <div className="px-4 py-4 flex flex-col justify-center">
              <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">売上 × 経費</div>
              <div className="text-xs text-gray-600 mt-1">距離 = 利益</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#1565c0" strokeWidth="2.5"/></svg>売上実</span>
                <span className="flex items-center gap-1"><svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#e65100" strokeWidth="2.5"/></svg>経費実</span>
                <span className="flex items-center gap-1"><svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#90caf9" strokeWidth="2"/></svg>売上計</span>
                <span className="flex items-center gap-1"><svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#ffb74d" strokeWidth="2"/></svg>経費計</span>
                <span className="flex items-center gap-1"><svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#1565c0" strokeWidth="2" strokeDasharray="4 2"/></svg>売上予</span>
                <span className="flex items-center gap-1"><svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#e65100" strokeWidth="2" strokeDasharray="4 2"/></svg>経費予</span>
              </div>
            </div>
            <div className="h-[260px]" style={{ gridColumn: `2 / span ${displayMonths.length}` }}>
              <TimelineSalesChart
                months={displayMonths.map(m => ({ month: m.month, isActual: m.isActual }))}
                revActual={revActualPts} revPlan={revPlanPts} revForecast={revForecastPts}
                expActual={expActualPts} expPlan={expPlanPts} expForecast={expForecastPts}
              />
            </div>
          </div>

          {/* ── ② 成長判定 ── */}
          {officeOrder.length > 0 && officeOrder.map((office, oi) => {
            const officeData = growthBonus.find(o => o.office === office)
            const isExpanded = !!expandedOffices[office]

            return (
              <div key={office}>
                <div className={`grid cursor-pointer ${oi === 0 ? 'border-t-2 border-gray-200' : 'border-t border-gray-50'} hover:bg-gray-50/50`}
                     style={gridStyle}
                     onClick={() => toggleOffice(office)}>
                  <div className="px-4 py-2.5 flex items-center text-xs">
                    {oi === 0 && (<span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mr-2">成長判定</span>)}
                    <span className={`text-[10px] mr-1.5 transition-transform inline-block ${isExpanded ? 'rotate-90' : ''} text-gray-400`}>▶</span>
                    <span className={`${oi === 0 ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{office}</span>
                    {oi === 0 && <InfoIcon desc="iriam 月次成長判定（◎=最高/○=基準/✖=最低）。事務所名クリックで達成条件を展開。" />}
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

                {isExpanded && officeData && (
                  <>
                    <div className="grid border-t border-gray-50 bg-blue-50/20" style={gridStyle}>
                      <div className="px-4 py-1.5 pl-10 text-[10px] text-gray-500">応援ダイヤ</div>
                      {displayMonths.map(m => {
                        const gm = officeData.months.find(x => x.month === m.month)
                        return (
                          <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[11px] border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                            {gm?.dia ? fmtDiaLocal(gm.dia) : '—'}
                          </div>
                        )
                      })}
                    </div>
                    <div className="grid border-t border-gray-50 bg-blue-50/20" style={gridStyle}>
                      <div className="px-4 py-1.5 pl-10 text-[10px] text-gray-500">単月基準</div>
                      {displayMonths.map(m => {
                        const gm = officeData.months.find(x => x.month === m.month)
                        const dia = gm?.dia || 0
                        const target = gm?.singleThreshold || 0
                        const achieved = target > 0 && dia >= target
                        return (
                          <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[10px] border-l border-gray-100 ${monthBg(m)}`}>
                            {target > 0 ? (
                              <div>
                                <div className={monthText(m)}>{fmtDiaLocal(target)}</div>
                                <div className={`text-[9px] ${achieved ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {achieved ? '✓達成' : `あと${fmtDiaLocal(target - dia)}`}
                                </div>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="grid border-t border-gray-50 bg-blue-50/20" style={gridStyle}>
                      <div className="px-4 py-1.5 pl-10 text-[10px] text-gray-500">3ヶ月基準</div>
                      {displayMonths.map(m => {
                        const gm = officeData.months.find(x => x.month === m.month)
                        const dia = gm?.dia || 0
                        const target = gm?.req3m || 0
                        const achieved = target > 0 && dia >= target
                        return (
                          <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[10px] border-l border-gray-100 ${monthBg(m)}`}>
                            {target > 0 ? (
                              <div>
                                <div className={monthText(m)}>{fmtDiaLocal(target)}</div>
                                <div className={`text-[9px] ${achieved ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {achieved ? '✓達成' : `あと${fmtDiaLocal(target - dia)}`}
                                </div>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {/* ── ③ セクション（売上/経費/利益/CF） ── */}
          {SECTIONS.map(renderSection)}

          {/* ── ④ 単独行（預金残高） ── */}
          {STANDALONE_ROWS.map((row, i) => renderActualRow(row, `standalone-${i}`, false))}
        </div>
      </div>
    </div>
  )
}
