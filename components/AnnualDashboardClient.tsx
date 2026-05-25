'use client'
import { useState } from 'react'
import ChartSection from './ChartSection'

type AnnualSnap = {
  months: string[]; monthCount: number
  revTaxIn: number; revTaxEx: number; dia: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number; registered: number; active: number; debut: number
  t1: number; t2: number; t3: number
  expTotal: number; expKaito: number; expUnyo: number
  expMk: number; expCreative: number; expDesign: number
  expMgmt: number; expCorp: number; expOther: number
  profit: number
  bankEst: number; bankAct: number
}

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

export type FullPLData = {
  latestYear: string
  years: string[]
  annual: Record<string, AnnualSnap>
  trend: TrendItem[]
}

function fmtYen(v: number) {
  const abs = Math.abs(Math.round(v))
  const sign = v < 0 ? '−' : ''
  return abs >= 10000
    ? `${sign}¥${Math.round(abs / 10000).toLocaleString()}万`
    : `${sign}¥${abs.toLocaleString()}`
}
function fmtDia(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}
function yoy(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round((cur - prev) / prev * 100) : null
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 mt-8 first:mt-0">
      {children}
    </p>
  )
}

function BigKPI({ title, value, sub, bg, textColor }: {
  title: string; value: string; sub?: string; bg: string; textColor: string
}) {
  return (
    <div className={`${bg} rounded-2xl p-6 flex flex-col justify-between`}>
      <div className={`text-xs font-semibold uppercase tracking-widest ${textColor} opacity-70 mb-2`}>{title}</div>
      <div className={`text-3xl font-black ${textColor}`}>{value}</div>
      {sub && <div className={`text-xs mt-2 ${textColor} opacity-60`}>{sub}</div>}
    </div>
  )
}

function YoYBadge({ v }: { v: number | null }) {
  if (v === null) return null
  const up = v >= 0
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2 ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '▲' : '▼'}{Math.abs(v)}% 前年比
    </span>
  )
}

function ExpRow({ label, value, indent = false }: { label: string; value: number; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-gray-50 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${indent ? 'text-gray-500' : 'text-gray-700 font-medium'}`}>{label}</span>
      <span className={`font-mono text-sm ${indent ? 'text-gray-500' : 'text-gray-800 font-semibold'}`}>
        {value ? fmtYen(value) : '—'}
      </span>
    </div>
  )
}

export default function AnnualDashboardClient({ data }: { data: FullPLData }) {
  const [selectedYear, setSelectedYear] = useState(data.latestYear)

  const cur  = (data.annual[selectedYear] || {}) as AnnualSnap
  const prev = (data.annual[String(Number(selectedYear) - 1)] || {}) as AnnualSnap

  const cpnTotal = (cur.cpnC5||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)
  const profitRate = cur.revTaxEx > 0 && cur.profit != null && !isNaN(cur.profit) && cur.profit !== 0
    ? (cur.profit / cur.revTaxEx * 100).toFixed(1)
    : null

  const yearTrend = data.trend.filter(t => t.month.startsWith(selectedYear))
  const revActual = yearTrend.map(t => ({ month: t.month, value: t.revTaxIn }))
  const diaActual = yearTrend.map(t => ({ month: t.month, value: t.dia }))
  const actActual = yearTrend.map(t => ({ month: t.month, value: t.active }))
  const debActual = yearTrend.map(t => ({ month: t.month, value: t.debut }))

  const periodLabel = cur.months && cur.monthCount && cur.monthCount < 12
    ? `${cur.months[0].substring(5)}月〜${cur.months[cur.months.length-1].substring(5)}月 YTD（${cur.monthCount}ヶ月）`
    : '1月〜12月'

  return (
    <>
      {/* 年セレクター */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-2">
          {data.years.map(yr => (
            <button
              key={yr}
              onClick={() => setSelectedYear(yr)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedYear === yr
                  ? 'bg-[#1565c0] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1565c0] hover:text-[#1565c0]'
              }`}
            >
              {yr}年
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{periodLabel}</span>
      </div>

      {/* P&L サマリー（大カード） */}
      <SectionLabel>P&L サマリー</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <BigKPI
          title="売上（税込）"
          value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'}
          sub={prev.revTaxIn ? `前年: ${fmtYen(prev.revTaxIn)}` : undefined}
          bg="bg-blue-600" textColor="text-white"
        />
        <BigKPI
          title="総経費"
          value={cur.expTotal ? fmtYen(cur.expTotal) : '—'}
          sub={prev.expTotal ? `前年: ${fmtYen(prev.expTotal)}` : undefined}
          bg="bg-slate-700" textColor="text-white"
        />
        <BigKPI
          title="事業利益"
          value={cur.profit ? fmtYen(cur.profit) : '—'}
          sub={profitRate !== null ? `利益率 ${profitRate}%` : undefined}
          bg={cur.profit > 0 ? 'bg-emerald-600' : 'bg-red-700'}
          textColor="text-white"
        />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">預金残高（期末）</div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">実績</div>
            <div className="text-2xl font-black text-gray-900">{cur.bankAct ? fmtYen(cur.bankAct) : '—'}</div>
            <div className="text-xs text-gray-400 mt-2 mb-0.5">想定</div>
            <div className="text-base font-bold text-gray-500">{cur.bankEst ? fmtYen(cur.bankEst) : '—'}</div>
          </div>
        </div>
      </div>

      {/* 売上内訳 */}
      <SectionLabel>売上内訳</SectionLabel>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[
            { label: '売上（税抜）',     value: cur.revTaxEx, color: '#1565c0' },
            { label: '投げ銭報酬（MF）', value: cur.mf,       color: '#0097a7' },
            { label: 'CPN報酬合計',      value: cpnTotal,     color: '#00695c' },
            { label: 'レベシェア',       value: cur.leveshe,  color: '#ef6c00' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-lg font-bold text-gray-900" style={{ color }}>{value ? fmtYen(value) : '—'}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="text-xs text-gray-500 font-semibold mb-3">CPN内訳</div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'C5（30日50h）', value: cur.cpnC5,    color: '#c62828' },
              { label: 'A（A1到達）',   value: cur.cpnA,    color: '#e65100' },
              { label: 'S（S1到達）',   value: cur.cpnS,    color: '#6a1b9a' },
              { label: 'その他',         value: cur.cpnOther, color: '#546e7a' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg p-3 border-l-[3px] bg-gray-50" style={{ borderLeftColor: color }}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className="text-sm font-bold text-gray-900">{value ? fmtYen(value) : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 経費内訳 */}
      <SectionLabel>経費内訳</SectionLabel>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs text-gray-500">総経費</div>
            <div className="text-2xl font-black text-gray-900">
              {cur.expTotal ? fmtYen(cur.expTotal) : '—'}
              <YoYBadge v={yoy(cur.expTotal, prev.expTotal)} />
            </div>
          </div>
          {profitRate !== null && (
            <div className="text-right">
              <div className="text-xs text-gray-500">利益率（税抜）</div>
              <div className={`text-2xl font-black ${cur.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {profitRate}%
              </div>
            </div>
          )}
        </div>
        {cur.expTotal > 0 && (
          <div className="space-y-0">
            <ExpRow label="獲得コスト合計" value={cur.expKaito} />
            <ExpRow label="運用コスト合計" value={cur.expUnyo} />
            <ExpRow label="その他経費"     value={cur.expTotal - (cur.expKaito||0) - (cur.expUnyo||0)} />
          </div>
        )}
      </div>

      {/* ライバー基盤 */}
      <SectionLabel>ライバー基盤</SectionLabel>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 p-5">
        <div className="grid grid-cols-6 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">応援ダイヤ</div>
            <div className="text-lg font-bold text-gray-900">{cur.dia ? `${fmtDia(cur.dia)}` : '—'}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">年間デビュー</div>
            <div className="text-lg font-bold text-purple-700">{cur.debut ?? '—'} 人</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">期末登録</div>
            <div className="text-lg font-bold text-gray-900">{cur.registered ?? '—'} 人</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">期末アクティブ</div>
            <div className="text-lg font-bold text-gray-900">{cur.active ?? '—'} 人</div>
          </div>
          {[
            { label: 'T1（3万+）',   key: 't1', color: 'bg-blue-100 text-blue-800' },
            { label: 'T2（1〜3万）', key: 't2', color: 'bg-green-100 text-green-800' },
          ].map(({ label, key, color }) => (
            <div key={key} className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-lg font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                {(cur as unknown as Record<string, number>)[key] ?? '—'} 人
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
