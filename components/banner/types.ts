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
  joined?: boolean   // 新GASでは常に付与。旧版互換のため任意。
  noEvent?: boolean  // EventId未設定の行（最新回に表示）
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
export type BannerEventParticipant = {
  name: string
  office: string
  label: string
  rank: number
  pt: number
  win: boolean
}
export type BannerEvent = {
  week: string
  eventId: string
  blockId: string
  eventName: string
  office: string
  start: string
  end: string
  count: number
  winCount: number
  participants: BannerEventParticipant[]
}
export type BannerData = {
  baseDate: string
  weeks: string[]
  metrics: string[]
  byOrg: BannerEntity[]
  byLabel: BannerEntity[]
  byLiver: BannerLiver[]
  events?: BannerEvent[]
  summary: BannerSummary | null
  noEventCount?: number
  monthly?: BannerMonthlyData | null   // 旧GAS互換のため optional
}

// ─── 月次（monthly）───
export type BannerMonthlyMetric = {
  month: string            // YYYYMM
  ptSum: number
  avgPt: number | null
  winCount: number
  joinCount: number        // のべ参加
}
export type BannerMonthlyEntity = {
  name: string
  monthly: BannerMonthlyMetric[]   // months と同順（新しい順）
  totalPt: number
}
export type BannerMonthlyLiverCell = {
  month: string
  joinCount: number
  winCount: number
  ptSum: number
  bestRank: number         // 月内最高順位（0=順位なし）
}
export type BannerMonthlyLiver = {
  name: string
  office: string
  label: string
  monthly: BannerMonthlyLiverCell[]
}
export type BannerMonthlySummary = {
  month: string
  joinCount: number
  winCount: number
  winRate: number
  avgPt: number
  eventCount: number       // 開催回数（EventId×Block ユニーク）
  prev: { joinCount: number; winCount: number; winRate: number; avgPt: number; eventCount: number } | null
}
export type BannerTrendPoint = {
  month: string
  ptSum: number
  avgPt: number
  joinCount: number
  winCount: number
  winRate: number
  eventCount: number
}
export type BannerMonthlyData = {
  baseMonth: string
  months: string[]         // 直近6ヶ月（新しい順）
  allMonths: string[]      // 全期間（昇順）
  byOrg: BannerMonthlyEntity[]
  byLabel: BannerMonthlyEntity[]
  byLiver: BannerMonthlyLiver[]
  summary: BannerMonthlySummary | null
  trend: BannerTrendPoint[]
  noEventCount?: number
}
