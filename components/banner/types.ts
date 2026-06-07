export type BannerWeekMetric = {
  week: string            // YYYYMMDD
  ptSum: number
  avgPt: number | null
  winCount: number
  joinCount: number
}
export type BannerEntity = {
  name: string
  weekly: BannerWeekMetric[]   // weeks と同順（新しい順）
  totalPt: number
}
export type BannerLiverWeek = {
  week: string
  rank: number
  pt: number
  win: boolean
}
export type BannerLiver = {
  name: string
  office: string
  label: string
  weekly: BannerLiverWeek[]
}
export type BannerSummary = {
  week: string
  joinCount: number
  winCount: number
  winRate: number
  avgPt: number
  prev: { joinCount: number; winCount: number; winRate: number; avgPt: number } | null
}
export type BannerData = {
  baseDate: string
  weeks: string[]
  metrics: string[]
  byOrg: BannerEntity[]
  byLabel: BannerEntity[]
  byLiver: BannerLiver[]
  summary: BannerSummary | null
}
