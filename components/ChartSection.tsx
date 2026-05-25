'use client'
import dynamic from 'next/dynamic'

const TrendForecastChart = dynamic(() => import('./TrendForecastChart'), { ssr: false })

type DataPoint = { month: string; value: number }

type Props = {
  revActual: DataPoint[]; revForecast: DataPoint[]
  diaActual: DataPoint[]; diaForecast: DataPoint[]
  actActual: DataPoint[]; actForecast: DataPoint[]
  debActual: DataPoint[]; debForecast: DataPoint[]
}

export default function ChartSection({
  revActual, revForecast,
  diaActual, diaForecast,
  actActual, actForecast,
  debActual, debForecast
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <TrendForecastChart
        title="売上（税込・全社）"
        color="#1565c0"
        actual={revActual}
        forecast={revForecast}
        fmt={v => v >= 1_000_000 ? `¥${(v / 1_000_000).toFixed(1)}M` : `¥${v.toLocaleString()}`}
        height={200}
      />
      <TrendForecastChart
        title="応援ダイヤ（全社）"
        color="#43a047"
        actual={diaActual}
        forecast={diaForecast}
        fmt={v => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()}
        height={200}
      />
      {actActual.length > 0 && (
        <TrendForecastChart
          title="アクティブライバー数（全社）"
          color="#0097a7"
          actual={actActual}
          forecast={actForecast}
          fmt={v => `${v} 人`}
          height={200}
        />
      )}
      {debActual.length > 0 && (
        <TrendForecastChart
          title="デビュー数（全社）"
          color="#7b1fa2"
          actual={debActual}
          forecast={debForecast}
          fmt={v => `${v} 人`}
          height={200}
        />
      )}
    </div>
  )
}
