'use client'
import { useEffect, useState } from 'react'
import { type BannerMonthlyLiver } from './types'
import { fmt, ymToLabel } from './format'

export default function BannerLiverMonthlyTable({ livers, months }: { livers: BannerMonthlyLiver[]; months: string[] }) {
  const [selMonth, setSelMonth] = useState(months[0])
  useEffect(() => { setSelMonth(months[0]) }, [months])
  const idx = Math.max(0, months.indexOf(selMonth))

  const participants = livers
    .map(l => ({ l, c: l.monthly[idx] }))
    .filter(x => x.c && x.c.joinCount > 0)
    .sort((a, b) => (b.c.winCount - a.c.winCount) || (b.c.ptSum - a.c.ptSum))

  const winners = participants.filter(x => x.c.winCount > 0).length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">③ ライバー別 — 月次バナイベ実績（100位以内回数順）</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            100位以内回数 → pt合計の降順。<span className="px-1 rounded bg-amber-100 text-amber-700 font-medium">色付き</span>＝その月に1回以上100位以内（入賞）。
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
            ※「参加」＝その月に出たバナイベの回数。「最高位」＝月内ベスト順位（各自が出た回の中での順位）。
          </p>
        </div>
        <div className="ml-auto inline-flex bg-gray-100 rounded-lg p-1">
          {months.map((m, i) => (
            <button
              key={m}
              onClick={() => setSelMonth(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${m === selMonth ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {ymToLabel(m)}{i === 0 && <span className="ml-0.5 text-[9px] text-blue-500 font-semibold">基準</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 bg-slate-50 border-b border-gray-50">
        {ymToLabel(selMonth)} の参加：<span className="font-bold text-gray-800">{participants.length}名</span>
        <span className="mx-2 text-gray-200">|</span>
        100位以内あり：<span className="font-bold text-amber-600">{winners}名</span>
      </div>

      {participants.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">この月の参加者データがありません</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs border-b border-slate-200">
              <th className="px-4 py-2.5 text-right font-semibold w-12">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">ライバー</th>
              <th className="px-3 py-2.5 text-left font-semibold">所属 / レーベル</th>
              <th className="px-3 py-2.5 text-right font-semibold">参加</th>
              <th className="px-3 py-2.5 text-right font-semibold">100位内</th>
              <th className="px-3 py-2.5 text-right font-semibold">pt合計</th>
              <th className="px-3 py-2.5 text-right font-semibold">最高位</th>
            </tr>
          </thead>
          <tbody>
            {participants.map(({ l, c }, i) => {
              const won = c.winCount > 0
              return (
                <tr
                  key={l.name + i}
                  className={`${won ? 'bg-amber-50' : i % 2 ? 'bg-slate-50/40' : 'bg-white'} border-b border-gray-50 hover:bg-blue-50/40 transition-colors`}
                >
                  <td className="px-4 py-2 text-right text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-[240px] truncate" title={l.name}>
                    {won && <span className="text-amber-500 mr-1">●</span>}{l.name}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">
                    <span className="text-gray-600">{l.office}</span>
                    <span className="mx-1 text-gray-300">/</span>{l.label}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{c.joinCount}回</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${won ? 'text-amber-700 font-bold' : 'text-gray-300'}`}>{won ? `${c.winCount}回` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(c.ptSum)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${won ? 'text-amber-700 font-bold' : 'text-gray-900'}`}>{c.bestRank > 0 ? `${c.bestRank}位` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
