export function fmt(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}
export function ymdToLabel(ymd: string): string {
  if (!ymd || ymd.length < 8) return ymd || ''
  const m = parseInt(ymd.substring(4, 6), 10)
  const d = parseInt(ymd.substring(6, 8), 10)
  return `${m}/${d}`
}
export function heatPct(v: number, max: number): number {
  if (!max || max <= 0) return 0
  return Math.round((v / max) * 100)
}
export function ymToLabel(ym: string): string {
  if (!ym || ym.length < 6) return ym || ''
  return `${ym.substring(0, 4)}/${parseInt(ym.substring(4, 6), 10)}`
}
