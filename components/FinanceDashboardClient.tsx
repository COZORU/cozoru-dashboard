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
}

const OFFICE_ORDER = ['全社合計', 'cozoru:全社', 'cozoruレーベル', 'ライブナウV', 'Tolance:全社']
const OFFICE_LABEL: Record<string, string> = {
  '全社合計': '全社',
  'cozoru:全社': 'cozoru',
  'cozoruレーベル': 'cozo-L',
  'ライブナウV': 'ライブナウV',
  'Tolance:全社': 'Tolance',
}

const CPN_ITEMS = [
  { label: 'C5（30日50h）',    key: 'cpnC5',    color: '#c62828' },
  { label: 'B2（デビューCPN）', key: 'cpnB2',   color: '#1565c0' },
  { label: 'A（A1到達）',       key: 'cpnA',    color: '#e65100' },
  { label: 'S（S1到達）',       key: 'cpnS',    color: '#6a1b9a' },
  { label: 'その他',            key: 'cpnOther', color: '#546e7a' },
] as const

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

      {/* CPN内訳 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">
          CPN報酬内訳（{data.latestMonth}・{OFFICE_LABEL[selectedOffice] || selectedOffice}）
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {CPN_ITEMS.map(({ label, key, color }) => (
            <div key={key} className="bg-gray-50 rounded-lg p-3 border-l-[3px]" style={{ borderLeftColor: color }}>
              <div className="text-xs text-gray-500 mb-1.5">{label}</div>
              <div className="text-base font-bold text-gray-900">
                {(cur as Record<string, number>)[key] ? fmtYen((cur as Record<string, number>)[key]) : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ライバー基盤 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4">ライバー基盤</h2>
        <div className="grid grid-cols-6 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">登録ライバー数</div>
            <div className="text-xl font-bold text-gray-900">{cur.registered ?? '—'} 人</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">アクティブ</div>
            <div className="text-xl font-bold text-gray-900">{cur.active ?? '—'} 人</div>
          </div>
          {[
            { label: 'T1（3万+）',    key: 't1', color: 'bg-blue-100 text-blue-800' },
            { label: 'T2（1万〜3万）', key: 't2', color: 'bg-green-100 text-green-800' },
            { label: 'T3（1万未満）',  key: 't3', color: 'bg-gray-100 text-gray-700' },
          ].map(({ label, key, color }) => (
            <div key={key} className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-xl font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                {(cur as Record<string, number>)[key] ?? '—'} 人
              </div>
            </div>
          ))}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">デビュー数</div>
            <div className="text-xl font-bold text-purple-700">{cur.debut ?? '—'} 人</div>
          </div>
        </div>
      </div>

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

      {/* トレンド＆予測チャート（全社のみ表示） */}
      {isGlobal && trend.length > 0 && (
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
    </>
  )
}
