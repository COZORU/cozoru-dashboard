import KPICard from '@/components/KPICard'
import RevenueChart from '@/components/RevenueChart'
import Sidebar from '@/components/Sidebar'

async function getData() {
  const url = process.env.GAS_API_URL
  if (!url) return null
  try {
    const res = await fetch(`${url}?action=summary`, { cache: 'no-store' })
    const json = await res.json()
    return json.status === 'ok' ? json.data.summary : null
  } catch { return null }
}

function fmtYen(v: number) {
  return v >= 1_000_000 ? `¥${(v / 1_000_000).toFixed(2)}M` : `¥${v.toLocaleString()}`
}

export default async function DashboardPage() {
  const d = await getData()
  const cur  = d?.current  || {}
  const trend = d?.trend   || []

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
            <p className="text-sm text-gray-400 mt-1">最新月: {d?.latestMonth || '—'}</p>
          </div>
        </div>

        {/* KPI カード */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KPICard
            title="売上（税込）"
            value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'}
            pct={d?.pctRevenue}
            color="#1565c0"
          />
          <KPICard
            title="応援ダイヤ"
            value={cur.dia ? `${cur.dia.toLocaleString()} dia` : '—'}
            pct={d?.pctDia}
            color="#43a047"
          />
          <KPICard
            title="アクティブライバー数"
            value={cur.active ? `${cur.active} 人` : '—'}
            color="#f57c00"
          />
          <KPICard
            title="今月デビュー数"
            value={cur.debut ? `${cur.debut} 人` : '—'}
            pct={d?.pctDebut}
            color="#7b1fa2"
          />
        </div>

        {/* Tier 内訳 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'T1（応援ダイヤ 3万+）', key: 't1', color: 'bg-blue-100 text-blue-800' },
            { label: 'T2（1万〜3万）',        key: 't2', color: 'bg-green-100 text-green-800' },
            { label: 'T3（1万未満）',          key: 't3', color: 'bg-gray-100 text-gray-700' },
          ].map(({ label, key, color }) => (
            <div key={key} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-xl font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                {cur[key] ?? '—'} 人
              </div>
            </div>
          ))}
        </div>

        {/* 売上トレンドチャート */}
        {trend.length > 0 && <RevenueChart data={trend} />}

        {!d && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
            GAS_API_URL が未設定です。GAS をデプロイ後に Vercel 環境変数を設定してください。
          </div>
        )}
      </main>
    </div>
  )
}
