'use client'
import { useEffect, useState } from 'react'
import { type BannerLiver, type BannerEvent } from './types'
import { fmt, ymdToLabel } from './format'

const TOP = 100

export default function BannerLiverTable({
  livers, events, weeks,
}: { livers: BannerLiver[]; events?: BannerEvent[]; weeks: string[] }) {
  const [selWeek, setSelWeek] = useState(weeks[0])
  useEffect(() => { setSelWeek(weeks[0]) }, [weeks])
  const idx = Math.max(0, weeks.indexOf(selWeek))

  const useEvents = Array.isArray(events) && events.length > 0
  const weekEvents = useEvents ? events!.filter(e => e.week === selWeek) : []

  // フォールバック（旧GAS＝events無し）：pt順の素朴な一覧
  const fallback = !useEvents
    ? livers
        .map(l => ({ l, c: l.weekly[idx] }))
        .filter(x => x.c && (x.c.joined ?? (x.c.pt > 0 || x.c.rank > 0)))
        .sort((a, b) => (b.c.pt - a.c.pt) || ((a.c.rank || 9999) - (b.c.rank || 9999)))
    : []

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">③ ライバー別 — 回（バナイベ）ごとの順位</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            同じ週でも<b className="font-medium">回（イベント×ブロック）が違えば別ランキング</b>。回ごとに順位順で表示。
            <span className="ml-1 px-1 rounded bg-amber-100 text-amber-700 font-medium">色付き</span>＝100位以内（入賞）。
          </p>
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

      {useEvents ? (
        weekEvents.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">この週の回データがありません</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="text-xs text-gray-500">{ymdToLabel(selWeek)}：<b className="text-gray-800">{weekEvents.length}</b> 回開催</div>
            {weekEvents.map((ev, ei) => (
              <div key={ev.eventId + '|' + ev.blockId + '|' + ei} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-gray-100 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-bold text-gray-800">{ev.office || ev.eventName || '回'}</span>
                  {ev.start && <span className="text-xs text-gray-500">{ev.start}〜{ev.end}</span>}
                  {ev.blockId && ev.blockId !== '1' && <span className="text-[10px] px-1.5 rounded bg-gray-200 text-gray-600">ブロック{ev.blockId}</span>}
                  <span className="ml-auto text-xs text-gray-500">参加 <b className="text-gray-700">{ev.count}</b>名 ／ 100位以内 <b className="text-amber-600">{ev.winCount}</b>名</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white text-slate-500 text-xs border-b border-gray-100">
                      <th className="px-3 py-2 text-right font-semibold w-16">順位</th>
                      <th className="px-3 py-2 text-left font-semibold">ライバー</th>
                      <th className="px-3 py-2 text-left font-semibold">レーベル</th>
                      <th className="px-3 py-2 text-right font-semibold">pt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.participants.map((p, pi) => {
                      const inTop = p.rank >= 1 && p.rank <= TOP
                      return (
                        <tr key={p.name + pi} className={`${inTop ? 'bg-amber-50' : pi % 2 ? 'bg-slate-50/40' : 'bg-white'} border-b border-gray-50 hover:bg-blue-50/40 transition-colors`}>
                          <td className={`px-3 py-2 text-right font-mono ${inTop ? 'text-amber-700 font-bold' : 'text-gray-900'}`}>{p.rank > 0 ? `${p.rank}位` : '—'}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[260px] truncate" title={p.name}>
                            {inTop && <span className="text-amber-500 mr-1">●</span>}{p.name}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{p.label}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(p.pt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      ) : (
        <div>
          <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">回ごとの表示はデータ更新後に有効になります（暫定でpt順表示）。</div>
          {fallback.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {fallback.map(({ l, c }, i) => {
                  const inTop = c.rank >= 1 && c.rank <= TOP
                  return (
                    <tr key={l.name + i} className={`${inTop ? 'bg-amber-50' : i % 2 ? 'bg-slate-50/40' : 'bg-white'} border-b border-gray-50`}>
                      <td className="px-4 py-2 text-right text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 max-w-[240px] truncate" title={l.name}>{l.name}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap"><span className="text-gray-600">{l.office}</span><span className="mx-1 text-gray-300">/</span>{l.label}</td>
                      <td className={`px-3 py-2 text-right font-mono ${inTop ? 'text-amber-700 font-bold' : 'text-gray-900'}`}>{c.rank > 0 ? `${c.rank}位` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(c.pt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
