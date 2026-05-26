'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'

type CohortRow = {
  month: string
  count: number
  d1: number | null
  d3: number | null
  d6: number | null
  d12: number | null
  c5Rate: number
}

type ApiData = {
  months: string[]
  latestMonth: string
  cohort: CohortRow[]
  labelTrend: Record<string, Record<string, number>>
}

// ─── デビュー前一覧 ─────────────────────────────────────────────

type PreDebutRow = {
  no: string
  liver: string
  prevName: string
  manager: string
  applyStatus: string
  contractStatus: string
  streamStatus: string
  productionStatus: string
  iriamId: string
  rankDone: string
  contractMtg: string
  orientation: string
  specSubmit: string
  specStatus: string
  specUrl: string | null
  illustStatus: string
  roughDate: string | null
  illustDate: string | null
  illustrator: string
  illustProgress: number
  xAccount: string
  twitterProgress: string
  firstMtgDate: string
  mtgCount: number
  expectedDebut: string
  debutMonth: string
  debutDate: string | null
}

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

type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  const styles: Record<BadgeVariant, string> = {
    green:  'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-500',
    blue:   'bg-blue-100 text-blue-800',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${styles[variant]}`}>
      {label}
    </span>
  )
}

function applyBadge(v: string) {
  if (v === '承認済') return <Badge label={v} variant="green" />
  if (v === '審査中') return <Badge label={v} variant="yellow" />
  if (v === '却下')   return <Badge label={v} variant="red" />
  if (v === '受付済') return <Badge label={v} variant="blue" />
  return <Badge label={v} variant="gray" />
}

function contractBadge(v: string) {
  if (v === '締結済') return <Badge label={v} variant="green" />
  if (v === '説明済') return <Badge label={v} variant="yellow" />
  if (v === '未')     return <Badge label={v} variant="gray" />
  return <Badge label={v} variant="gray" />
}

function streamBadge(v: string) {
  if (v === 'テスト済') return <Badge label={v} variant="green" />
  if (v === '準備中')   return <Badge label={v} variant="yellow" />
  if (v === '未設定')   return <Badge label={v} variant="gray" />
  return <Badge label={v} variant="gray" />
}

function productionBadge(v: string) {
  if (v === '完了')   return <Badge label={v} variant="green" />
  if (v === '制作中') return <Badge label={v} variant="yellow" />
  if (v === '未着手') return <Badge label={v} variant="gray" />
  return <Badge label={v} variant="gray" />
}

function specBadge(v: string) {
  if (v === '承認済') return <Badge label={v} variant="green" />
  if (v === '確認中') return <Badge label={v} variant="yellow" />
  if (v === '未提出') return <Badge label={v} variant="gray" />
  return <Badge label={v} variant="gray" />
}

function illustBadge(v: string) {
  if (v === '納品済') return <Badge label={v} variant="green" />
  if (v === '制作中') return <Badge label={v} variant="yellow" />
  if (v === '依頼済') return <Badge label={v} variant="blue" />
  if (v === '未')     return <Badge label={v} variant="gray" />
  return <Badge label={v} variant="gray" />
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-7 text-right">{pct}%</span>
    </div>
  )
}

// グループヘッダー用 th クラス
const GH: Record<string, string> = {
  g1: 'bg-blue-700 text-white',
  g2: 'bg-green-700 text-white',
  g3: 'bg-purple-700 text-white',
  g4: 'bg-orange-600 text-white',
  g5: 'bg-pink-700 text-white',
  g6: 'bg-teal-700 text-white',
  g7: 'bg-indigo-700 text-white',
  g8: 'bg-red-700 text-white',
}

function PreDebutTable() {
  const rows = PRE_DEBUT_DATA

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-gray-800 px-5 py-3 flex items-center justify-between">
        <h2 className="text-white font-bold text-sm">デビュー前一覧（準備中）</h2>
        <span className="text-xs bg-gray-600 text-gray-100 px-3 py-1 rounded-full">
          {rows.length}名 準備中
        </span>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="text-xs whitespace-nowrap border-collapse">
          <thead>
            {/* グループ行 */}
            <tr>
              <th colSpan={4} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g1}`}>基本情報</th>
              <th colSpan={4} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g2}`}>ステータス</th>
              <th colSpan={4} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g3}`}>契約・準備</th>
              <th colSpan={3} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g4}`}>仕様書</th>
              <th colSpan={5} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g5}`}>イラスト制作</th>
              <th colSpan={2} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g6}`}>SNS</th>
              <th colSpan={2} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g7}`}>MTG記録</th>
              <th colSpan={3} className={`px-3 py-1.5 text-center font-bold text-xs ${GH.g8}`}>デビュー予定</th>
            </tr>
            {/* カラム名行 */}
            <tr className="bg-gray-700 text-white">
              {/* G1 基本情報 */}
              <th className="px-3 py-2 text-left font-medium">NO</th>
              <th className="px-3 py-2 text-left font-medium">ライバー名</th>
              <th className="px-3 py-2 text-left font-medium">元配信者名</th>
              <th className="px-3 py-2 text-left font-medium">担当マネ</th>
              {/* G2 ステータス */}
              <th className="px-3 py-2 text-center font-medium">登録申請</th>
              <th className="px-3 py-2 text-center font-medium">契約</th>
              <th className="px-3 py-2 text-center font-medium">配信</th>
              <th className="px-3 py-2 text-center font-medium">制作</th>
              {/* G3 契約・準備 */}
              <th className="px-3 py-2 text-left font-medium">IRIAM ID</th>
              <th className="px-3 py-2 text-center font-medium">ランク付</th>
              <th className="px-3 py-2 text-center font-medium">契約説明会</th>
              <th className="px-3 py-2 text-center font-medium">オリエン</th>
              {/* G4 仕様書 */}
              <th className="px-3 py-2 text-center font-medium">提出日</th>
              <th className="px-3 py-2 text-center font-medium">ステータス</th>
              <th className="px-3 py-2 text-center font-medium">URL</th>
              {/* G5 イラスト制作 */}
              <th className="px-3 py-2 text-center font-medium">依頼状況</th>
              <th className="px-3 py-2 text-center font-medium">ラフ納品</th>
              <th className="px-3 py-2 text-center font-medium">イラスト納品</th>
              <th className="px-3 py-2 text-left font-medium">担当絵師</th>
              <th className="px-3 py-2 text-center font-medium">進捗</th>
              {/* G6 SNS */}
              <th className="px-3 py-2 text-left font-medium">Xアカウント</th>
              <th className="px-3 py-2 text-center font-medium">Twitter進捗</th>
              {/* G7 MTG */}
              <th className="px-3 py-2 text-center font-medium">初回MTG</th>
              <th className="px-3 py-2 text-center font-medium">MTG回数</th>
              {/* G8 デビュー予定 */}
              <th className="px-3 py-2 text-center font-medium">想定デビュー月</th>
              <th className="px-3 py-2 text-center font-medium">デビュー月</th>
              <th className="px-3 py-2 text-center font-medium">デビュー日</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.no} className={i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                {/* G1 */}
                <td className="px-3 py-2.5 text-gray-500">{row.no}</td>
                <td className="px-3 py-2.5 font-bold text-gray-900">{row.liver}</td>
                <td className="px-3 py-2.5 text-gray-600">{row.prevName}</td>
                <td className="px-3 py-2.5 text-gray-700">{row.manager}</td>
                {/* G2 */}
                <td className="px-3 py-2.5 text-center">{applyBadge(row.applyStatus)}</td>
                <td className="px-3 py-2.5 text-center">{contractBadge(row.contractStatus)}</td>
                <td className="px-3 py-2.5 text-center">{streamBadge(row.streamStatus)}</td>
                <td className="px-3 py-2.5 text-center">{productionBadge(row.productionStatus)}</td>
                {/* G3 */}
                <td className="px-3 py-2.5 text-gray-600 font-mono">{row.iriamId}</td>
                <td className="px-3 py-2.5 text-center">
                  {row.rankDone === '完了'
                    ? <Badge label="完了" variant="green" />
                    : <Badge label="未" variant="gray" />}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.contractMtg}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.orientation}</td>
                {/* G4 */}
                <td className="px-3 py-2.5 text-center text-gray-600">{row.specSubmit}</td>
                <td className="px-3 py-2.5 text-center">{specBadge(row.specStatus)}</td>
                <td className="px-3 py-2.5 text-center">
                  {row.specUrl
                    ? <a href={row.specUrl} className="text-blue-600 underline hover:text-blue-800">開く</a>
                    : <span className="text-gray-300">—</span>}
                </td>
                {/* G5 */}
                <td className="px-3 py-2.5 text-center">{illustBadge(row.illustStatus)}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.roughDate ?? '—'}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.illustDate ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{row.illustrator}</td>
                <td className="px-3 py-2.5"><ProgressBar pct={row.illustProgress} /></td>
                {/* G6 */}
                <td className="px-3 py-2.5 text-gray-700 font-mono">{row.xAccount}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.twitterProgress}</td>
                {/* G7 */}
                <td className="px-3 py-2.5 text-center text-gray-600">{row.firstMtgDate}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">
                  {row.mtgCount === 0
                    ? <span className="text-gray-300">—</span>
                    : row.mtgCount === 1
                    ? '1回'
                    : `${row.mtgCount}回実施`}
                </td>
                {/* G8 */}
                <td className="px-3 py-2.5 text-center text-gray-600">{row.expectedDebut}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.debutMonth}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.debutDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 既存ユーティリティ ──────────────────────────────────────────

function fmt(v: number | null) {
  if (v === null || v === undefined) return null
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

function diaColor(v: number | null) {
  if (v === null) return 'text-gray-300'
  if (v >= 30000) return 'text-blue-700 font-bold'
  if (v >= 10000) return 'text-green-700 font-semibold'
  return 'text-gray-600'
}

function DiaTd({ v }: { v: number | null }) {
  const text = fmt(v)
  if (!text) return <td className="px-3 py-3 text-center text-gray-300 text-xs">—</td>
  return (
    <td className={`px-3 py-3 text-right font-mono text-sm ${diaColor(v)}`}>{text}</td>
  )
}

function C5Bar({ rate }: { rate: number }) {
  const color = rate >= 50 ? 'bg-blue-500' : rate >= 30 ? 'bg-green-400' : 'bg-gray-300'
  const textColor = rate >= 50 ? 'text-blue-700 font-bold' : rate >= 30 ? 'text-green-700' : 'text-gray-400'
  return (
    <td className="px-3 py-3">
      <div className="flex items-center gap-2 min-w-[100px]">
        <div className="flex-1 bg-gray-100 rounded-full h-2">
          <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
        </div>
        <span className={`text-xs w-9 text-right ${textColor}`}>{rate}%</span>
      </div>
    </td>
  )
}

export default function DebutPage() {
  const [data, setData]       = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/data?action=debut')
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok') setData(j.data.debut)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const offices = data ? Object.keys(data.labelTrend).sort() : []
  const months  = data?.months || []

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">デビュー管理</h1>
          <p className="text-sm text-gray-400 mt-1">最新月: {data?.latestMonth || '—'}</p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">読み込み中...</div>
        ) : !data ? (
          <div className="p-12 text-center text-gray-400 text-sm">データがありません</div>
        ) : (
          <div className="space-y-8">

            {/* Section PRE: デビュー前一覧 */}
            <PreDebutTable />

            {/* Section A: 事務所別デビュー数トレンド */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-[#1565c0] px-5 py-3">
                <h2 className="text-white font-bold text-sm">事務所別デビュー数 月次トレンド</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0d47a1] text-white text-xs">
                      <th className="px-4 py-2 text-left font-medium w-36">事務所</th>
                      {months.map(m => (
                        <th key={m} className="px-3 py-2 text-right font-medium">{m.substring(5)}月</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-blue-50 border-b border-gray-100">
                      <td className="px-4 py-2 font-bold text-gray-900">全社合計</td>
                      {months.map(m => {
                        const total = offices.reduce((s, o) => s + (data.labelTrend[o]?.[m] || 0), 0)
                        return <td key={m} className="px-3 py-2 text-right font-bold text-gray-900">{total || '—'}</td>
                      })}
                    </tr>
                    {offices.map((office, oi) => (
                      <tr key={office} className={oi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 text-gray-700">{office}</td>
                        {months.map(m => (
                          <td key={m} className="px-3 py-2 text-right text-gray-600">
                            {data.labelTrend[office]?.[m] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section B: コホート分析 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-[#1565c0] px-5 py-3">
                <h2 className="text-white font-bold text-sm">デビュー後コホート分析</h2>
              </div>

              {/* 説明文 */}
              <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 leading-relaxed">
                <p>同じ月にデビューしたライバーを1グループとして追跡。<strong>N ヶ月後の平均応援ダイヤ</strong>でデビュー組の育成状況を確認できます。</p>
                <p className="mt-1">
                  <span className="text-blue-700 font-bold">■ 青字（3万+）</span>
                  {' = T1相当　'}
                  <span className="text-green-700 font-semibold">■ 緑字（1万+）</span>
                  {' = T2相当　'}
                  <strong>C5達成率</strong>{' = 6ヶ月以内に C5ランク報酬を獲得した割合（高いほど定着率◎）'}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0d47a1] text-white text-xs">
                      <th className="px-4 py-2 text-left font-medium">デビュー月</th>
                      <th className="px-3 py-2 text-right font-medium">人数</th>
                      <th className="px-3 py-2 text-right font-medium">1ヶ月後</th>
                      <th className="px-3 py-2 text-right font-medium">3ヶ月後</th>
                      <th className="px-3 py-2 text-right font-medium">6ヶ月後</th>
                      <th className="px-3 py-2 text-right font-medium">12ヶ月後</th>
                      <th className="px-3 py-2 text-left font-medium pl-5">C5達成率（6M以内）</th>
                      <th className="px-3 py-2 text-center font-medium">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohort.map((row, i) => (
                      <tr key={row.month} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 font-bold text-gray-900">{row.month}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.count}</td>
                        <DiaTd v={row.d1} />
                        <DiaTd v={row.d3} />
                        <DiaTd v={row.d6} />
                        <DiaTd v={row.d12} />
                        <C5Bar rate={row.c5Rate} />
                        <td className="px-3 py-3 text-center">
                          {row.d6 === null ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">追跡中</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">完了</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
