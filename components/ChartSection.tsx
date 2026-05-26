'use client'
import dynamic from 'next/dynamic'

const TrendForecastChart = dynamic(() => import('./TrendForecastChart'), { ssr: false })

type DataPoint = { month: string; value: number }

type Props = {
  revActual?: DataPoint[]; revPlan?: DataPoint[]; revForecast?: DataPoint[]
  diaActual?: DataPoint[]; diaForecast?: DataPoint[]
  actActual?: DataPoint[]; actForecast?: DataPoint[]
  debActual?: DataPoint[]; debForecast?: DataPoint[]
}

const InfoRev = (
  <div className="space-y-2">
    <div><span className="font-semibold">実績:</span> DB_サマリ より取得</div>
    <div>
      <div className="font-semibold mb-1">予測: 直近3か月平均 × 成長補正</div>
      <ul className="pl-2 space-y-0.5 text-gray-500">
        <li>◎（最高）→ M_事務所の補正率を加算</li>
        <li>✖（最低）→ M_事務所の補正率を減算</li>
        <li>○（基準）→ 補正なし</li>
      </ul>
      <div className="mt-1 text-[10px] text-gray-400">各事務所のダイヤ量で加重平均</div>
    </div>
  </div>
)

const InfoDia = (
  <div className="space-y-1.5">
    <div><span className="font-semibold">実績:</span> RAW_ライバー月次の応援ダイヤを月別に全社集計</div>
    <div><span className="font-semibold">予測:</span> 直近3か月の月次ダイヤ平均値</div>
  </div>
)

const InfoAct = (
  <div className="space-y-1.5">
    <div><span className="font-semibold">実績:</span> RAW_ライバー月次のアクティブ判定（月1回以上配信）を月別カウント</div>
    <div><span className="font-semibold">予測:</span> 直近3か月のアクティブ数平均値</div>
  </div>
)

const InfoDeb = (
  <div className="space-y-1.5">
    <div><span className="font-semibold">実績:</span> RAW_ライバー月次のデビュー判定を月別カウント</div>
    <div><span className="font-semibold">予測:</span> 直近3か月のデビュー数平均値</div>
  </div>
)

export default function ChartSection({
  revActual, revForecast,
  diaActual, diaForecast,
  actActual, actForecast,
  debActual, debForecast
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {revActual && revForecast && (
        <TrendForecastChart
          title="売上（税込・全社）"
          color="#1565c0"
          actual={revActual}
          plan={revPlan}
          forecast={revForecast}
          fmt={v => v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`}
          height={200}
          info={InfoRev}
        />
      )}
      {diaActual && diaForecast && (
        <TrendForecastChart
          title="応援ダイヤ（全社）"
          color="#43a047"
          actual={diaActual}
          forecast={diaForecast}
          fmt={v => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()}
          height={200}
          info={InfoDia}
        />
      )}
      {actActual && actForecast && actActual.length > 0 && (
        <TrendForecastChart
          title="アクティブライバー数（全社）"
          color="#0097a7"
          actual={actActual}
          forecast={actForecast}
          fmt={v => `${v} 人`}
          height={200}
          info={InfoAct}
        />
      )}
      {debActual && debForecast && debActual.length > 0 && (
        <TrendForecastChart
          title="デビュー数（全社）"
          color="#7b1fa2"
          actual={debActual}
          forecast={debForecast}
          fmt={v => `${v} 人`}
          height={200}
          info={InfoDeb}
        />
      )}
    </div>
  )
}
