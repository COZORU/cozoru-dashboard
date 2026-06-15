export function median(xs: number[]): number
export function retreatRates(
  history: { registered: number; outflow: number | null }[]
): number[]
export function buildOutflowForecast(
  history: { registered: number; outflow: number | null }[],
  rosterForecast: { month: string; registered: number }[],
  lastActualRegistered: number
): { month: string; value: number }[]
