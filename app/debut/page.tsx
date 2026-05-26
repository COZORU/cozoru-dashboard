'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'

// ── Types ────────────────────────────────────────────────────────────────────
type CohortRow = {
  month: string; count: number
  d1: number | null; d3: number | null; d6: number | null; d12: number | null
  c5Rate: number
}
type ApiData = {
  months: string[]
  latestMonth: string
  cohort: CohortRow[]
  labelTrend: Record<string, Record<string, number>>
}
type PreDebutRow = {
  no: string; liver: string; prevName: string; manager: string
  applyStatus: string; contractStatus: string; streamStatus: string; productionStatus: string
  iriamId: string; rankDone: string; contractMtg: string; orientation: string
  specSubmit: string; specStatus: string; specUrl: string | null
  illustStatus: string; roughDate: string | null; illustDate: string | null
  illustrator: string; illustProgress: number
  xAccount: string; twitterProgress: string
  firstMtgDate: string; mtgCount: number
  expectedDebut: string; debutMonth: string; debutDate: string | null
}

// ── ダミーデータ ──────────────────────────────────────────────────────────────
const PRE_DEBUT_DATA: PreDebutRow[] = [
  {
    no: 'PRE-001', liver: 'ゆきの', prevName: 'みるく', manager: '田中',
    applyStatus: '承認済', contractStatus: '締結済', streamStatus: '準備中', productionStatus: '制作中',
    iriamId: '—', rankDone: '完了', contractMtg: '2026-03-15', orientation: '2026-04-01',
    specSubmit: '2026-03-20', specStatus: '承認済', specUrl: '#',
    illustStatus: '制作中', roughDate: '2026-04-10', illustDate: null, illustrator: '絵師A', illustProgress: 70,
    xAccount: '@yukino_pre', twitterProgress: '開始済',
    firstMtgDate: '2026-03-10', mtgCount: 2,
    expectedDebut: '2026-07', debutMonth: '2026-07', debutDate: null,
  },
  {
    no: 'PRE-002', liver: 'はるか', prevName: '—', manager: '佐藤',
    applyStatus: '審査中', contractStatus: '説明済', streamStatus: '未設定', productionStatus: '未着手',
    iriamId: '—', rankDone: '未', contractMtg: '2026-04-20', orientation: '—',
    specSubmit: '—', specStatus: '未提出', specUrl: null,
    illustStatus: '未', roughDate: null, illustDate: null, illustrator: '—', illustProgress: 0,
    xAccount: '@haruka_vtuber', twitterProgress: '未開始',
    firstMtgDate: '2026-04-15', mtgCount: 1,
    expectedDebut: '2026-09', debutMonth: '2026-09', debutDate: null,
  },
  {
    no: 'PRE-003', liver: 'あおい', prevName: 'あお', manager: '田中',
    applyStatus: '承認済', contractStatus: '締結済', streamStatus: 'テスト済', productionStatus: '完了',
    iriamId: 'aoi_iris', rankDone: '完了', contractMtg: '2026-02-10', orientation: '2026-02-28',
    specSubmit: '2026-03-01', specStatus: '承認済', specUrl: '#',
    illustStatus: '納品済', roughDate: '2026-03-15', illustDate: '2026-04-20', illustrator: '絵師B', illustProgress: 100,
    xAccount: '@aoi_iris_pre', twitterProgress: '活発',
    firstMtgDate: '2026-02-05', mtgCount: 4,
    expectedDebut: '2026-06', debutMonth: '2026-06', debutDate: '2026-06-15',
  },
  {
    no: 'PRE-004', liver: 'こはる', prevName: '—', manager: '鈴木',
    applyStatus: '受付済', contractStatus: '未', streamStatus: '未設定', productionStatus: '未着手',
    iriamId: '—', rankDone: '未', contractMtg: '—', orientation: '—',
    specSubmit: '—', specStatus: '未提出', specUrl: null,
    illustStatus: '未', roughDate: null, illustDate: null, illustrator: '—', illustProgress: 0,
    xAccount: '—', twitterProgress: '未開始',
    firstMtgDate: '—', mtgCount: 0,
    expectedDebut: '2026-10', debutMonth: '2026-10', debutDate: null,
  },
]

// ── パイプラインステップ定義 ────────────────────────────────────────────────
const STEPS = [
  { key: 'apply',    label: '登録申請' },
  { key: 'contract', label: '契約'     },
  { key: 'rank',     label: 'ランク付' },
  { key: 'orient',   label: 'オリエン' },
  { key: 'spec',     label: '仕様書'   },
  { key: 'illust',   label: 'イラスト' },
  { key: 'sns',      label: 'SNS開設'  },
]

function stepStatus(row: PreDebutRow, key: string): 'done' | 'active' | 'pending' {
  switch (key) {
    case 'apply':    return row.applyStatus === '承認済' ? 'done' : row.applyStatus !== '—' ? 'active' : 'pending'
    case 'contract': return row.contractStatus === '締結済' ? 'done' : row.contractStatus === '説明済' ? 'active' : 'pending'
    case 'rank':     return row.rankDone === '完了' ? 'done' : 'pending'
    case 'orient':   return row.orientation !== '—' ? 'done' : 'pending'
    case 'spec':     return row.specStatus === '承認済' ? 'done' : row.specStatus !== '未提出' ? 'active' : 'pending'
    case 'illust':   return row.illustStatus === '納品済' ? 'done' : row.illustStatus !== '未' ? 'active' : 'pending'
    case 'sns':      return row.twitterProgress === '活発' ? 'done' : row.twitterProgress !== '未開始' ? 'active' : 'pending'
    default:         return 'pending'
  }
}

function overallPct(row: PreDebutRow): number {
  const statuses = STEPS.map(s => stepStatus(row, s.key))
  const done   = statuses.filter(s => s === 'done').length
  const active = statuses.filter(s => s === 'active').length
  return Math.round(((done + active * 0.5) / STEPS.length) * 70 + row.illustProgress * 0.3)
}

// ── ヘルパーコンポーネント ──────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  const empty = !value || value === '—'
  return (
    <div className="flex gap-2">
      <span className="text-[11px] text-gray-400 w-20 shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs font-medium ${empty ? 'text-gray-300' : 'text-gray-700'}`}>{value || '—'}</span>
    </div>
  )
}

function StepNode({ status }: { status: 'done' | 'active' | 'pending' }) {
  if (status === 'done')
    return <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-sm">✓</div>
  if (status === 'active')
    return <div className="w-6 h-6 rounded-full bg-blue-500 ring-2 ring-blue-200 ring-offset-1 flex items-center justify-center shrink-0"><div className="w-2 h-2 rounded-full bg-white" /></div>
  return <div className="w-6 h-6 rounded-full border-2 border-gray-200 bg-white shrink-0" />
}

function SpecPill({ v }: { v: string }) {
  if (v === '承認済') return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">承認済</span>
  if (v === '確認中') return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">確認中</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">未提出</span>
}

// ── デビュー前カード ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
]

function PreDebutCard({ row, idx }: { row: PreDebutRow; idx: number }) {
  const [open, setOpen] = useState(false)
  const pct    = overallPct(row)
  const steps  = STEPS.map(s => ({ ...s, status: stepStatus(row, s.key) }))
  const avatar = AVATAR_COLORS[idx % AVATAR_COLORS.length]

  const daysToDebut = row.debutDate
    ? Math.ceil((new Date(row.debutDate).getTime() - Date.now()) / 86400000)
    : null
  const isReady   = pct >= 90
  const isUrgent  = daysToDebut !== null && daysToDebut <= 40 && !isReady

  // パイプライン進行バー幅
  const lastActiveIdx = steps.reduce((last, s, i) => (s.status !== 'pending' ? i : last), -1)
  const lineWidth = lastActiveIdx >= 0
    ? `calc(${(lastActiveIdx / (steps.length - 1)) * 100}% - 12px)`
    : '0%'

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md
      ${isReady ? 'border-emerald-200' : isUrgent ? 'border-amber-200' : 'border-gray-100'}`}>

      {/* ── カード本体（クリックで展開） ── */}
      <button className="w-full text-left px-5 pt-5 pb-4" onClick={() => setOpen(v => !v)}>

        {/* 上段: アバター + 名前 + 進捗数値 */}
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shrink-0 ${avatar}`}>
            {row.liver.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900">{row.liver}</span>
              {row.prevName !== '—' && <span className="text-[11px] text-gray-400">元: {row.prevName}</span>}
              {isReady && (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">デビュー準備完了</span>
              )}
              {isUrgent && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">まもなくデビュー</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
              <span>担当: {row.manager}</span>
              <span className="text-gray-200">·</span>
              <span>デビュー予定: {row.debutMonth}</span>
              {row.mtgCount > 0 && <><span className="text-gray-200">·</span><span>MTG {row.mtgCount}回</span></>}
              {daysToDebut !== null && daysToDebut > 0 && (
                <><span className="text-gray-200">·</span><span className="text-amber-600 font-semibold">{daysToDebut}日後</span></>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-2xl font-black tabular-nums leading-none ${
              pct >= 80 ? 'text-emerald-600' : pct >= 40 ? 'text-blue-600' : 'text-gray-300'
            }`}>{pct}<span className="text-sm font-normal">%</span></div>
            <div className="text-[10px] text-gray-400 mt-0.5">完了率</div>
          </div>
        </div>

        {/* パイプライン */}
        <div className="mt-5 relative">
          {/* 背景ライン */}
          <div className="absolute top-3 left-3 right-3 h-0.5 bg-gray-100 rounded-full" />
          {/* 進行ライン */}
          <div
            className="absolute top-3 left-3 h-0.5 bg-emerald-400 rounded-full transition-all duration-500"
            style={{ width: lineWidth }}
          />
          <div className="relative flex">
            {steps.map(step => (
              <div key={step.key} className="flex-1 flex flex-col items-center">
                <StepNode status={step.status} />
                <div className={`text-[9px] mt-1.5 font-medium text-center leading-tight ${
                  step.status === 'done'   ? 'text-emerald-600' :
                  step.status === 'active' ? 'text-blue-600' : 'text-gray-300'
                }`}>{step.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 text-right text-[10px] text-gray-300">{open ? '▲ 閉じる' : '▼ 詳細を見る'}</div>
      </button>

      {/* ── 詳細展開エリア ── */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 bg-gradient-to-b from-gray-50/60 to-white">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">契約・準備</p>
              <div className="space-y-2">
                <InfoRow label="IRIAM ID"  value={row.iriamId} />
                <InfoRow label="契約説明会" value={row.contractMtg} />
                <InfoRow label="オリエン"  value={row.orientation} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">イラスト制作</p>
              <div className="space-y-2">
                <InfoRow label="担当絵師"  value={row.illustrator} />
                <InfoRow label="ラフ納品"  value={row.roughDate ?? '—'} />
                <InfoRow label="本番納品"  value={row.illustDate ?? '—'} />
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>進捗</span>
                  <span className="font-semibold text-gray-600">{row.illustProgress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${row.illustProgress === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`}
                    style={{ width: `${row.illustProgress}%` }}
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">SNS・MTG</p>
              <div className="space-y-2">
                <InfoRow label="X アカウント" value={row.xAccount} />
                <InfoRow label="Twitter 状況" value={row.twitterProgress} />
                <InfoRow label="初回 MTG"    value={row.firstMtgDate} />
                <InfoRow label="MTG 回数"    value={`${row.mtgCount} 回`} />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
            <span className="text-[11px] text-gray-400">仕様書</span>
            <SpecPill v={row.specStatus} />
            <span className="text-[11px] text-gray-400">提出日: {row.specSubmit}</span>
            {row.specUrl && (
              <a href={row.specUrl} className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-semibold">
                確認する →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── デビュー前一覧セクション ────────────────────────────────────────────────
function PreDebutSection() {
  const rows   = PRE_DEBUT_DATA
  const ready  = rows.filter(r => overallPct(r) >= 90).length
  const avgPct = Math.round(rows.reduce((s, r) => s + overallPct(r), 0) / rows.length)
  const illustDone = rows.filter(r => r.illustProgress === 100).length

  return (
    <section>
      {/* セクションヘッダー */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">デビュー前 準備状況</h2>
          <p className="text-xs text-gray-400 mt-0.5">各ライバーのデビューまでの進捗を管理</p>
        </div>
        {/* KPI バー */}
        <div className="flex items-center gap-4">
          {[
            { label: '準備中',       value: `${rows.length} 名`,   color: 'text-gray-700' },
            { label: '準備完了',     value: `${ready} 名`,          color: 'text-emerald-600' },
            { label: 'イラスト完了', value: `${illustDone}/${rows.length}`, color: 'text-blue-600' },
            { label: '平均進捗',     value: `${avgPct}%`,           color: 'text-violet-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-right">
              <div className={`text-lg font-black tabular-nums ${color}`}>{value}</div>
              <div className="text-[10px] text-gray-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-2 gap-4">
        {rows
          .slice()
          .sort((a, b) => overallPct(b) - overallPct(a))
          .map((row, i) => (
            <PreDebutCard key={row.no} row={row} idx={i} />
          ))}
      </div>
    </section>
  )
}

// ── 既存ユーティリティ ────────────────────────────────────────────────────────
function fmtDia(v: number | null) {
  if (v === null || v === undefined) return null
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

function diaTierCls(v: number | null): string {
  if (v === null) return ''
  if (v >= 30000) return 'bg-blue-50 text-blue-800 font-bold'
  if (v >= 10000) return 'bg-emerald-50 text-emerald-800 font-semibold'
  return 'text-gray-600'
}

// ── トレンドテーブル ────────────────────────────────────────────────────────
function TrendTable({ labelTrend, months }: { labelTrend: Record<string, Record<string, number>>; months: string[] }) {
  const offices = Object.keys(labelTrend).sort()
  const maxVal  = Math.max(...offices.flatMap(o => months.map(m => labelTrend[o]?.[m] || 0)), 1)

  function heatBg(v: number) {
    if (!v) return ''
    const ratio = v / maxVal
    if (ratio >= 0.8) return 'bg-blue-100 text-blue-900 font-bold'
    if (ratio >= 0.5) return 'bg-blue-50 text-blue-700 font-semibold'
    if (ratio >= 0.2) return 'bg-sky-50 text-sky-700'
    return 'text-gray-500'
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 text-sm">事務所別デビュー数 月次トレンド</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">濃い色ほど多いデビュー数</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left font-medium w-36">事務所</th>
              {months.map(m => (
                <th key={m} className="px-3 py-2.5 text-right font-medium">
                  {m.substring(5).replace(/^0/, '')}月
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 全社合計 */}
            <tr className="border-b border-gray-100 bg-slate-50">
              <td className="px-4 py-3 font-bold text-gray-900">全社合計</td>
              {months.map(m => {
                const total = offices.reduce((s, o) => s + (labelTrend[o]?.[m] || 0), 0)
                return (
                  <td key={m} className={`px-3 py-3 text-right font-bold tabular-nums ${heatBg(total)}`}>
                    {total || <span className="text-gray-200">—</span>}
                  </td>
                )
              })}
            </tr>
            {offices.map((office, oi) => (
              <tr key={office} className={`border-b border-gray-50 ${oi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                <td className="px-4 py-3 text-gray-700">{office}</td>
                {months.map(m => {
                  const v = labelTrend[office]?.[m] || 0
                  return (
                    <td key={m} className={`px-3 py-3 text-right tabular-nums rounded ${heatBg(v)}`}>
                      {v || <span className="text-gray-200">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── コホート分析テーブル ────────────────────────────────────────────────────
function CohortTable({ cohort }: { cohort: CohortRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 text-sm">デビュー後コホート分析</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">同月デビュー組の平均応援ダイヤ推移と C5 達成率</p>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-5 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-200" />
          <span className="text-blue-800 font-semibold">T1（3万+ dia）</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
          <span className="text-emerald-800 font-semibold">T2（1万+ dia）</span>
        </span>
        <span className="text-gray-400">C5達成率 = 6ヶ月以内にC5ランク報酬を獲得した割合</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left font-medium">デビュー月</th>
              <th className="px-3 py-2.5 text-right font-medium">人数</th>
              <th className="px-3 py-2.5 text-right font-medium">1ヶ月後</th>
              <th className="px-3 py-2.5 text-right font-medium">3ヶ月後</th>
              <th className="px-3 py-2.5 text-right font-medium">6ヶ月後</th>
              <th className="px-3 py-2.5 text-right font-medium">12ヶ月後</th>
              <th className="px-4 py-2.5 text-left font-medium">C5達成率</th>
              <th className="px-3 py-2.5 text-center font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {cohort.map((row, i) => (
              <tr key={row.month} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                <td className="px-4 py-3 font-bold text-gray-900">{row.month}</td>
                <td className="px-3 py-3 text-right text-gray-600 tabular-nums">{row.count}</td>
                {([row.d1, row.d3, row.d6, row.d12] as (number | null)[]).map((v, ci) => {
                  const text = fmtDia(v)
                  return (
                    <td key={ci} className="px-3 py-3 text-right tabular-nums">
                      {text
                        ? <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${diaTierCls(v)}`}>{text}</span>
                        : <span className="text-gray-200">—</span>}
                    </td>
                  )
                })}
                {/* C5バー */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          row.c5Rate >= 50 ? 'bg-blue-500' : row.c5Rate >= 30 ? 'bg-emerald-400' : 'bg-gray-300'
                        }`}
                        style={{ width: `${Math.min(row.c5Rate, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold w-9 text-right tabular-nums ${
                      row.c5Rate >= 50 ? 'text-blue-700' : row.c5Rate >= 30 ? 'text-emerald-700' : 'text-gray-400'
                    }`}>{row.c5Rate}%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  {row.d6 === null
                    ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700 font-semibold border border-amber-200">追跡中</span>
                    : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 font-semibold">完了</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── メインページ ─────────────────────────────────────────────────────────────
export default function DebutPage() {
  const [data, setData]       = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/data?action=debut')
      .then(r => r.json())
      .then(j => { if (j.status === 'ok') setData(j.data.debut) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">

        {/* ページヘッダー */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">デビュー管理</h1>
            <p className="text-sm text-gray-400 mt-1">ライバーのデビューまでの準備状況・コホート育成追跡</p>
          </div>
          {data?.latestMonth && (
            <div className="text-xs text-gray-400 bg-white border border-gray-100 rounded-xl px-4 py-2 shadow-sm">
              最新月: <span className="font-semibold text-gray-600">{data.latestMonth}</span>
            </div>
          )}
        </div>

        {/* コンテンツ */}
        <div className="space-y-8">

          {/* ① デビュー前一覧（常時表示） */}
          <PreDebutSection />

          {/* ② 以下はAPIデータが必要 */}
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-gray-400">データ読み込み中...</p>
            </div>
          ) : !data ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-gray-100">
              <p className="text-sm text-gray-400">データがありません</p>
            </div>
          ) : (
            <>
              {/* ② 事務所別トレンド */}
              <TrendTable labelTrend={data.labelTrend} months={data.months} />

              {/* ③ コホート分析 */}
              <CohortTable cohort={data.cohort} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
