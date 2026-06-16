'use client'
import type { ReactNode } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LabelList, Cell, ReferenceLine
} from 'recharts'

type DP = { month: string; value: number }
type Flow = { inflow: number; outflow: number }
type Row = {
  month: string
  active?: number; inactive?: number; total?: number
  activePct?: number; inactivePct?: number
  inflow?: number; outflow?: number
  forecast?: boolean
}
type Props = {
  title?: string
  active: DP[]
  inactive: DP[]
  activeForecast?: DP[]     // 3か月予測（アクティブ）＝summary.activeForecastと同ロジック
  inactiveForecast?: DP[]   // 3か月予測（非アクティブ）＝同じ素朴法で延長
  flows?: Record<string, Flow>   // 月→{流入,流出}（登録ベース・全社）
  height?: number
  info?: ReactNode
  bare?: boolean
}

const C_ACT = '#0097a7'        // アクティブ（濃）
const C_INACT = '#b0bec5'      // 非アクティブ（淡グレー）
const C_INACT_TXT = '#1f2937'  // 非アクティブのバー上ラベル（濃紺＝高コントラスト）
const C_IN = '#1b9e77'         // 流入
const C_OUT = '#d84315'        // 流出

export default function LiverOverviewChart({
  title = '所属ライバー内訳＋流入/流出（全社）',
  active, inactive, activeForecast, inactiveForecast, flows, height = 240, info, bare
}: Props) {
  const map: Record<string, Row> = {}
  const set = (mo: string, k: keyof Row, v: number) => {
    if (!map[mo]) map[mo] = { month: mo }
    ;(map[mo] as Record<string, number | string | boolean | undefined>)[k] = v
  }
  active.forEach(p => set(p.month, 'active', p.value))
  inactive.forEach(p => set(p.month, 'inactive', p.value))
  ;(activeForecast || []).forEach(p => set(p.month, 'active', p.value))
  ;(inactiveForecast || []).forEach(p => set(p.month, 'inactive', p.value))
  const fcMonths = new Set<string>([
    ...(activeForecast || []).map(p => p.month),
    ...(inactiveForecast || []).map(p => p.month),
  ])
  const rows = Object.values(map).sort((a, b) => a.month < b.month ? -1 : 1)
  rows.forEach(r => {
    r.forecast = fcMonths.has(r.month)
    const a = r.active || 0, i = r.inactive || 0, t = a + i
    r.total = t
    if (t > 0) { r.activePct = Math.round(a / t * 100); r.inactivePct = 100 - r.activePct }
    if (!r.forecast) {
      const fl = flows && flows[r.month]
      if (fl) { r.inflow = fl.inflow; r.outflow = fl.outflow }
    }
  })
  const last = rows.filter(r => !r.forecast && (r.total || 0) > 0).slice(-1)[0]
  const firstFc = rows.find(r => r.forecast)
  const lastFc = rows.filter(r => r.forecast).slice(-1)[0]
  const hasFc = !!firstFc

  // セグメント内ラベル（人数＋%）。予測バーは淡いので文字色を切替える。
  const segLabel = (key: 'active' | 'inactive', pctKey: 'activePct' | 'inactivePct', actualColor: string, fcColor: string) =>
    (props: { x?: number; y?: number; width?: number; height?: number; index?: number }) => {
      const x = props.x || 0, y = props.y || 0, w = props.width || 0, h = props.height || 0, idx = props.index || 0
      const r = rows[idx]
      if (!r || h < 18) return null
      const cnt = r[key] as number | undefined
      const pct = r[pctKey] as number | undefined
      if (cnt == null) return null
      const color = r.forecast ? fcColor : actualColor
      return (
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={9.5} fill={color} fontWeight={600}>
          <tspan x={x + w / 2} dy={-3}>{cnt.toLocaleString()}</tspan>
          <tspan x={x + w / 2} dy={11}>{pct != null ? `${pct}%` : ''}</tspan>
        </text>
      )
    }

  // 棒の上：所属計（1行目）＋ 流入/流出 or 予測ラベル（2行目）
  const totalLabel = (props: { x?: number; y?: number; width?: number; index?: number }) => {
    const x = props.x || 0, y = props.y || 0, w = props.width || 0, idx = props.index || 0
    const r = rows[idx]
    if (!r || !r.total) return null
    const cx = x + w / 2
    return (
      <text x={cx} y={y - 20} textAnchor="middle" fontWeight={700} fill={r.forecast ? '#90a4ae' : '#37474f'}>
        <tspan x={cx} fontSize={10}>{r.total.toLocaleString()}</tspan>
        {r.forecast ? (
          <tspan x={cx} dy={11} fontSize={9} fill={C_ACT} fontWeight={700}>予測</tspan>
        ) : r.inflow != null && (
          <tspan x={cx} dy={11} fontSize={9}>
            <tspan fill={C_IN}>入{r.inflow}</tspan>
            <tspan fill={C_OUT}>  出{r.outflow}</tspan>
          </tspan>
        )}
      </text>
    )
  }

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
        <span className="ml-auto text-[10px] text-gray-400">棒の上＝所属計と流入(入)/流出(出){hasFc && '／薄い棒＝3か月予測'}</span>
      </div>
      {last && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mb-2 text-xs">
          <span className="flex items-center gap-1 text-gray-700"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: C_ACT }} />アクティブ <b style={{ color: C_ACT }}>{(last.active || 0).toLocaleString()}人（{last.activePct}%）</b></span>
          <span className="flex items-center gap-1 text-gray-700"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: C_INACT }} />非アクティブ <b className="text-gray-800">{(last.inactive || 0).toLocaleString()}人（{last.inactivePct}%）</b></span>
          <span className="text-gray-500">所属計 <b className="text-gray-700">{(last.total || 0).toLocaleString()}人</b></span>
          {last.inflow != null && <span className="text-gray-500">今月 <b style={{ color: C_IN }}>流入+{last.inflow}</b> / <b style={{ color: C_OUT }}>流出−{last.outflow}</b></span>}
          {lastFc && <span className="text-gray-500">→ 3か月後（{parseInt(lastFc.month.slice(5), 10)}月）予測 <b style={{ color: C_ACT }}>所属計 {(lastFc.total || 0).toLocaleString()}人</b></span>}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 38, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 9 }} width={48} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip formatter={(v, name) => [typeof v === 'number' ? `${v.toLocaleString()} 人` : v as unknown as string, name as string]} labelFormatter={(l) => fcMonths.has(String(l)) ? `${l}（予測）` : String(l)} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span style={{ color: '#374151' }}>{value}</span>} />
          {hasFc && firstFc && <ReferenceLine x={firstFc.month} stroke="#cbd5e1" strokeDasharray="4 3" />}
          <Bar dataKey="active" name="アクティブ" stackId="livers" fill={C_ACT} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fillOpacity={r.forecast ? 0.45 : 1} />)}
            <LabelList content={segLabel('active', 'activePct', '#ffffff', C_INACT_TXT) as never} />
          </Bar>
          <Bar dataKey="inactive" name="非アクティブ" stackId="livers" fill={C_INACT} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fillOpacity={r.forecast ? 0.55 : 1} />)}
            <LabelList content={segLabel('inactive', 'inactivePct', C_INACT_TXT, C_INACT_TXT) as never} />
            <LabelList content={totalLabel as never} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  )
  if (bare) return body
  return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">{body}</div>
}
