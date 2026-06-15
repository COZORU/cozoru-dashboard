'use client'
import type { ReactNode } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'

type DP = { month: string; value: number }
type Row = {
  month: string
  inflow?: number; outflowNeg?: number; outflowFcNeg?: number; debut?: number
  forecast?: boolean
}
type Props = {
  title?: string
  inflow: DP[]
  outflow: DP[]
  outflowForecast?: DP[]
  debut?: DP[]
  height?: number
  info?: ReactNode
  bare?: boolean
}

const C_IN = '#1b9e77'
const C_OUT = '#d84315'
const C_OUT_FC = 'rgba(216,67,21,0.45)'
const C_DEBUT = '#BA7517'

export default function LiverFlowChart({
  title = '流入・流出（全社）', inflow, outflow, outflowForecast, debut, height = 240, info, bare,
}: Props) {
  const map: Record<string, Row> = {}
  const set = (mo: string, k: keyof Row, v: number) => {
    if (!map[mo]) map[mo] = { month: mo }
    ;(map[mo] as Record<string, number | string | boolean | undefined>)[k] = v
  }
  inflow.forEach(p => set(p.month, 'inflow', p.value))
  outflow.forEach(p => set(p.month, 'outflowNeg', -Math.abs(p.value)))
  ;(outflowForecast || []).forEach(p => set(p.month, 'outflowFcNeg', -Math.abs(p.value)))
  ;(debut || []).forEach(p => set(p.month, 'debut', p.value))
  const fcMonths = new Set<string>((outflowForecast || []).map(p => p.month))
  const rows = Object.values(map).sort((a, b) => (a.month < b.month ? -1 : 1))
  const firstFc = rows.find(r => fcMonths.has(r.month))
  const last = rows.filter(r => !fcMonths.has(r.month)).slice(-1)[0]

  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        {!bare && <span className="text-xs font-bold text-gray-700">{title}</span>}
        {info && (
          <div className="relative group">
            <button className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-[9px] flex items-center justify-center flex-shrink-0 hover:border-blue-400 hover:text-blue-500 cursor-help">?</button>
            <div className="absolute z-20 top-5 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs text-gray-700 hidden group-hover:block">{info}</div>
          </div>
        )}
        <span className="ml-auto text-[10px] text-gray-400">上向き＝流入／下向き＝流出{firstFc && '／薄い棒＝流出予測'}</span>
      </div>
      {last && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mb-2 text-xs">
          {last.inflow != null && <span className="text-gray-500">今月 <b style={{ color: C_IN }}>流入 +{last.inflow}</b></span>}
          {last.outflowNeg != null && <span className="text-gray-500"><b style={{ color: C_OUT }}>流出 −{Math.abs(last.outflowNeg)}</b></span>}
          {last.debut != null && <span className="text-gray-500">デビュー <b style={{ color: C_DEBUT }}>{last.debut}</b>（参考）</span>}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={(v: number) => `${Math.abs(v)}`} />
          <Tooltip formatter={(v, name) => [typeof v === 'number' ? `${Math.abs(v)} 人` : (v as unknown as string), name as string]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="#9e9e9e" />
          {firstFc && <ReferenceLine x={firstFc.month} stroke="#cbd5e1" strokeDasharray="4 3" />}
          <Bar dataKey="inflow" name="流入" fill={C_IN} isAnimationActive={false} />
          <Bar dataKey="outflowNeg" name="流出" fill={C_OUT} isAnimationActive={false} />
          <Bar dataKey="outflowFcNeg" name="流出(予測)" fill={C_OUT_FC} isAnimationActive={false} />
          <Line dataKey="debut" name="デビュー(参考)" stroke={C_DEBUT} strokeDasharray="3 3" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )

  if (bare) return body
  return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">{body}</div>
}
