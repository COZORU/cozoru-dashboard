import Sidebar from '@/components/Sidebar'
import AnnualDashboardClient, { type FullPLData } from '@/components/AnnualDashboardClient'

export const revalidate = 300

async function getData(): Promise<FullPLData | null> {
  const url = process.env.GAS_API_URL
  if (!url || url.includes('placeholder')) return null
  try {
    const res = await fetch(`${url}?action=fullpl`, { next: { revalidate: 300 } })
    const json = await res.json()
    return json.status === 'ok' ? json.data.fullpl : null
  } catch { return null }
}

export default async function TotalDashboardPage() {
  const d = await getData()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">総ダッシュボード</h1>
          <p className="text-sm text-gray-400 mt-1">全社実績PL（PL(全社) ※最終調整）</p>
        </div>

        {d && d.years && d.annual ? (
          <AnnualDashboardClient data={d} />
        ) : d ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-blue-800 text-sm">
            GAS の新バージョンをデプロイしてください。GAS エディタ → デプロイを管理 → 新バージョン。
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
            GAS_API_URL が未設定です。GAS をデプロイ後に Vercel 環境変数を設定してください。
          </div>
        )}
      </main>
    </div>
  )
}
