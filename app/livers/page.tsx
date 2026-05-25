'use client'
import { useEffect, useState, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'

type Liver = {
  uid: string
  name: string
  office: string
  label: string
  dia: number
  rank: string
  tier: string
  active: boolean
  fc1: number
  fc2: number
  fc3: number
}

type ApiData = {
  months: string[]
  latestMonth: string
  livers: Liver[]
}

const TIER_STYLE: Record<string, string> = {
  T1: 'bg-blue-100 text-blue-800',
  T2: 'bg-green-100 text-green-800',
  T3: 'bg-gray-100 text-gray-600',
}

function fmt(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

export default function LiversPage() {
  const [data, setData]       = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth]     = useState('')
  const [search, setSearch]   = useState('')
  const [tier, setTier]       = useState('ALL')

  useEffect(() => {
    const url = month ? `/api/data?action=livers&month=${month}` : '/api/data?action=livers'
    setLoading(true)
    fetch(url)
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok') setData(j.data.livers)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [month])

  const livers = useMemo(() => {
    if (!data) return []
    return data.livers.filter(l => {
      if (tier !== 'ALL' && l.tier !== tier) return false
      if (search && !l.name.includes(search) && !l.uid.includes(search) && !l.office.includes(search)) return false
      return true
    })
  }, [data, tier, search])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ライバー管理</h1>
          <p className="text-sm text-gray-400 mt-1">
            最新月: {data?.latestMonth || '—'} ／ {livers.length} 人表示中
          </p>
        </div>

        {/* フィルターバー */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0]"
          >
            <option value="">最新月</option>
            {(data?.months || []).slice().reverse().map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={tier}
            onChange={e => setTier(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0]"
          >
            <option value="ALL">全Tier</option>
            <option value="T1">T1（3万+）</option>
            <option value="T2">T2（1〜3万）</option>
            <option value="T3">T3（1万未満）</option>
          </select>

          <input
            type="text"
            placeholder="名前 / UID / 事務所 で検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0] w-64"
          />
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : livers.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1a1a2e] text-white text-xs">
                    <th className="px-4 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">アカウント名</th>
                    <th className="px-4 py-3 text-left font-medium">事務所</th>
                    <th className="px-4 py-3 text-center font-medium">Tier</th>
                    <th className="px-4 py-3 text-center font-medium">ランク</th>
                    <th className="px-4 py-3 text-right font-medium">応援ダイヤ</th>
                    <th className="px-4 py-3 text-right font-medium">+1M予測</th>
                    <th className="px-4 py-3 text-right font-medium">+2M予測</th>
                    <th className="px-4 py-3 text-right font-medium">+3M予測</th>
                  </tr>
                </thead>
                <tbody>
                  {livers.map((l, i) => (
                    <tr key={l.uid} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{l.name || l.uid}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{l.office}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${TIER_STYLE[l.tier] || TIER_STYLE.T3}`}>
                          {l.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{l.rank || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{fmt(l.dia)}</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-600">{fmt(l.fc1)}</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-500">{fmt(l.fc2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-400">{fmt(l.fc3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
