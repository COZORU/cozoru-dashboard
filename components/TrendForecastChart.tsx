'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'

type ActualItem   = { month: string; value: number }
type ForecastItem = { month: string; value: number }

type Props = {
  title: string
  color: string
  actual: ActualItem[]
  forecast: ForecastItem[]
  fmt?: (v: number) => string
  height?: number
}

const defaultFmt = (v: number) => v.toLocaleString()

export default function TrendForecastChart({
  title, color, actual, forecast, fmt = defaultFmt, height = 200
}: Props) {
  // 実績と予測をマージ（最終実績月を接続点として両系列に持たせる）
  type Point = { month: string; act?: number; fc?: number }
  const map: Record<string, Point> = {}

  actual.forEach(p => {
    map[p.month] = { ...map[p.month], month: p.month, act: p.value }
  })
  // 最終実績月を予測系列の起点にして線を繋ぐ
  const lastActual = actual.slice(-1)[0]
  if (lastActual) {
    map[lastActual.month] = { ...map[lastActual.month], fc: lastActual.value }
  }
  forecast.forEach(p => {
    map[p.month] = { ...map[p.month], month: p.month, fc: p.value }
  })

  const chartData = Object.values(map).sort((a, b) => a.month < b.month ? -1 : 1)
  const latestM = lastActual?.month
  const lastFcM = forecast.slice(-1)[0]?.month

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-4 mb-3">
        <span className="text-xs font-bold text-gray-700">{title}</span>
        {forecast.length > 0 && (
          <span className="flex items-center gap-3 text-xs text-gray-400 ml-auto">
            <span className="flex items-center gap-1">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2"/></svg>実績
            </span>
            <span className="flex items-center gap-1">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" strokeDasharray="5 3"/></svg>予測
              <span className="text-blue-400">(DB_成長予測)</span>
            </span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          {latestM && lastFcM && (
            <ReferenceArea x1={latestM} x2={lastFcM} fill="#e3f2fd" fillOpacity={0.4} />
          )}
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={60} />
          <Tooltip
            formatter={(v, key) => {
              if (v == null || typeof v !== 'number') return [null, key]
              const label = key === 'fc' ? '予測（DB_成長予測）' : '実績'
              return [fmt(v), label]
            }}
          />
          {latestM && (
            <ReferenceLine
              x={latestM} stroke="#90caf9" strokeDasharray="4 2"
              label={{ value: '予測→', position: 'insideTopRight', fontSize: 9, fill: '#64b5f6', dy: -4 }}
            />
          )}
          <Line
            type="monotone" dataKey="act" name="実績"
            stroke={color} strokeWidth={2.5}
            dot={{ r: 2.5 }} connectNulls={false}
          />
          {forecast.length > 0 && (
            <Line
              type="monotone" dataKey="fc" name="予測"
              stroke={color} strokeWidth={2} strokeDasharray="6 3"
              dot={{ r: 3, fill: '#fff', stroke: color, strokeWidth: 2 }}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
