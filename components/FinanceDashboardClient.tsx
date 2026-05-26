'use client'
import { useState } from 'react'
import ChartSection from './ChartSection'

type SectionSnap = {
  revTaxIn: number; revTaxEx: number; dia: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number; registered: number; active: number
  t1: number; t2: number; t3: number; debut: number; c5Count: number
}

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

type GrowthMonthItem = {
  month: string; judge: string; dia: number
  singleThreshold: number; req3m: number; minDia: number; isActual: boolean
}
type GrowthOfficeItem = { office: string; months: GrowthMonthItem[] }

export type SummaryData = {
  latestMonth: string
  current: SectionSnap
  officeSummary: Record<string, SectionSnap>
  pctRevenue: number | null; pctRevTaxEx: number | null
  pctMf: number | null; pctCpnTotal: number | null
  pctLeveshe: number | null; pctDia: number | null; pctDebut: number | null
  trend: TrendItem[]
  revForecast: { month: string; revTaxIn: number }[]
  diaForecast: { month: string; dia: number }[]
  activeForecast: { month: string; active: number }[]
  debutForecast: { month: string; debut: number }[]
  growthBonus?: { offices: GrowthOfficeItem[] }
}

const OFFICE_ORDER = ['全社合計', 'cozoru:全社', 'cozoruレーベル', 'ライブナウV', 'Tolance:全社']
const OFFICE_LABEL: Record<string, string> = {
  '全社合計': '全社',
  'cozoru:全社': 'cozoru',
  'cozoruレーベル': 'cozo-L',
  'ライブナウV': 'ライブナウV',
  'Tolance:全社': 'Tolance',
}

function fmtYen(v: number) {
  return v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`
}
function fmtDia(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

// ─── 成長ボーナス判定バッジ ───────────────────────────────────────────
function JudgeBadge({ judge, forecast = false }: { judge: string; forecast?: boolean }) {
  const map: Record<string, string> = {
    '◎': 'bg-emerald-500 text-white shadow-emerald-200',
    '○': 'bg-amber-400 text-white shadow-amber-200',
    '✖': 'bg-red-500 text-white shadow-red-200',
  }
  const base = map[judge] ?? 'bg-gray-100 text-gray-400'
  return (
    <div className={`w-11 h-11 flex items-center justify-center rounded-xl text-lg font-black select-none
      ${base} ${forecast ? 'opacity-40 ring-2 ring-dashed ring-gray-300' : 'shadow-md'}`}>
      {judge || '—'}
    </div>
  )
}

// ─── 成長ボーナスセクション ──────────────────────────────────────────
function GrowthBonusSection({ gb }: { gb: NonNullable<SummaryData['growthBonus']> }) {
  if (!gb.offices || gb.offices.length === 0) return null
  function fmtM(ym: string) { return ym.substring(5).replace(/^0/, '') + '月' }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-bold text-gray-800 text-sm tracking-tight">成長ボーナス 判定</h2>
        <div className="flex items-center gap-5 text-xs text-gray-500">
          {[
            { color: 'bg-emerald-500', label: '◎ MF+40%' },
            { color: 'bg-amber-400',   label: '○  ±0%' },
            { color: 'bg-red-500',     label: '✖ −30%' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm inline-block ${color}`} />
              {label}
            </span>
          ))}
          <span className="text-gray-300">│</span>
          <span className="text-gray-400 text-[10px]">塗り＝実績　透過＝予測</span>
        </div>
      </div>

      {/* 事務所ごとの行 */}
      <div className="divide-y divide-gray-50">
        {gb.offices.map(office => {
          const actual   = office.months.filter(m => m.isActual).slice(-4)
          const forecast = office.months.filter(m => !m.isActual).slice(0, 3)
          const latest   = actual[actual.length - 1]
          const singleGap = latest ? Math.max(0, latest.singleThreshold - latest.dia) : null
          const req3mGap  = latest ? Math.max(0, latest.req3m - latest.dia) : null

          return (
            <div key={office.office} className="px-6 py-5 flex items-start gap-8 flex-wrap">

              {/* 事務所名 + 今月判定（大） */}
              <div className="w-28 shrink-0">
                <div className="text-xs font-semibold text-gray-500 mb-3">{office.office}</div>
                {latest && (
                  <div className="flex items-center gap-2.5">
                    <JudgeBadge judge={latest.judge} />
                    <div className="text-[10px] text-gray-400 leading-tight">
                      今月<br />{fmtM(latest.month)}
                    </div>
                  </div>
                )}
              </div>

              {/* 実績バッジ列 */}
              <div className="shrink-0">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">実績</div>
                <div className="flex gap-3">
                  {actual.map(m => (
                    <div key={m.month} className="text-center">
                      <div className="text-[10px] text-gray-400 mb-1.5">{fmtM(m.month)}</div>
                      <JudgeBadge judge={m.judge} />
                    </div>
                  ))}
                </div>
              </div>

              {/* 区切り */}
              <div className="self-stretch border-l border-dashed border-gray-200 shrink-0" />

              {/* 予測バッジ列 + 根拠・◎条件数値 */}
              <div className="shrink-0">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">このまま行くと</div>
                <div className="flex gap-4">
                  {forecast.map(m => {
                    const meetsSingle = m.singleThreshold > 0 && m.dia >= m.singleThreshold
                    const meets3m     = m.req3m > 0 && m.dia >= m.req3m
                    return (
                      <div key={m.month} className="flex flex-col items-center">
                        <div className="text-[10px] text-gray-400 mb-1.5">{fmtM(m.month)}(予)</div>
                        <JudgeBadge judge={m.judge} forecast />
                        {/* 根拠・必要数値 */}
                        <div className="mt-2 space-y-1 w-24">
                          {/* 予測値 */}
                          <div className="flex justify-between text-[9px]">
                            <span className="text-gray-400">予測</span>
                            <span className="font-semibold text-gray-600 tabular-nums">{fmtDia(m.dia)}</span>
                          </div>
                          {/* 単月基準 */}
                          {m.singleThreshold > 0 && (
                            <div className="flex justify-between text-[9px]">
                              <span className="text-gray-400">単月◎</span>
                              <span className={`font-semibold tabular-nums ${meetsSingle ? 'text-emerald-600' : 'text-red-500'}`}>
                                {fmtDia(m.singleThreshold)}
                                <span className="ml-0.5">{meetsSingle ? '✓' : '✗'}</span>
                              </span>
                            </div>
                          )}
                          {/* 3ヶ月基準 */}
                          {m.req3m > 0 && (
                            <div className="flex justify-between text-[9px]">
                              <span className="text-gray-400">3M◎</span>
                              <span className={`font-semibold tabular-nums ${meets3m ? 'text-emerald-600' : 'text-red-500'}`}>
                                {fmtDia(m.req3m)}
                                <span className="ml-0.5">{meets3m ? '✓' : '✗'}</span>
                              </span>
                            </div>
                          )}
                          {/* 最低ライン警告 */}
                          {m.minDia > 0 && m.dia < m.minDia && (
                            <div className="text-[9px] text-red-500 font-semibold text-center pt-0.5">
                              最低割れ
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {forecast.length === 0 && (
                    <span className="text-xs text-gray-300 self-center">予測データなし</span>
                  )}
                </div>
              </div>

              {/* ◎達成条件プログレスバー */}
              {latest && (latest.singleThreshold > 0 || latest.req3m > 0) && (
                <>
                  <div className="self-stretch border-l border-gray-100 shrink-0" />
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      {fmtM(latest.month)} の ◎ 条件
                    </div>
                    <div className="space-y-3">
                      {latest.singleThreshold > 0 && (
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-gray-500">単月基準</span>
                            <span className={singleGap === 0 ? 'text-emerald-600 font-bold' : 'text-gray-600 font-medium'}>
                              {singleGap === 0 ? '✓ 達成' : `あと ${fmtDia(singleGap!)} dia`}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${singleGap === 0 ? 'bg-emerald-500' : 'bg-blue-400'}`}
                              style={{ width: `${Math.min(100, (latest.dia / latest.singleThreshold) * 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-300 mt-1">
                            <span>{fmtDia(latest.dia)} dia</span>
                            <span>目標 {fmtDia(latest.singleThreshold)}</span>
                          </div>
                        </div>
                      )}
                      {latest.req3m > 0 && (
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-gray-500">3ヶ月基準</span>
                            <span className={req3mGap === 0 ? 'text-emerald-600 font-bold' : 'text-gray-600 font-medium'}>
                              {req3mGap === 0 ? '✓ 達成' : `あと ${fmtDia(req3mGap!)} dia`}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${req3mGap === 0 ? 'bg-emerald-500' : 'bg-purple-400'}`}
                              style={{ width: `${Math.min(100, (latest.dia / latest.req3m) * 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-300 mt-1">
                            <span>{fmtDia(latest.dia)} dia</span>
                            <span>目標 {fmtDia(latest.req3m)}</span>
                          </div>
                        </div>
                      )}
                      {latest.minDia > 0 && latest.dia < latest.minDia && (
                        <div className="text-xs text-red-600 font-semibold pt-1">
                          ⚠ 最低ライン（{fmtDia(latest.minDia)} dia）割れ
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-6 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
        実績 = RAW_ライバー月次より集計　／　予測 = 直近3ヶ月平均で自動推計　／　判定は DB_成長予測 シートの数式値
      </div>
    </div>
  )
}

// ─── 売上 階層展開コンポーネント ────────────────────────────────────
function SubBar({ label, value, base, colorBar, colorText }: {
  label: string; value: number; base: number
  colorBar: string; colorText: string
}) {
  const pct = base > 0 ? Math.min(100, (value / base) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorBar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold w-16 text-right shrink-0 ${colorText}`}>
        {value ? fmtYen(value) : '—'}
      </span>
    </div>
  )
}

function MiniRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-gray-400 pl-2">{label}</span>
      <span className="font-mono text-gray-600">{value ? fmtYen(value) : '—'}</span>
    </div>
  )
}

function RevenueHierarchy({ off, allOffices, pctRevenue, latestMonth, overrideRevTaxIn, isLatestMonth }: {
  off: Record<string, SectionSnap>
  allOffices: string[]
  pctRevenue: number | null
  latestMonth: string
  overrideRevTaxIn?: number
  isLatestMonth: boolean
}) {
  const [expanded, setExpanded]     = useState(false)
  const [openOffice, setOpenOffice] = useState<string | null>(null)
  const [cpnOpenMap, setCpnOpenMap] = useState<Record<string, boolean>>({})

  const totalSnap  = off['全社合計'] ?? null
  const displayRev = overrideRevTaxIn ?? totalSnap?.revTaxIn ?? 0
  const totalRev   = totalSnap?.revTaxIn ?? 0
  const officeKeys = allOffices.filter(o => o !== '全社合計' && off[o])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
      {/* ── Level 0: 全社合計ヘッダー ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center px-6 py-5 hover:bg-blue-50/40 transition-colors group"
      >
        <div className="flex-1 flex items-center gap-6">
          <div className="text-left">
            <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-0.5">売上（税込）</div>
            <div className="text-3xl font-black text-gray-900 tracking-tight tabular-nums">
              {fmtYen(displayRev)}
            </div>
          </div>
          {pctRevenue !== null && pctRevenue !== undefined && (
            <div className={`flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-xl ${
              pctRevenue >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {pctRevenue >= 0 ? '▲' : '▼'} {Math.abs(Math.round(pctRevenue))}%
              <span className="text-[10px] font-normal text-gray-400 ml-1">前月比</span>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-2 text-xs font-medium transition-colors
          ${expanded ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500'}`}>
          <span className="text-gray-300">{latestMonth}</span>
          {isLatestMonth
            ? <><span className={`text-sm transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▼</span><span>個社別</span></>
            : <span className="text-gray-300 text-[10px]">個社別は最新月のみ</span>
          }
        </div>
      </button>

      {/* ── Level 1: 事務所ブレークダウン ── */}
      {expanded && isLatestMonth && (
        <div className="border-t border-gray-100">
          {officeKeys.map(office => {
            const s        = off[office]
            if (!s) return null
            const pctShare = totalRev > 0 ? (s.revTaxIn / totalRev) * 100 : 0
            const isOpen   = openOffice === office
            const cpnTotal = (s.cpnC5||0)+(s.cpnB2||0)+(s.cpnA||0)+(s.cpnS||0)+(s.cpnOther||0)
            const tax      = Math.max(0, s.revTaxIn - s.revTaxEx)
            const cpnOpen  = cpnOpenMap[office] ?? false

            return (
              <div key={office} className="border-b border-gray-50 last:border-0">
                {/* 事務所行 */}
                <button
                  onClick={() => setOpenOffice(isOpen ? null : office)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/80 transition-colors group"
                >
                  <div className="w-24 text-sm font-bold text-gray-700 text-left shrink-0">
                    {OFFICE_LABEL[office] || office}
                  </div>
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, pctShare)}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 w-9 text-right shrink-0">
                      {Math.round(pctShare)}%
                    </div>
                  </div>
                  <div className="text-lg font-bold text-gray-800 w-24 text-right shrink-0 tabular-nums">
                    {fmtYen(s.revTaxIn)}
                  </div>
                  <div className={`text-xs text-gray-300 w-4 transition-transform duration-150 group-hover:text-blue-400
                    ${isOpen ? 'rotate-180 text-blue-400' : ''}`}>▼</div>
                </button>

                {/* ── Level 2: 指標ブレークダウン ── */}
                {isOpen && (
                  <div className="bg-gradient-to-b from-gray-50 to-white border-t border-gray-100 px-10 py-5">
                    <div className="space-y-4">
                      {/* 消費税 */}
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>うち消費税相当</span>
                        <span className="font-mono">{tax ? fmtYen(tax) : '—'}</span>
                      </div>
                      {/* 売上税抜 */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">売上（税抜）</span>
                        <span className="text-base font-black text-blue-700 tabular-nums">{fmtYen(s.revTaxEx)}</span>
                      </div>
                      {/* 内訳バー */}
                      <div className="pl-3 border-l-2 border-gray-100 space-y-2.5">
                        <SubBar
                          label="投げ銭 MF"
                          value={s.mf} base={s.revTaxEx}
                          colorBar="bg-teal-400" colorText="text-teal-700"
                        />
                        {/* CPN（展開） */}
                        <div>
                          <button
                            className="w-full"
                            onClick={e => {
                              e.stopPropagation()
                              setCpnOpenMap(p => ({ ...p, [office]: !cpnOpen }))
                            }}
                          >
                            <SubBar
                              label={`CPN報酬合計 ${cpnOpen ? '▲' : '▼'}`}
                              value={cpnTotal} base={s.revTaxEx}
                              colorBar="bg-green-400" colorText="text-green-700"
                            />
                          </button>
                          {cpnOpen && (
                            <div className="mt-2 pl-3 border-l-2 border-green-100 space-y-1">
                              <MiniRow label="C5（30日50h）"     value={s.cpnC5} />
                              <MiniRow label="B2（デビューCPN）"  value={s.cpnB2} />
                              <MiniRow label="A（A1到達）"        value={s.cpnA} />
                              <MiniRow label="S（S1到達）"        value={s.cpnS} />
                              <MiniRow label="その他"             value={s.cpnOther} />
                            </div>
                          )}
                        </div>
                        <SubBar
                          label="レベルシェア"
                          value={s.leveshe} base={s.revTaxEx}
                          colorBar="bg-orange-400" colorText="text-orange-700"
                        />
                      </div>
                      {/* ダイヤ */}
                      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-xs text-gray-500">応援ダイヤ（MFベース）</span>
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">
                          {s.dia ? `${fmtDia(s.dia)} dia` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ライバー 階層展開コンポーネント ────────────────────────────────
function LiverSection({ cur, off, allOffices, pctDia, pctLeveshe, pctDebut, isGlobal, isLatestMonth }: {
  cur: SectionSnap
  off: Record<string, SectionSnap>
  allOffices: string[]
  pctDia: number | null; pctLeveshe: number | null; pctDebut: number | null
  isGlobal: boolean
  isLatestMonth: boolean
}) {
  const [open, setOpen]           = useState(false)
  const [view, setView]           = useState<'total' | 'office'>('total')

  const officeKeys = allOffices.filter(o => o !== '全社合計' && off[o])

  function PctBadge({ pct }: { pct: number | null }) {
    if (pct === null || pct === undefined) return null
    const positive = pct >= 0
    return (
      <span className={`text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
        {positive ? '▲' : '▼'}{Math.abs(Math.round(pct))}%
      </span>
    )
  }

  const TIER_COLS = [
    { label: 'T1（3万+）',    key: 't1' as const, color: 'bg-blue-500',  text: 'text-blue-700',  badge: 'bg-blue-50 text-blue-700' },
    { label: 'T2（1〜3万）',  key: 't2' as const, color: 'bg-green-500', text: 'text-green-700', badge: 'bg-green-50 text-green-700' },
    { label: 'T3（1万未満）', key: 't3' as const, color: 'bg-gray-400',  text: 'text-gray-600',  badge: 'bg-gray-100 text-gray-600' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
      {/* ヘッダーボタン */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center px-6 py-5 hover:bg-emerald-50/30 transition-colors group"
      >
        <div className="flex-1 flex items-center gap-6 flex-wrap">
          <div className="text-left">
            <div className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest mb-0.5">応援ダイヤ</div>
            <div className="text-3xl font-black text-gray-900 tracking-tight tabular-nums">
              {cur.dia ? fmtDia(cur.dia) : '—'}
              <span className="text-lg font-semibold text-gray-400 ml-1">dia</span>
            </div>
            {isGlobal && <PctBadge pct={pctDia} />}
          </div>
          <div className="flex gap-5 pl-6 border-l border-gray-100 flex-wrap">
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">レベシェ</div>
              <div className="text-lg font-bold text-orange-700 tabular-nums">{cur.leveshe ? fmtYen(cur.leveshe) : '—'}</div>
              {isGlobal && <PctBadge pct={pctLeveshe} />}
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">今月デビュー</div>
              <div className="text-lg font-bold text-purple-700">{cur.debut !== undefined ? `${cur.debut} 人` : '—'}</div>
              {isGlobal && <PctBadge pct={pctDebut} />}
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">C5達成</div>
              <div className="text-lg font-bold text-red-700">{cur.c5Count !== undefined ? `${cur.c5Count} 人` : '—'}</div>
              <span className="text-[9px] text-gray-400">翌月確定</span>
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-2 text-xs font-medium transition-colors
          ${open ? 'text-emerald-500' : 'text-gray-400 group-hover:text-emerald-500'}`}>
          {isLatestMonth
            ? <><span className={`text-sm transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span><span>ライバー基盤</span></>
            : <span className="text-gray-300 text-[10px]">詳細は最新月のみ</span>
          }
        </div>
      </button>

      {/* 展開エリア */}
      {open && isLatestMonth && (
        <div className="border-t border-gray-100">
          {/* 全社 / 個社別 切替タブ */}
          <div className="flex border-b border-gray-100 px-6 pt-4 gap-1">
            {(['total', 'office'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${
                  view === v
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {v === 'total' ? '全社' : '個社別'}
              </button>
            ))}
          </div>

          {/* ── 全社ビュー ── */}
          {view === 'total' && (
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: '登録ライバー数', value: `${cur.registered ?? '—'} 人`, sub: null, color: 'text-gray-800' },
                  { label: 'アクティブ',     value: `${cur.active ?? '—'} 人`,
                    sub: cur.registered > 0 ? `稼働率 ${Math.round((cur.active / cur.registered) * 100)}%` : null,
                    color: 'text-gray-800' },
                  { label: 'デビュー数',     value: `${cur.debut ?? '—'} 人`,     sub: null, color: 'text-purple-700' },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-4">
                    <div className="text-[10px] text-gray-400 mb-1">{label}</div>
                    <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
                    {sub && <div className="text-[10px] text-gray-400 mt-1">{sub}</div>}
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-[10px] text-gray-400 mb-3 font-semibold uppercase tracking-wider">ティア構成</div>
                {TIER_COLS.map(({ label, key, color, text }) => {
                  const val = cur[key] ?? 0
                  const pct = cur.active > 0 ? (val / cur.active) * 100 : 0
                  return (
                    <div key={key} className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-12 text-right tabular-nums ${text}`}>{val} 人</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 個社別ビュー ── */}
          {view === 'office' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left font-medium w-28">事務所</th>
                    <th className="px-3 py-2.5 text-right font-medium">登録</th>
                    <th className="px-3 py-2.5 text-right font-medium">アクティブ</th>
                    <th className="px-3 py-2.5 text-right font-medium">稼働率</th>
                    <th className="px-3 py-2.5 text-right font-medium">T1（3万+）</th>
                    <th className="px-3 py-2.5 text-right font-medium">T2（1〜3万）</th>
                    <th className="px-3 py-2.5 text-right font-medium">T3（1万未満）</th>
                    <th className="px-3 py-2.5 text-right font-medium">デビュー</th>
                    <th className="px-3 py-2.5 text-right font-medium">応援ダイヤ</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 全社合計行 */}
                  {off['全社合計'] && (() => {
                    const s = off['全社合計']
                    const rate = s.registered > 0 ? Math.round((s.active / s.registered) * 100) : 0
                    return (
                      <tr className="bg-slate-50 border-b border-gray-100 font-semibold">
                        <td className="px-4 py-3 text-blue-900 font-bold">全社</td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{s.registered}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{s.active}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">{rate}%</td>
                        {TIER_COLS.map(({ key, badge }) => (
                          <td key={key} className="px-3 py-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded font-bold tabular-nums ${badge}`}>{s[key] ?? '—'}</span>
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right tabular-nums text-purple-700 font-bold">{s.debut}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-700 font-bold">{fmtDia(s.dia)}</td>
                      </tr>
                    )
                  })()}
                  {/* 個社 */}
                  {officeKeys.map((office, oi) => {
                    const s = off[office]
                    if (!s) return null
                    const rate = s.registered > 0 ? Math.round((s.active / s.registered) * 100) : 0
                    return (
                      <tr key={office} className={`border-b border-gray-50 ${oi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <td className="px-4 py-3 font-medium text-gray-700">{OFFICE_LABEL[office] || office}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-600">{s.registered}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-600">{s.active}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-400">{rate}%</td>
                        {TIER_COLS.map(({ key, badge }) => (
                          <td key={key} className="px-3 py-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded tabular-nums ${badge}`}>{s[key] ?? '—'}</span>
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right tabular-nums text-purple-600">{s.debut}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{fmtDia(s.dia)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────
export default function FinanceDashboardClient({ data }: { data: SummaryData }) {
  const off              = data.officeSummary || {}
  const availableOffices = OFFICE_ORDER.filter(o => off[o] && off[o].revTaxIn > 0)
  const allOffices       = OFFICE_ORDER.filter(o => off[o])

  // 月選択・事務所選択
  const [selectedMonth,  setSelectedMonth]  = useState<string | null>(null)
  const [selectedOffice, setSelectedOffice] = useState('全社合計')

  const trend          = data.trend || []
  const effectiveMonth = selectedMonth ?? data.latestMonth
  const isLatestMonth  = effectiveMonth === data.latestMonth

  // 選択月のトレンドデータ
  const trendIdx  = trend.findIndex(t => t.month === effectiveMonth)
  const trendItem = trendIdx >= 0 ? trend[trendIdx] : null
  const prevItem  = trendIdx > 0  ? trend[trendIdx - 1] : null

  // 前月比を計算（選択月 vs 前月）
  function calcPct(cur: number, prev: number | undefined): number | null {
    if (!prev || prev === 0) return null
    return ((cur - prev) / prev) * 100
  }
  const displayPctRev = isLatestMonth
    ? data.pctRevenue
    : (trendItem && prevItem ? calcPct(trendItem.revTaxIn, prevItem.revTaxIn) : null)
  const displayPctDia = isLatestMonth
    ? data.pctDia
    : (trendItem && prevItem ? calcPct(trendItem.dia, prevItem.dia) : null)
  const displayPctDebut = isLatestMonth
    ? data.pctDebut
    : (trendItem && prevItem ? calcPct(trendItem.debut, prevItem.debut) : null)

  // 表示用スナップ（過去月はtrendのみ、最新月は officeSummary）
  const isGlobal = selectedOffice === '全社合計'
  const latestCur = (off[selectedOffice] || data.current || {}) as SectionSnap
  const historicalSnap: SectionSnap = {
    revTaxIn: trendItem?.revTaxIn ?? 0, revTaxEx: 0,
    dia: trendItem?.dia ?? 0, mf: 0,
    cpnC5: 0, cpnB2: 0, cpnA: 0, cpnS: 0, cpnOther: 0,
    leveshe: 0, registered: 0, active: trendItem?.active ?? 0,
    t1: 0, t2: 0, t3: 0, debut: trendItem?.debut ?? 0, c5Count: 0,
  }
  const cur = isLatestMonth ? latestCur : historicalSnap

  // チャート用データ（全期間）
  const revActual   = trend.map(t => ({ month: t.month, value: t.revTaxIn }))
  const revForecast = (data.revForecast   || []).map(f => ({ month: f.month, value: f.revTaxIn }))
  const diaActual   = trend.map(t => ({ month: t.month, value: t.dia }))
  const diaForecast = (data.diaForecast   || []).map(f => ({ month: f.month, value: f.dia }))
  const actActual   = trend.map(t => ({ month: t.month, value: t.active }))
  const actForecast = (data.activeForecast|| []).map(f => ({ month: f.month, value: f.active }))
  const debActual   = trend.map(t => ({ month: t.month, value: t.debut }))
  const debForecast = (data.debutForecast || []).map(f => ({ month: f.month, value: f.debut }))

  // 月ラベル "2026-04" → "4月"
  function fmtM(ym: string) { return ym.substring(5).replace(/^0/, '') + '月' }

  // 月選択リスト（古い順）
  const monthOptions = trend.map(t => t.month)

  return (
    <>
      {/* ── コントロールバー ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 px-5 py-4">
        {/* 月選択 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8 shrink-0">月</span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {/* 最新ボタン */}
            <button
              onClick={() => setSelectedMonth(null)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                isLatestMonth
                  ? 'bg-[#1565c0] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              最新（{fmtM(data.latestMonth)}）
            </button>
            {/* 過去月（新しい順） */}
            {[...monthOptions].reverse().filter(m => m !== data.latestMonth).map(m => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition ${
                  selectedMonth === m
                    ? 'bg-blue-100 text-blue-700 font-semibold ring-1 ring-blue-300'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {fmtM(m)}
              </button>
            ))}
          </div>
          {!isLatestMonth && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-lg font-semibold shrink-0">
              過去データ表示中（詳細・個社別は最新月のみ）
            </span>
          )}
        </div>

        {/* 事務所選択（最新月のみ有効） */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8 shrink-0">事務所</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['全社合計', ...availableOffices.filter(o => o !== '全社合計')]).map(office => (
              <button
                key={office}
                onClick={() => { if (isLatestMonth) setSelectedOffice(office) }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  !isLatestMonth
                    ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                    : selectedOffice === office
                      ? 'bg-[#1565c0] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {OFFICE_LABEL[office] || office}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* チャート */}
      {trend.length > 0 && (
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            トレンド ＆ 3ヶ月予測
          </p>
          <ChartSection
            revActual={revActual} revForecast={revForecast}
            diaActual={diaActual} diaForecast={diaForecast}
            actActual={actActual} actForecast={actForecast}
            debActual={debActual} debForecast={debForecast}
          />
        </div>
      )}

      {/* 成長ボーナス */}
      {data.growthBonus && data.growthBonus.offices.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">成長ボーナス</p>
          <GrowthBonusSection gb={data.growthBonus} />
        </>
      )}

      {/* 売上 */}
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">売上</p>
      <RevenueHierarchy
        off={off}
        allOffices={allOffices}
        pctRevenue={isGlobal ? displayPctRev : null}
        latestMonth={effectiveMonth}
        overrideRevTaxIn={!isLatestMonth ? (trendItem?.revTaxIn ?? 0) : undefined}
        isLatestMonth={isLatestMonth}
      />

      {/* ライバー */}
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-6">ライバー</p>
      <LiverSection
        cur={cur}
        off={off}
        allOffices={allOffices}
        pctDia={isGlobal ? displayPctDia : null}
        pctLeveshe={isGlobal ? (isLatestMonth ? data.pctLeveshe : null) : null}
        pctDebut={isGlobal ? displayPctDebut : null}
        isGlobal={isGlobal}
        isLatestMonth={isLatestMonth}
      />
    </>
  )
}
