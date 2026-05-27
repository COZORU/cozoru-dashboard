'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const TimelineSalesChart = dynamic(() => import('./TimelineSalesChart'), { ssr: false })

// ─── 型 ─────────────────────────────────────────────────────
type MonthSnap = {
  month: string
  isActual: boolean

  plan_revTaxEx: number; plan_dia: number; plan_pt: number
  plan_registered: number; plan_active: number; plan_inactive: number
  plan_acquired: number; plan_debut: number
  plan_expTotal: number; plan_expAcq: number; plan_expOps: number; plan_expOther: number
  plan_profit: number; plan_cfOps: number

  revTaxIn: number; revTaxEx: number; dia: number; pt: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number
  registered: number; active: number; acquired: number; debut: number
  expTotal: number; expAcq: number; expOps: number; expOther: number
  profit: number; cfOps: number; bankEst: number; bankAct: number

  // 事業外入金/出金（CF内訳）
  nonOpsIn: number; nonOpsIn_revenue: number; nonOpsIn_groupTx: number
  nonOpsIn_loanGrant: number; nonOpsIn_other: number
  nonOpsOut: number; nonOpsOut_payment: number; nonOpsOut_groupTx: number
  nonOpsOut_repay: number; nonOpsOut_realty: number; nonOpsOut_other: number
  nonOpsOut_tax: number

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

/** 達成率セル
 *  reverse=true は経費系（100%以下が良い→緑、超過→赤）
 */
function RateCell({ actual, plan, reverse }: { actual: number; plan: number; reverse?: boolean }) {
  if (!plan || !actual) return <span className="text-gray-300">—</span>
  const rate = (actual / plan) * 100
  const isGood = reverse ? rate <= 100 : rate >= 100
  return (
    <div className={`text-xs font-semibold tabular-nums ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>
      {rate.toFixed(1)}%
    </div>
  )
}

// ─── 行定義型 ────────────────────────────────────────────────
type Fmt = (v: number | null | undefined) => string
type RowDef = {
  label: string
  planKey?: keyof MonthSnap
  actualKey: keyof MonthSnap
  format: Fmt
  info: string
  filledKey?: string
  actualOnly?: boolean
  subChildren?: RowDef[]   // 孫展開（内訳）
  predictUndefined?: boolean  // 予測月は「未定」表示
}
type SectionDef = {
  title: string
  parent: RowDef
  children?: RowDef[]
  rateReverse?: boolean   // 達成率の色判定を逆にする（経費）
  noRate?: boolean        // 達成率ブロックには表示しない（利益・キャッシュ）
}

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
    rateReverse: true,
    parent: { label: '総経費', planKey: 'plan_expTotal', actualKey: 'expTotal', format: fmtYen, info: '計画=Row 41 ／ 実績=Row 138' },
    children: [
      { label: '獲得コスト合計（マーケ+製作）',         planKey: 'plan_expAcq',   actualKey: 'expAcq',   format: fmtYen, info: '計画=Row 42 ／ 実績=Row 139' },
      { label: '運用コスト合計（マネジメント）',         planKey: 'plan_expOps',   actualKey: 'expOps',   format: fmtYen, info: '計画=Row 43 ／ 実績=Row 140' },
      { label: 'その他経費合計（コーポレート+その他）', planKey: 'plan_expOther', actualKey: 'expOther', format: fmtYen, info: '計画=Row 44 ／ 実績=Row 141' },
    ]
  },
  {
    title: '利益',
    noRate: true,
    parent: { label: '事業利益', planKey: 'plan_profit', actualKey: 'profit', format: fmtYen, info: '計画=Row 62 ／ 実績=Row 270 ／ 売上補完時は (補完売上 − 経費合計) で再計算 ／ クリックで事業外入出金を展開', filledKey: 'profit' },
    children: [
      {
        label: '事業外入金', actualKey: 'nonOpsIn', format: fmtYen, actualOnly: true,
        info: 'PL Row 271（合計）／ クリックで内訳を展開',
        subChildren: [
          { label: '事業外収益',                              actualKey: 'nonOpsIn_revenue',   format: fmtYen, info: 'PL Row 272', actualOnly: true },
          { label: 'グループ資金移動：入金',                    actualKey: 'nonOpsIn_groupTx',   format: fmtYen, info: 'PL Row 282', actualOnly: true },
          { label: '借入金・出資金・補助金・給付金・還付金',     actualKey: 'nonOpsIn_loanGrant', format: fmtYen, info: 'PL Row 285', actualOnly: true },
          { label: 'その他・不明',                            actualKey: 'nonOpsIn_other',     format: fmtYen, info: 'PL Row 292', actualOnly: true },
        ]
      },
      {
        label: '事業外出金', actualKey: 'nonOpsOut', format: fmtYen, actualOnly: true,
        info: 'PL Row 293（合計）／ クリックで内訳を展開',
        subChildren: [
          { label: '事業外支払',           actualKey: 'nonOpsOut_payment', format: fmtYen, info: 'PL Row 294', actualOnly: true },
          { label: 'グループ資金移動：出金', actualKey: 'nonOpsOut_groupTx', format: fmtYen, info: 'PL Row 317', actualOnly: true },
          { label: '返済額・買戻額',       actualKey: 'nonOpsOut_repay',   format: fmtYen, info: 'PL Row 320', actualOnly: true },
          { label: '不動産関連',           actualKey: 'nonOpsOut_realty',  format: fmtYen, info: 'PL Row 324', actualOnly: true },
          { label: 'その他・不明',         actualKey: 'nonOpsOut_other',   format: fmtYen, info: 'PL Row 329', actualOnly: true },
          { label: '税金等',               actualKey: 'nonOpsOut_tax',     format: fmtYen, info: 'PL Row 332', actualOnly: true },
        ]
      },
    ]
  },
  {
    title: 'キャッシュ',
    noRate: true,
    parent: { label: '現金増減額（営業CF）', planKey: 'plan_cfOps', actualKey: 'cfOps', format: fmtYen, info: '計画=Row 75 ／ 実績=Row 339 ／ 事業利益 + 事業外入金 − 事業外出金' },
  },
]

const STANDALONE_ROWS: RowDef[] = [
  { label: '想定の預金残高', actualKey: 'bankEst', format: fmtYen,
    info: 'PL Row 340 ／ 予測月 ★ は「直近実残高 + 累積補完CF」で算出（補完CF = 補完事業利益 + 事業外入金 − 事業外出金）',
    actualOnly: true, filledKey: 'bankEst' },
  { label: '実際の預金残高', actualKey: 'bankAct', format: fmtYen,
    info: 'PL Row 341（毎月10日時点）／ 予測月は未定',
    actualOnly: true, predictUndefined: true },
]

// ─── 本体 ────────────────────────────────────────────────────
type Props = { latestMonth: string }

// 事務所別ドリルダウン用（3次元: month → office → key → value）
type OfficeMonthly = Record<string, Record<string, Record<string, number>>>
const DRILLDOWN_OFFICES = ['cozoru:全社', 'ライブナウV', 'Tolance:全社']
const OFFICE_SHORT_LABEL: Record<string, string> = {
  'cozoru:全社':  'cozoru',
  'ライブナウV':   'ライブナウV',
  'Tolance:全社': 'Tolance',
}
// actualKey と PL(個社別) 取得キーのマッピング（事務所別取得可能な指標のみ）
const ACTUAL_TO_OFFICE_KEY: Record<string, string> = {
  revTaxEx:   'revTaxEx',
  dia:        'dia',
  mf:         'mf',
  cpnC5:      'cpnC5',
  cpnA:       'cpnA',
  cpnS:       'cpnS',
  leveshe:    'leveshe',
  registered: 'registered',
  active:     'active',
  debut:      'debut',
}

export default function MonthlyTimelineView({ latestMonth }: Props) {
  const [data, setData] = useState<MonthSnap[] | null>(null)
  const [growthBonus, setGrowthBonus] = useState<GrowthOffice[]>([])
  const [officeMonthly, setOfficeMonthly] = useState<OfficeMonthly>({})
  const [error, setError] = useState<string | null>(null)
  const [expandedOffices, setExpandedOffices] = useState<Record<string, boolean>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [expandedChildren, setExpandedChildren] = useState<Record<string, boolean>>({})
  const [showPlan,   setShowPlan]   = useState(true)
  const [showActual, setShowActual] = useState(true)
  const [showRate,   setShowRate]   = useState(true)

  function toggleOffice(office: string) {
    setExpandedOffices(prev => ({ ...prev, [office]: !prev[office] }))
  }
  function toggleSection(title: string) {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }
  function toggleChild(key: string) {
    setExpandedChildren(prev => ({ ...prev, [key]: !prev[key] }))
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
            // 補完事業利益 = 補完売上 − 経費合計
            out.profit = out.revTaxEx - m.expTotal
            out._filledFields!.push('profit')
            // 補完CF = 補完事業利益 + 事業外入金 − 事業外出金（事業外は PL 値を流用）
            out.cfOps = out.profit + (m.nonOpsIn || 0) - (m.nonOpsOut || 0)
            out._filledFields!.push('cfOps')
          }
          return out
        })

        // 想定残高（bankEst）の予測月を「直近実残高 + 累積補完CF」で再計算
        const sorted = [...merged].sort((a, b) => a.month.localeCompare(b.month))
        let lastActualIdx = -1
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].isActual) lastActualIdx = i
        }
        if (lastActualIdx >= 0) {
          let runningBalance = sorted[lastActualIdx].bankAct || 0
          for (let i = lastActualIdx + 1; i < sorted.length; i++) {
            const m = sorted[i]
            runningBalance += (m.cfOps || 0)
            m.bankEst = runningBalance
            m._filledFields = [...(m._filledFields || []), 'bankEst']
          }
        }

        setData(sorted)
        setGrowthBonus(sum.growthBonus?.offices || [])
        setOfficeMonthly(plRes.data.fullpl.officeMonthly || {})
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

  const judgeMap: Record<string, Record<string, GrowthMonth>> = {}
  growthBonus.forEach(o => {
    judgeMap[o.office] = {}
    o.months.forEach(m => { judgeMap[o.office][m.month] = m })
  })
  const officeOrder = growthBonus.map(o => o.office).sort((a) => a.includes('cozoru') ? -1 : 1)

  // グラフデータ（混合グラフ: 売上計画=折れ線、売上/経費 実績=棒）
  const revPlanPts   = displayMonths.map(m => ({ month: m.month, value: m.plan_revTaxEx || 0 }))
  const revActualPts = displayMonths.map(m => ({ month: m.month, value: m.revTaxEx      || 0 }))
  const expActualPts = displayMonths.map(m => ({ month: m.month, value: m.expTotal      || 0 }))

  // ─── 大ブロック見出し（タイトル + 月情報を1行に） ────────
  function BlockHeader({ title, color, bgColor, open, onToggle, subtitle }: {
    title: string; color: string; bgColor: string; open: boolean; onToggle: () => void; subtitle?: string
  }) {
    return (
      <div className="grid cursor-pointer transition-colors hover:brightness-95"
           style={{ ...gridStyle, borderTop: `4px solid ${color}`, backgroundColor: bgColor }}
           onClick={onToggle}>
        {/* 左：タイトル */}
        <div className="px-4 py-3 flex items-center font-bold text-sm" style={{ color }}>
          <span className={`mr-2 text-xs transition-transform inline-block ${open ? 'rotate-90' : ''}`}>▶</span>
          {title}
          {subtitle && <span className="ml-3 text-[9px] text-gray-500 font-normal">{subtitle}</span>}
        </div>
        {/* 右：各月セル */}
        {displayMonths.map(m => (
          <div key={m.month} className={`px-2 py-2 text-center border-l border-white/40 flex flex-col justify-center`}>
            <span className="text-xs font-bold" style={{ color }}>{m.month.substring(5)}月</span>
            <span className="text-[9px] text-gray-500 font-normal">{m.isActual ? '実績' : '予測'}</span>
          </div>
        ))}
      </div>
    )
  }

  // 計画値行
  function renderPlanRow(row: RowDef, key: string, isChild: boolean) {
    if (row.actualOnly) return null
    return (
      <div key={key} className="grid border-t border-gray-50 hover:bg-gray-50/30" style={gridStyle}>
        <div className={`px-4 py-2 flex items-center text-xs ${isChild ? 'pl-10 text-gray-500' : 'font-semibold text-gray-700'}`}>
          {row.label}
          <InfoIcon desc={row.info} />
        </div>
        {displayMonths.map(m => {
          const v = row.planKey ? (m[row.planKey] as number) : undefined
          return (
            <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
              {row.format(v)}
            </div>
          )
        })}
      </div>
    )
  }

  // 実績値行（子項目の場合はクリックで事務所別ドリルダウン or subChildren展開）
  function renderActualRow(row: RowDef, key: string, isChild: boolean) {
    const officeKey = ACTUAL_TO_OFFICE_KEY[row.actualKey as string]
    const hasSubChildren = !!(row.subChildren && row.subChildren.length > 0)
    const drillable = isChild && (!!officeKey || hasSubChildren)
    const isChildExpanded = drillable && !!expandedChildren[key]

    return (
      <>
        <div key={key} className={`grid border-t border-gray-50 hover:bg-gray-50/30 ${drillable ? 'cursor-pointer' : ''}`}
             style={gridStyle}
             onClick={() => drillable && toggleChild(key)}>
          <div className={`px-4 py-2 flex items-center text-xs ${isChild ? 'pl-10 text-gray-500' : 'font-semibold text-gray-700'}`}>
            {drillable && (
              <span className={`text-[10px] mr-1.5 transition-transform inline-block ${isChildExpanded ? 'rotate-90' : ''} text-gray-400`}>▶</span>
            )}
            {row.label}
            <InfoIcon desc={row.info} />
          </div>
          {displayMonths.map(m => {
            const v = m[row.actualKey] as number
            const isFilled = !!(row.filledKey && m._filledFields?.includes(row.filledKey))
            // 予測月で「未定」表示
            if (row.predictUndefined && !m.isActual) {
              return (
                <div key={m.month} className={`px-2 py-2 text-right whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} text-gray-400 italic`}>
                  未定
                </div>
              )
            }
            return (
              <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                {row.format(v)}
                {isFilled && <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="補完値">★</span>}
              </div>
            )
          })}
        </div>

        {/* 子項目展開時：内訳（subChildren）優先、なければ事務所別 */}
        {isChildExpanded && hasSubChildren && row.subChildren!.map((sub, si) => (
          <div key={`${key}-sub-${si}`} className="grid border-t border-gray-50 bg-blue-50/20 hover:bg-blue-50/40" style={gridStyle}>
            <div className="px-4 py-1.5 pl-14 text-[10px] text-gray-500 flex items-center">
              ┣ {sub.label}
              <InfoIcon desc={sub.info} />
            </div>
            {displayMonths.map(m => {
              const v = m[sub.actualKey] as number
              return (
                <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[10px] border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                  {sub.format(v)}
                </div>
              )
            })}
          </div>
        ))}

        {isChildExpanded && !hasSubChildren && officeKey && DRILLDOWN_OFFICES.map(office => (
          <div key={`${key}-${office}`} className="grid border-t border-gray-50 bg-blue-50/20 hover:bg-blue-50/40" style={gridStyle}>
            <div className="px-4 py-1.5 pl-14 text-[10px] text-gray-500">┣ {OFFICE_SHORT_LABEL[office] || office}</div>
            {displayMonths.map(m => {
              const v = officeMonthly[m.month]?.[office]?.[officeKey]
              return (
                <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[10px] border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                  {v === undefined || v === null ? '—' : row.format(v)}
                </div>
              )
            })}
          </div>
        ))}
      </>
    )
  }

  // 達成率行
  function renderRateRow(row: RowDef, key: string, isChild: boolean, reverse: boolean) {
    if (row.actualOnly || !row.planKey) return null
    return (
      <div key={key} className="grid border-t border-gray-50 hover:bg-gray-50/30" style={gridStyle}>
        <div className={`px-4 py-2 flex items-center text-xs ${isChild ? 'pl-10 text-gray-500' : 'font-semibold text-gray-700'}`}>
          {row.label}
          <InfoIcon desc={`${row.info} ／ 達成率 = 実績÷計画×100% ${reverse ? '（経費：100%以下が良い）' : ''}`} />
        </div>
        {displayMonths.map(m => {
          const planV = m[row.planKey!] as number
          const actualV = m[row.actualKey] as number
          return (
            <div key={m.month} className={`px-2 py-2 text-right whitespace-nowrap border-l border-gray-100 ${monthBg(m)}`}>
              <RateCell actual={actualV} plan={planV} reverse={reverse} />
            </div>
          )
        })}
      </div>
    )
  }

  // セクション群レンダラー
  function renderSectionGroup(mode: 'plan' | 'actual' | 'rate') {
    return SECTIONS.map(section => {
      // 達成率モードで noRate のセクション（利益・キャッシュ）はスキップ
      if (mode === 'rate' && section.noRate) return null

      const expanded = !!expandedSections[section.title]
      const hasChildren = !!(section.children && section.children.length > 0)
      const reverse = !!section.rateReverse

      return (
        <div key={`${mode}-${section.title}`}>
          {/* 親項目 */}
          <div className={`grid border-t-2 border-gray-200 ${hasChildren ? 'cursor-pointer' : ''} hover:bg-gray-50/30`}
               style={gridStyle}
               onClick={() => hasChildren && toggleSection(section.title)}>
            <div className="px-4 py-2 flex items-center text-xs">
              <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mr-2">{section.title}</span>
              {hasChildren && (
                <span className={`text-[10px] mr-1.5 transition-transform inline-block ${expanded ? 'rotate-90' : ''} text-gray-400`}>▶</span>
              )}
              <span className="font-semibold text-gray-700">{section.parent.label}</span>
              <InfoIcon desc={section.parent.info} />
            </div>
            {displayMonths.map(m => {
              if (mode === 'plan') {
                const v = section.parent.planKey ? (m[section.parent.planKey] as number) : undefined
                return (
                  <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                    {section.parent.format(v)}
                  </div>
                )
              }
              if (mode === 'actual') {
                const v = m[section.parent.actualKey] as number
                const isFilled = !!(section.parent.filledKey && m._filledFields?.includes(section.parent.filledKey))
                return (
                  <div key={m.month} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-xs border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                    {section.parent.format(v)}
                    {isFilled && <span className="text-amber-500 text-[10px] ml-0.5 font-bold" title="DB_成長予測から補完">★</span>}
                  </div>
                )
              }
              // rate
              if (!section.parent.planKey) return <div key={m.month} className={`px-2 py-2 border-l border-gray-100 ${monthBg(m)}`} />
              const planV = m[section.parent.planKey] as number
              const actualV = m[section.parent.actualKey] as number
              return (
                <div key={m.month} className={`px-2 py-2 text-right whitespace-nowrap border-l border-gray-100 ${monthBg(m)}`}>
                  <RateCell actual={actualV} plan={planV} reverse={reverse} />
                </div>
              )
            })}
          </div>

          {/* 子項目 */}
          {expanded && hasChildren && section.children!.map((child, ci) => {
            if (mode === 'plan')   return renderPlanRow(child, `${mode}-${section.title}-${ci}`, true)
            if (mode === 'actual') return renderActualRow(child, `${mode}-${section.title}-${ci}`, true)
            return renderRateRow(child, `${mode}-${section.title}-${ci}`, true, reverse)
          })}

        </div>
      )
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-bold text-gray-800 text-sm tracking-tight">月別タイムライン</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          【計画】【実績・予測】【達成率】の3ブロック構造 ／ 灰背景=予測月 ／ <span className="text-amber-600 font-semibold">★</span>=DB_成長予測補完
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">

          {/* ── 月ヘッダー（sticky） ── */}
          <div className="grid border-b-2 border-gray-200 bg-gradient-to-b from-gray-50 to-white sticky top-0 z-20" style={gridStyle}>
            <div className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-white">指標 / 月</div>
            {displayMonths.map(m => (
              <div key={m.month} className={`px-2 py-3 text-center border-l border-gray-100 ${monthBg(m)}`}>
                <div className={`text-sm font-bold ${monthText(m)}`}>{m.month.substring(5)}月</div>
                <div className="text-[9px] font-medium mt-0.5 text-gray-400">{m.isActual ? '実績' : '予測'}</div>
              </div>
            ))}
          </div>

          {/* ── グラフ（混合: 計画=線、実績/予測=棒） ── */}
          <div className="grid border-b border-gray-100" style={gridStyle}>
            <div className="px-4 py-4 flex flex-col justify-center">
              <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">経営トレンド</div>
              <div className="text-xs text-gray-600 mt-1">計画 vs 実績</div>
              <div className="flex flex-col gap-1 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1">
                  <svg width="14" height="6"><rect x="0" y="0" width="14" height="6" fill="#1565c0"/></svg>
                  売上 実績/予測
                </span>
                <span className="flex items-center gap-1">
                  <svg width="14" height="6"><rect x="0" y="0" width="14" height="6" fill="#e65100"/></svg>
                  経費 実績/予測
                </span>
                <span className="flex items-center gap-1">
                  <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#1565c0" strokeWidth="2" strokeDasharray="4 2"/></svg>
                  売上 計画
                </span>
              </div>
            </div>
            <div className="h-[260px]" style={{ gridColumn: `2 / span ${displayMonths.length}` }}>
              <TimelineSalesChart
                months={displayMonths.map(m => ({ month: m.month, isActual: m.isActual }))}
                revPlan={revPlanPts}
                revActual={revActualPts}
                expActual={expActualPts}
              />
            </div>
          </div>

          {/* ── 成長判定 ── */}
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
                    {[
                      { label: '応援ダイヤ', target: null as null | ((gm: GrowthMonth | undefined) => number | undefined) },
                      { label: '単月基準',   target: (gm: GrowthMonth | undefined) => gm?.singleThreshold },
                      { label: '3ヶ月基準',  target: (gm: GrowthMonth | undefined) => gm?.req3m },
                    ].map((row, ri) => (
                      <div key={ri} className="grid border-t border-gray-50 bg-blue-50/20" style={gridStyle}>
                        <div className="px-4 py-1.5 pl-10 text-[10px] text-gray-500">{row.label}</div>
                        {displayMonths.map(m => {
                          const gm = officeData.months.find(x => x.month === m.month)
                          const dia = (gm?.dia || 0)
                          if (row.target == null) {
                            return (
                              <div key={m.month} className={`px-2 py-1.5 text-right tabular-nums text-[11px] border-l border-gray-100 ${monthBg(m)} ${monthText(m)}`}>
                                {dia ? fmtDiaLocal(dia) : '—'}
                              </div>
                            )
                          }
                          const target = (row.target(gm) || 0)
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
                    ))}
                  </>
                )}
              </div>
            )
          })}

          {/* ━━━━━━━━━━━━ 📋 計画 ━━━━━━━━━━━━ */}
          <BlockHeader title="📋 計画" subtitle="経営計画（PL シート上部 Row 4-75）"
                       color="#1565c0" bgColor="#e3f2fd"
                       open={showPlan} onToggle={() => setShowPlan(!showPlan)} />
          {showPlan && renderSectionGroup('plan')}

          {/* ━━━━━━━━━━━━ 📊 実績・予測 ━━━━━━━━━━━━ */}
          <BlockHeader title="📊 実績・予測" subtitle="PL シート下部 Row 79-341 ／ 予測月は DB_成長予測補完"
                       color="#2e7d32" bgColor="#e8f5e9"
                       open={showActual} onToggle={() => setShowActual(!showActual)} />
          {showActual && (
            <>
              {renderSectionGroup('actual')}
              {STANDALONE_ROWS.map((row, i) => renderActualRow(row, `standalone-${i}`, false))}
            </>
          )}

          {/* ━━━━━━━━━━━━ 🎯 達成率 ━━━━━━━━━━━━ */}
          <BlockHeader title="🎯 達成率" subtitle="実績/予測 ÷ 計画 × 100% ／ 売上=100%以上が緑、経費=100%以下が緑"
                       color="#ef6c00" bgColor="#fff3e0"
                       open={showRate} onToggle={() => setShowRate(!showRate)} />
          {showRate && renderSectionGroup('rate')}

        </div>
      </div>
    </div>
  )
}
