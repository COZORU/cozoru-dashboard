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
