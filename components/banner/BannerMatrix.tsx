import { type BannerEntity } from './types'
import { fmt, ymdToLabel, heatPct } from './format'

const WEEK_BAND = [
  'bg-blue-50 text-blue-700',
  'bg-green-50 text-green-700',
  'bg-amber-50 text-amber-700',
  'bg-orange-50 text-orange-700',
]

function Spark({ values }: { values: number[] }) {
  const chrono = [...values].reverse()
  const valid = chrono.filter(v => v > 0)
  if (valid.length < 2) return <span className="text-gray-300 text-[10px]">—</span>
  const max = Math.max(...chrono), min = Math.min(...chrono), range = max - min || 1
  const W = 72, H = 16
  const pts = chrono.map((v, i) => `${(i / (chrono.length - 1)) * W},${H - ((v - min) / range) * (H - 2) + 1}`).join(' ')
  return (
    <svg width={W} height={H + 2} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke="#1565c0" strokeWidth="1.5" />
      <circle cx={W} cy={H - ((chrono[chrono.length - 1] - min) / range) * (H - 2) + 1} r="2" fill="#1565c0" />
    </svg>
  )
}

export default function BannerMatrix({
  title, subtitle, entities, weeks,
}: { title: string; subtitle: string; entities: BannerEntity[]; weeks: string[] }) {
  const sectionMax = Math.max(1, ...entities.flatMap(e => e.weekly.map(w => w.ptSum)))
  const cornerLabel = title.replace(/^[①②③]\s*/, '').replace(/\s*—.*$/, '')
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-50">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-separate border-spacing-0 min-w-[860px]">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 bg-white text-left font-semibold text-slate-600 px-3 py-2 border-r border-gray-100 z-20 min-w-[150px]">{cornerLabel}</th>
              {weeks.map((w, i) => (
                <th key={w} colSpan={4} className={`text-center font-bold px-2 py-1.5 ${WEEK_BAND[i % 4]} ${i === 0 ? 'ring-2 ring-inset ring-blue-400' : ''}`}>{ymdToLabel(w)}{i === 0 && <span className="ml-1 align-middle text-[9px] font-bold text-white bg-blue-500 px-1 py-0.5 rounded">基準日</span>}</th>
              ))}
            </tr>
            <tr className="text-slate-400 text-[10px] bg-slate-50">
              {weeks.map((w) => (<MetricHeader key={w} />))}
            </tr>
          </thead>
          <tbody>
            {entities.map((e, ri) => {
              const rowBg = ri % 2 ? 'bg-slate-50' : 'bg-white'
              return (
                <tr key={e.name} className={`${rowBg} hover:bg-blue-50/40`}>
                  <td className={`sticky left-0 ${rowBg} px-3 py-2 border-r border-gray-100 align-top z-10`}>
                    <div className="font-bold text-gray-800 text-xs truncate max-w-[150px]" title={e.name}>{e.name}</div>
                    <Spark values={e.weekly.map(w => w.ptSum)} />
                  </td>
                  {e.weekly.map((c, ci) => (
                    <CellGroup key={ci} c={c} sectionMax={sectionMax} highlight={ci === 0} />
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

function MetricHeader() {
  return (
    <>
      <th className="px-2 py-1 font-semibold text-right border-l border-gray-100">pt合計</th>
      <th className="px-2 py-1 font-semibold text-right">平均</th>
      <th className="px-2 py-1 font-semibold text-center whitespace-nowrap">100位内</th>
      <th className="px-2 py-1 font-semibold text-right">参加</th>
    </>
  )
}

function CellGroup({ c, sectionMax, highlight }: { c: BannerEntity['weekly'][number]; sectionMax: number; highlight: boolean }) {
  return (
    <>
      <td className={`px-2 py-2 text-right border-l border-gray-100 ${highlight ? 'bg-blue-50/30' : ''}`}>
        <div className="font-bold text-gray-900 tabular-nums">{fmt(c.ptSum)}</div>
        <div className="h-[3px] rounded mt-0.5 bg-blue-600" style={{ width: `${heatPct(c.ptSum, sectionMax)}%` }} />
      </td>
      <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{fmt(c.avgPt)}</td>
      <td className="px-2 py-2 text-center">
        {c.winCount > 0
          ? <span className="inline-block min-w-[22px] px-1.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px]">{c.winCount}</span>
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{c.joinCount || '—'}</td>
    </>
  )
}
