'use client'
import { useEffect, useState } from 'react'
import { type BannerLiver } from './types'
import { fmt, ymdToLabel } from './format'

export default function BannerLiverTable({ livers, weeks }: { livers: BannerLiver[]; weeks: string[] }) {
  const [selWeek, setSelWeek] = useState(weeks[0])
  useEffect(() => { setSelWeek(weeks[0]) }, [weeks])
  const idx = Math.max(0, weeks.indexOf(selWeek))

  const participants = livers
    .map(l => ({ l, c: l.weekly[idx] }))
    .filter(x => x.c && (x.c.joined ?? (x.c.pt > 0 || x.c.rank > 0)))
    .sort((a, b) => (Number(b.c.win) - Number(a.c.win)) || (b.c.pt - a.c.pt))

  const winners = participants.filter(x => x.c.win).length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">③ ライバー別 — 週の参加者一覧</h3>
          <p className="text-xs text-gray-400 mt-0.5">選んだ週に参加したライバーのみ表示。入賞者が上、続いてpt降順。🏅＝入賞（100位以内）。</p>
        </div>
        <div className="ml-auto inline-flex bg-gray-100 rounded-lg p-1">
          {weeks.map(w => (
            <button
              key={w}
              onClick={() => setSelWeek(w)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${w === selWeek ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {ymdToLabel(w)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 bg-slate-50 border-b border-gray-50">
        {ymdToLabel(selWeek)} の参加：<span className="font-bold text-gray-800">{participants.length}名</span>
        <span className="mx-2 text-gray-200">|</span>
        入賞：<span className="font-bold text-amber-600">{winners}名</span>
      </div>

      {participants.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">この週の参加者データがありません</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs border-b border-slate-200">
              <th className="px-4 py-2.5 text-right font-semibold w-12">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">ライバー</th>
              <th className="px-3 py-2.5 text-left font-semibold">所属 / レーベル</th>
              <th className="px-3 py-2.5 text-right font-semibold">順位</th>
              <th className="px-3 py-2.5 text-right font-semibold">pt</th>
              <th className="px-3 py-2.5 text-center font-semibold">入賞</th>
            </tr>
          </thead>
          <tbody>
            {participants.map(({ l, c }, i) => (
              <tr key={l.name + i} className={`${c.win ? 'bg-amber-50' : i % 2 ? 'bg-slate-50/40' : 'bg-white'} border-b border-gray-50 hover:bg-blue-50/40 transition-colors`}>
                <td className="px-4 py-2 text-right text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-900 max-w-[240px] truncate" title={l.name}>{l.name}</td>
                <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">
                  <span className="text-gray-600">{l.office}</span>
                  <span className="mx-1 text-gray-300">/</span>{l.label}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-900">{c.rank > 0 ? `${c.rank}位` : '—'}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(c.pt)}</td>
                <td className="px-3 py-2 text-center">
                  {c.win
                    ? <span className="inline-block px-1.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px]">🏅</span>
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
