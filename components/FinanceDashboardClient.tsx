'use client'
import { useState } from 'react'
import KPICard from './KPICard'
import ChartSection from './ChartSection'

type SectionSnap = {
  revTaxIn: number; revTaxEx: number; dia: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number; registered: number; active: number
  t1: number; t2: number; t3: number; debut: number; c5Count: number
}

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

type ForecastItem = { month: string; value: number }

type GrowthMonthItem = {
  month: string; judge: string; dia: number
  singleThreshold: number; req3m: number; minDia: number; isActual: boolean
}
type GrowthOfficeItem = {
  office: string; months: GrowthMonthItem[]
}

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
  growthBonus?: {
    offices: GrowthOfficeItem[]
  }
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-6 first:mt-0">
      {children}
    </p>
  )
}

// 判定バッジのスタイル
function judgeCls(j: string, forecast = false) {
  const base = forecast
    ? 'text-[11px] font-bold px-1.5 py-0.5 rounded-sm inline-block border-dashed border'
    : 'text-[11px] font-bold px-1.5 py-0.5 rounded inline-block border'
  if (j === '◎') return `${base} bg-green-100 text-green-800 border-green-300`
  if (j === '✖') return `${base} bg-red-100 text-red-700 border-red-300`
  if (j === '○') return `${base} bg-yellow-50 text-yellow-700 border-yellow-300`
  return `${base} bg-gray-100 text-gray-400 border-gray-200`
}

function GrowthBonusSection({ gb }: { gb: NonNullable<SummaryData['growthBonus']> }) {
  const offices = gb.offices
  if (!offices || offices.length === 0) return null

  // "2026-04" → "4月"
  function fmtM(ym: string) {
    return ym.substring(5).replace(/^0/, '') + '月'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
      <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-slate-700 font-bold text-sm">成長ボーナス 判定</h2>
        <span className="text-xs text-slate-500">◎ MF+40% ／ ○ ±0% ／ ✖ −30%</span>
      </div>

      <div className="divide-y divide-gray-50">
        {offices.map(office => {
          const actual   = office.months.filter(m => m.isActual).slice(-4)   // 実績：直近4ヶ月
          const forecast = office.months.filter(m => !m.isActual).slice(0, 3) // 予測：次3ヶ月

          // 最新実績月の達成条件詳細
          const latest = actual[actual.length - 1]
          const singleGap = latest ? Math.max(0, latest.singleThreshold - latest.dia) : null
          const req3mGap  = latest ? Math.max(0, latest.req3m - latest.dia) : null

          // 次月の見込み
          const nextM = forecast[0]

          return (
            <div key={office.office} className="px-5 py-4">
              <div className="flex items-start gap-6 flex-wrap">

                {/* 事務所名 */}
                <div className="w-20 shrink-0 pt-1">
                  <div className="text-sm font-bold text-gray-700">{office.office}</div>
                </div>

                {/* 実績バッジ */}
                <div className="shrink-0">
                  <div className="text-[9px] text-gray-400 mb-1.5 font-medium tracking-wide">― 実績 ―</div>
                  <div className="flex gap-2">
                    {actual.map(m => (
                      <div key={m.month} className="text-center">
                        <div className="text-[9px] text-gray-400 mb-0.5">{fmtM(m.month)}</div>
                        <span className={judgeCls(m.judge)}>{m.judge || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 区切り */}
                <div className="self-stretch border-l border-gray-200 shrink-0" />

                {/* 予測バッジ */}
                <div className="shrink-0">
                  <div className="text-[9px] text-gray-400 mb-1.5 font-medium tracking-wide">― このまま行くと ―</div>
                  <div className="flex gap-2">
                    {forecast.map(m => (
                      <div key={m.month} className="text-center">
                        <div className="text-[9px] text-gray-400 mb-0.5">{fmtM(m.month)}(予)</div>
                        <span className={judgeCls(m.judge, true)}>{m.judge || '—'}</span>
                      </div>
                    ))}
                    {forecast.length === 0 && (
                      <span className="text-xs text-gray-300 self-center">予測データなし</span>
                    )}
                  </div>
                </div>

                {/* 最新月の達成条件 */}
                {latest && (latest.singleThreshold > 0 || latest.req3m > 0) && (
                  <>
                    <div className="self-stretch border-l border-gray-200 shrink-0" />
                    <div className="shrink-0 text-[10px] text-gray-500 space-y-1 pt-0.5">
                      <div className="text-[9px] text-gray-400 font-medium tracking-wide mb-1.5">
                        ― {fmtM(latest.month)} 実績 ◎条件 ―
                      </div>
                      {/* 単月基準 */}
                      {latest.singleThreshold > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-20 shrink-0">単月基準</span>
                          <span className="font-mono text-gray-700">{fmtDia(latest.singleThreshold)} dia</span>
                          {singleGap === 0 ? (
                            <span className="text-green-600 font-semibold">✓ 達成</span>
                          ) : (
                            <span className="text-orange-500">あと {fmtDia(singleGap!)} dia</span>
                          )}
                        </div>
                      )}
                      {/* 3ヶ月基準 */}
                      {latest.req3m > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-20 shrink-0">3ヶ月基準</span>
                          <span className="font-mono text-gray-700">{fmtDia(latest.req3m)} dia</span>
                          {req3mGap === 0 ? (
                            <span className="text-green-600 font-semibold">✓ 達成</span>
                          ) : (
                            <span className="text-orange-500">あと {fmtDia(req3mGap!)} dia</span>
                          )}
                        </div>
                      )}
                      {/* 最低ライン */}
                      {latest.minDia > 0 && latest.dia < latest.minDia && (
                        <div className="text-red-600 font-semibold text-[9px] pt-0.5">
                          ⚠️ 最低ライン（{fmtDia(latest.minDia)} dia）割れ
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            </div>
          )
        })}
      </div>

      <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
        実績 = RAW_ライバー月次より集計（全ライバー対象）　／　予測 = 直近3ヶ月平均で自動推計　／　判定は DB_成長予測 シートの数式値
      </div>
    </div>
  )
}

// ─── PL階層ツリー コンポーネント ──────────────────────────────────────
function TreeRow({ indent, label, value, bold = false, colorClass = 'text-gray-700',
  toggleable = false, open = true, onToggle }: {
  indent: number; label: string; value: string
  bold?: boolean; colorClass?: string
  toggleable?: boolean; open?: boolean; onToggle?: () => void
}) {
  return (
    <div
      className={`flex items-center gap-1 py-1.5 pr-3 rounded ${toggleable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
      style={{ paddingLeft: 8 + indent * 18 }}
      onClick={toggleable ? onToggle : undefined}
    >
      {toggleable
        ? <span className="text-gray-400 text-[10px] w-3 shrink-0">{open ? '▾' : '▸'}</span>
        : indent > 0
          ? <span className="text-gray-300 text-xs w-3 shrink-0">└</span>
          : <span className="w-3 shrink-0" />
      }
      <span className={`flex-1 text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-sm font-mono font-semibold ${colorClass}`}>{value}</span>
    </div>
  )
}

function PLHierarchySection({ cur, selectedOffice, latestMonth }: {
  cur: SectionSnap; selectedOffice: string; latestMonth: string
}) {
  const [revOpen, setRevOpen] = useState(true)
  const [cpnOpen, setCpnOpen] = useState(false)
  const [liverOpen, setLiverOpen] = useState(true)

  const cpnTotal = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)
  const tax = Math.max(0, (cur.revTaxIn||0) - (cur.revTaxEx||0))

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
      <div className="bg-slate-100 px-5 py-3 border-b border-slate-200">
        <h2 className="text-slate-700 font-bold text-sm">
          PL 内訳（{latestMonth}・{OFFICE_LABEL[selectedOffice] || selectedOffice}）
        </h2>
        <p className="text-slate-400 text-[11px] mt-0.5">▸ をクリックで展開</p>
      </div>
      <div className="px-3 py-3 grid grid-cols-2 gap-x-6 divide-x divide-gray-100">
        {/* 左: 売上内訳 */}
        <div>
          <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase px-2 mb-1">売上内訳</div>
          <TreeRow indent={0} label="売上（税込）" value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'}
            bold colorClass="text-blue-800" toggleable open={revOpen} onToggle={() => setRevOpen(v => !v)} />
          {revOpen && (
            <>
              <TreeRow indent={1} label="消費税相当" value={tax ? fmtYen(tax) : '—'} colorClass="text-gray-400" />
              <TreeRow indent={1} label="売上（税抜）" value={cur.revTaxEx ? fmtYen(cur.revTaxEx) : '—'}
                bold colorClass="text-blue-700" />
              <TreeRow indent={2} label="投げ銭MF" value={cur.mf ? fmtYen(cur.mf) : '—'} colorClass="text-teal-700" />
              <TreeRow indent={2} label="CPN報酬合計" value={cpnTotal ? fmtYen(cpnTotal) : '—'}
                colorClass="text-green-700" toggleable open={cpnOpen} onToggle={() => setCpnOpen(v => !v)} />
              {cpnOpen && (
                <>
                  <TreeRow indent={3} label="C5（30日50h）"     value={cur.cpnC5    ? fmtYen(cur.cpnC5)    : '—'} />
                  <TreeRow indent={3} label="B2（デビューCPN）"  value={cur.cpnB2    ? fmtYen(cur.cpnB2)    : '—'} />
                  <TreeRow indent={3} label="A（A1到達）"        value={cur.cpnA     ? fmtYen(cur.cpnA)     : '—'} />
                  <TreeRow indent={3} label="S（S1到達）"        value={cur.cpnS     ? fmtYen(cur.cpnS)     : '—'} />
                  <TreeRow indent={3} label="その他"             value={cur.cpnOther ? fmtYen(cur.cpnOther) : '—'} />
                </>
              )}
              <TreeRow indent={2} label="レベルシェア" value={cur.leveshe ? fmtYen(cur.leveshe) : '—'} colorClass="text-orange-700" />
            </>
          )}
        </div>
        {/* 右: ライバー基盤 */}
        <div className="pl-6">
          <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase px-2 mb-1">ライバー基盤</div>
          <TreeRow indent={0} label="ライバー基盤" value="" bold
            toggleable open={liverOpen} onToggle={() => setLiverOpen(v => !v)} />
          {liverOpen && (
            <>
              <TreeRow indent={1} label="登録ライバー数" value={cur.registered !== undefined ? `${cur.registered} 人` : '—'} />
              <TreeRow indent={1} label="アクティブ" value={cur.active !== undefined ? `${cur.active} 人` : '—'}
                bold colorClass="text-gray-800" />
              <TreeRow indent={2} label="T1（3万+）"    value={cur.t1 !== undefined ? `${cur.t1} 人` : '—'} colorClass="text-blue-700" />
              <TreeRow indent={2} label="T2（1〜3万）"  value={cur.t2 !== undefined ? `${cur.t2} 人` : '—'} colorClass="text-green-700" />
              <TreeRow indent={2} label="T3（1万未満）" value={cur.t3 !== undefined ? `${cur.t3} 人` : '—'} colorClass="text-gray-600" />
              <TreeRow indent={1} label="デビュー" value={cur.debut !== undefined ? `${cur.debut} 人` : '—'} colorClass="text-purple-700" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FinanceDashboardClient({ data }: { data: SummaryData }) {
  const off = data.officeSummary || {}
  const availableOffices = OFFICE_ORDER.filter(o => off[o] && off[o].revTaxIn > 0)
  const allOffices = OFFICE_ORDER.filter(o => off[o])
  const [selectedOffice, setSelectedOffice] = useState('全社合計')

  const isGlobal = selectedOffice === '全社合計'
  const cur = (off[selectedOffice] || data.current || {}) as SectionSnap
  const cpnTotal = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)

  const trend = data.trend || []
  const revActual   = trend.map(t => ({ month: t.month, value: t.revTaxIn }))
  const revForecast = (data.revForecast || []).map(f => ({ month: f.month, value: f.revTaxIn }))
  const diaActual   = trend.map(t => ({ month: t.month, value: t.dia }))
  const diaForecast = (data.diaForecast || []).map(f => ({ month: f.month, value: f.dia }))
  const actActual   = trend.map(t => ({ month: t.month, value: t.active }))
  const actForecast = (data.activeForecast || []).map(f => ({ month: f.month, value: f.active }))
  const debActual   = trend.map(t => ({ month: t.month, value: t.debut }))
  const debForecast = (data.debutForecast || []).map(f => ({ month: f.month, value: f.debut }))

  return (
    <>
      {/* 個社別セレクター */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {(['全社合計', ...availableOffices.filter(o => o !== '全社合計')]).map(office => (
          <button
            key={office}
            onClick={() => setSelectedOffice(office)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              selectedOffice === office
                ? 'bg-[#1565c0] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1565c0] hover:text-[#1565c0]'
            }`}
          >
            {OFFICE_LABEL[office] || office}
          </button>
        ))}
      </div>

      {/* トレンド＆予測チャート（常時表示） */}
      {trend.length > 0 && (
        <div className="mb-6">
          <SectionLabel>トレンド ＆ 3ヶ月予測</SectionLabel>
          <ChartSection
            revActual={revActual} revForecast={revForecast}
            diaActual={diaActual} diaForecast={diaForecast}
            actActual={actActual} actForecast={actForecast}
            debActual={debActual} debForecast={debForecast}
          />
        </div>
      )}

      {/* 成長ボーナス判定 */}
      {data.growthBonus && data.growthBonus.offices.length > 0 && (
        <>
          <SectionLabel>成長ボーナス</SectionLabel>
          <GrowthBonusSection gb={data.growthBonus} />
        </>
      )}

      {/* 売上 KPI */}
      <SectionLabel>売上</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <KPICard title="売上（税込）"     value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'} pct={isGlobal ? data.pctRevenue : undefined} color="#1565c0" />
        <KPICard title="売上（税抜）"     value={cur.revTaxEx ? fmtYen(cur.revTaxEx) : '—'} pct={isGlobal ? data.pctRevTaxEx : undefined} color="#1976d2" />
        <KPICard title="投げ銭報酬（MF）" value={cur.mf ? fmtYen(cur.mf) : '—'} pct={isGlobal ? data.pctMf : undefined} color="#0097a7" />
        <KPICard title="CPN報酬合計"     value={cpnTotal ? fmtYen(cpnTotal) : '—'} pct={isGlobal ? data.pctCpnTotal : undefined} color="#00695c" />
      </div>

      {/* ライバー KPI */}
      <SectionLabel>ライバー</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KPICard title="応援ダイヤ" value={cur.dia ? `${fmtDia(cur.dia)} dia` : '—'} pct={isGlobal ? data.pctDia : undefined} color="#43a047" sub="MF算出ベース（新規・移籍のみ）" />
        <KPICard title="レベシェ"      value={cur.leveshe ? fmtYen(cur.leveshe) : '—'} pct={isGlobal ? data.pctLeveshe : undefined} color="#ef6c00" />
        <KPICard title="今月デビュー数" value={cur.debut !== undefined ? `${cur.debut} 人` : '—'} pct={isGlobal ? data.pctDebut : undefined} color="#7b1fa2" />
        <KPICard title="C5達成数"      value={cur.c5Count !== undefined ? `${cur.c5Count} 人` : '—'} color="#c62828" sub="翌月CSV取込後に確定" />
      </div>

      {/* PL 内訳（個社別・ツリー形式） */}
      <PLHierarchySection cur={cur} selectedOffice={selectedOffice} latestMonth={data.latestMonth} />

      {/* 事務所別サマリ比較表 */}
      {allOffices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 overflow-x-auto">
          <div className="bg-slate-100 px-5 py-3 border-b border-slate-200">
            <h2 className="text-slate-700 font-bold text-sm">個社別サマリ（{data.latestMonth}）</h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2 text-left font-medium w-28">事務所</th>
                <th className="px-3 py-2 text-right font-medium">売上（税込）</th>
                <th className="px-3 py-2 text-right font-medium">売上（税抜）</th>
                <th className="px-3 py-2 text-right font-medium">応援ダイヤ</th>
                <th className="px-3 py-2 text-right font-medium">投げ銭MF</th>
                <th className="px-3 py-2 text-right font-medium">CPN合計</th>
                <th className="px-3 py-2 text-right font-medium">レベシェ</th>
                <th className="px-3 py-2 text-right font-medium">登録</th>
                <th className="px-3 py-2 text-right font-medium">Act</th>
                <th className="px-3 py-2 text-right font-medium">T1</th>
                <th className="px-3 py-2 text-right font-medium">T2</th>
                <th className="px-3 py-2 text-right font-medium">T3</th>
                <th className="px-3 py-2 text-right font-medium">デビュー</th>
              </tr>
            </thead>
            <tbody>
              {allOffices.map(office => {
                const s = off[office]
                if (!s) return null
                const isTotal = office === '全社合計'
                const isSelected = office === selectedOffice
                const cpn = (s.cpnC5||0)+(s.cpnB2||0)+(s.cpnA||0)+(s.cpnS||0)+(s.cpnOther||0)
                return (
                  <tr
                    key={office}
                    onClick={() => setSelectedOffice(office)}
                    className={`border-b border-gray-50 cursor-pointer transition ${
                      isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' :
                      isTotal    ? 'bg-slate-50 hover:bg-blue-50' :
                                   'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <td className={`px-4 py-2.5 font-medium ${isTotal ? 'text-blue-900' : isSelected ? 'text-blue-800' : 'text-gray-700'}`}>
                      {OFFICE_LABEL[office] || office}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${isTotal ? 'text-blue-900 font-bold' : 'text-gray-700'}`}>{fmtYen(s.revTaxIn)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtYen(s.revTaxEx)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtDia(s.dia)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtYen(s.mf)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{cpn ? fmtYen(cpn) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtYen(s.leveshe)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{s.registered}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{s.active}</td>
                    <td className="px-3 py-2.5 text-right"><span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">{s.t1}</span></td>
                    <td className="px-3 py-2.5 text-right"><span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded">{s.t2}</span></td>
                    <td className="px-3 py-2.5 text-right"><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{s.t3}</span></td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{s.debut}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
