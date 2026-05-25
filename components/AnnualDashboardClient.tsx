'use client'
import { useState } from 'react'
import KPICard from './KPICard'
import ChartSection from './ChartSection'

type AnnualSnap = {
  months: string[]; monthCount: number
  revTaxIn: number; revTaxEx: number; dia: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number; registered: number; active: number; debut: number
  t1: number; t2: number; t3: number
}

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

export type FullPLData = {
  latestYear: string
  years: string[]
  annual: Record<string, AnnualSnap>
  trend: TrendItem[]
}

function fmtYen(v: number) {
  return v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`
}
function fmtDia(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}
function pct(a: number, b: number): number | null {
  return b > 0 ? Math.round((a - b) / b * 100) : null
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-6 first:mt-0">
      {children}
    </p>
  )
}

export default function AnnualDashboardClient({ data }: { data: FullPLData }) {
  const [selectedYear, setSelectedYear] = useState(data.latestYear)

  const cur  = (data.annual[selectedYear] || {}) as AnnualSnap
  const prev = (data.annual[String(Number(selectedYear) - 1)] || {}) as AnnualSnap

  const cpnTotal = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)
  const cpnPrev  = (prev.cpnC5||0)+(prev.cpnB2||0)+(prev.cpnA||0)+(prev.cpnS||0)+(prev.cpnOther||0)

  const yearTrend = data.trend.filter(t => t.month.startsWith(selectedYear))
  const revActual = yearTrend.map(t => ({ month: t.month, value: t.revTaxIn }))
  const diaActual = yearTrend.map(t => ({ month: t.month, value: t.dia }))
  const actActual = yearTrend.map(t => ({ month: t.month, value: t.active }))
  const debActual = yearTrend.map(t => ({ month: t.month, value: t.debut }))

  const periodLabel = cur.months && cur.monthCount < 12
    ? `${cur.months[0].substring(5)}月〜${cur.months[cur.months.length-1].substring(5)}月（${cur.monthCount}ヶ月）`
    : '1月〜12月'

  return (
    <>
      {/* 年セレクター */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-2">
          {data.years.map(yr => (
            <button
              key={yr}
              onClick={() => setSelectedYear(yr)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedYear === yr
                  ? 'bg-[#1565c0] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1565c0] hover:text-[#1565c0]'
              }`}
            >
              {yr}年
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{periodLabel}</span>
      </div>

      {/* 売上 */}
      <SectionLabel>売上（年間合計）</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <KPICard title="売上（税込）"     value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'} pct={pct(cur.revTaxIn, prev.revTaxIn)} color="#1565c0" />
        <KPICard title="売上（税抜）"     value={cur.revTaxEx ? fmtYen(cur.revTaxEx) : '—'} color="#1976d2" />
        <KPICard title="投げ銭報酬（MF）" value={cur.mf ? fmtYen(cur.mf) : '—'} color="#0097a7" />
        <KPICard title="CPN報酬合計"      value={cpnTotal ? fmtYen(cpnTotal) : '—'} pct={pct(cpnTotal, cpnPrev)} color="#00695c" />
      </div>

      {/* CPN内訳 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">
          CPN報酬内訳（{selectedYear}年・全社）
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {([
            { label: 'C5（30日50h）',    key: 'cpnC5',    color: '#c62828' },
            { label: 'B2（デビューCPN）', key: 'cpnB2',   color: '#1565c0' },
            { label: 'A（A1到達）',       key: 'cpnA',    color: '#e65100' },
            { label: 'S（S1到達）',       key: 'cpnS',    color: '#6a1b9a' },
            { label: 'その他',            key: 'cpnOther', color: '#546e7a' },
          ] as const).map(({ label, key, color }) => (
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
      <SectionLabel>ライバー基盤</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <KPICard title="応援ダイヤ（年間）"   value={cur.dia ? `${fmtDia(cur.dia)} dia` : '—'} pct={pct(cur.dia, prev.dia)} color="#43a047" />
        <KPICard title="レベシェ（年間）"     value={cur.leveshe ? fmtYen(cur.leveshe) : '—'} color="#ef6c00" />
        <KPICard title="年間デビュー数"       value={cur.debut !== undefined ? `${cur.debut} 人` : '—'} pct={pct(cur.debut, prev.debut)} color="#7b1fa2" />
        <KPICard title="期末アクティブ"       value={cur.active !== undefined ? `${cur.active} 人` : '—'} color="#1565c0" />
      </div>

      {/* Tier構成（期末） */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4">期末Tier構成</h2>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">登録数</div>
            <div className="text-xl font-bold text-gray-900">{cur.registered ?? '—'} 人</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">アクティブ</div>
            <div className="text-xl font-bold text-gray-900">{cur.active ?? '—'} 人</div>
          </div>
          {[
            { label: 'T1（3万+）',   key: 't1', color: 'bg-blue-100 text-blue-800' },
            { label: 'T2（1〜3万）', key: 't2', color: 'bg-green-100 text-green-800' },
            { label: 'T3（1万未満）', key: 't3', color: 'bg-gray-100 text-gray-700' },
          ].map(({ label, key, color }) => (
            <div key={key} className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-xl font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                {(cur as Record<string, number>)[key] ?? '—'} 人
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 月次トレンド */}
      {yearTrend.length > 0 && (
        <div className="mb-6">
          <SectionLabel>月次トレンド（{selectedYear}年）</SectionLabel>
          <ChartSection
            revActual={revActual} revForecast={[]}
            diaActual={diaActual} diaForecast={[]}
            actActual={actActual} actForecast={[]}
            debActual={debActual} debForecast={[]}
          />
        </div>
      )}
    </>
  )
}
