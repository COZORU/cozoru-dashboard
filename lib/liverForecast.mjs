export function median(xs) {
  if (!xs || xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// history: [{ registered, outflow }] を月昇順で。rate_i = outflow_i / registered_{i-1}。
// outflow が null/0以下の月は分子として不採用（データ欠損・先頭月の対策）。
export function retreatRates(history) {
  const rates = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].registered
    const out = history[i].outflow
    if (prev > 0 && out != null && out > 0) rates.push(out / prev)
  }
  return rates
}

// rate × 前月所属（予測は前月の予測所属を連鎖）で各予測月の流出を整数で返す。
export function buildOutflowForecast(history, rosterForecast, lastActualRegistered) {
  const rate = median(retreatRates(history))
  const out = []
  let prior = lastActualRegistered
  for (const rf of rosterForecast) {
    out.push({ month: rf.month, value: Math.round(rate * prior) })
    prior = rf.registered
  }
  return out
}
