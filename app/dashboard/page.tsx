import Sidebar from '@/components/Sidebar'
import FinanceDashboardClient, { type SummaryData } from '@/components/FinanceDashboardClient'

export const dynamic = 'force-dynamic'

async function getData(): Promise<SummaryData | null> {
  const url = process.env.GAS_API_URL
  if (!url || url.includes('placeholder')) return null
  try {
    const res = await fetch(`${url}?action=summary`, { cache: 'no-store' })
    const json = await res.json()
    return json.status === 'ok' ? json.data.summary : null
  } catch { return null }
}

export default async function DashboardPage() {
  const d = await getData()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">０ 財務管理</h1>
          <p className="text-sm text-gray-400 mt-1">最新月: {d?.latestMonth || '—'}</p>
        </div>

        {d ? (
          <FinanceDashboardClient data={d} />
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
            GAS_API_URL が未設定です。GAS をデプロイ後に Vercel 環境変数を設定してください。
          </div>
        )}
      </main>
    </div>
  )
}
