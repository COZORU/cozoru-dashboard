import { type BannerLiver } from './types'
import { fmt, ymdToLabel } from './format'

export default function BannerLiverTable({ livers, weeks }: { livers: BannerLiver[]; weeks: string[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-50">
        <h3 className="text-sm font-bold text-gray-800">③ ライバー別 — 週別の順位・pt・入賞</h3>
        <p className="text-xs text-gray-400 mt-0.5">最新週の入賞者を上に、続いてpt降順。🏅＝入賞（100位以内）。</p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-separate border-spacing-0 min-w-[820px]">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="sticky left-0 bg-slate-100 text-left font-semibold px-3 py-2 z-20 min-w-[160px]">ライバー</th>
              <th className="text-left font-semibold px-2 py-2">所属 / レーベル</th>
              {weeks.map(w => (
                <th key={w} className="text-center font-semibold px-2 py-2 border-l border-slate-200">{ymdToLabel(w)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {livers.map((l, ri) => {
              const rowBg = ri % 2 ? 'bg-slate-50' : 'bg-white'
              return (
                <tr key={l.name + ri} className={`${rowBg} hover:bg-blue-50/40 border-b border-gray-50`}>
                  <td className={`sticky left-0 ${rowBg} px-3 py-2 font-medium text-gray-800 truncate max-w-[160px] z-10`} title={l.name}>{l.name}</td>
                  <td className="px-2 py-2 text-gray-400 whitespace-nowrap">
                    <span className="text-gray-600">{l.office}</span>
                    <span className="mx-1 text-gray-300">/</span>{l.label}
                  </td>
                  {l.weekly.map((c, ci) => (
                    <td key={ci} className={`px-2 py-2 text-center border-l border-gray-50 ${c.win ? 'bg-amber-50' : ''}`}>
                      {(c.pt > 0 || c.rank > 0) ? (
                        <div className="leading-tight">
                          <div className="font-mono text-gray-900">{c.rank > 0 ? `${c.rank}位` : '—'}{c.win && <span className="ml-0.5">🏅</span>}</div>
                          <div className="text-[10px] text-gray-400 tabular-nums">{fmt(c.pt)}</div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
