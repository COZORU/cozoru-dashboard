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
  if (v === null || v === undefined) return '—'
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

function c5Color(rate: number) {
  if (rate >= 50) return 'text-blue-700 font-bold'
  if (rate >= 30) return 'text-green-700'
  return 'text-gray-500'
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

            {/* Section A: レーベル別デビュー数トレンド */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-[#1565c0] px-5 py-3">
                <h2 className="text-white font-bold text-sm">事務所別デビュー数 月次トレンド</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0d47a1] text-white text-xs">
                      <th className="px-4 py-2 text-left font-medium w-32">事務所</th>
                      {months.map(m => (
                        <th key={m} className="px-3 py-2 text-right font-medium">{m.substring(5)+'月'}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* 全社合計 */}
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
                <h2 className="text-white font-bold text-sm">デビュー後コホート分析（N月後の平均ダイヤ & C5達成率）</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0d47a1] text-white text-xs">
                      <th className="px-4 py-2 text-left font-medium">デビュー月</th>
                      <th className="px-3 py-2 text-right font-medium">人数</th>
                      <th className="px-3 py-2 text-right font-medium">+1M 平均ダイヤ</th>
                      <th className="px-3 py-2 text-right font-medium">+3M 平均ダイヤ</th>
                      <th className="px-3 py-2 text-right font-medium">+6M 平均ダイヤ</th>
                      <th className="px-3 py-2 text-right font-medium">+12M 平均ダイヤ</th>
                      <th className="px-3 py-2 text-right font-medium">C5達成率</th>
                      <th className="px-3 py-2 text-center font-medium">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohort.map((row, i) => (
                      <tr key={row.month} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 font-bold text-gray-900">{row.month}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.count}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(row.d1)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(row.d3)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(row.d6)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(row.d12)}</td>
                        <td className={`px-3 py-2 text-right ${c5Color(row.c5Rate)}`}>{row.c5Rate}%</td>
                        <td className="px-3 py-2 text-center">
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
