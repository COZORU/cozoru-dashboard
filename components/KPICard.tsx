type Props = {
  title: string
  value: string
  sub?: string
  pct?: number | null
  color?: string
}

export default function KPICard({ title, value, sub, pct, color = '#1565c0' }: Props) {
  const up = pct != null && pct >= 0
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ backgroundColor: color }} />
      <div className="pl-2">
        <div className="text-xs text-gray-500 font-medium mb-2">{title}</div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
        {pct != null && (
          <div className={`text-xs font-medium mt-2 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
            {up ? '▲' : '▼'} {Math.abs(pct)}% 前月比
          </div>
        )}
      </div>
    </div>
  )
}
