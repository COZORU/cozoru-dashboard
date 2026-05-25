import Sidebar from '@/components/Sidebar'

export default function LiversPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ライバー管理</h1>
        <p className="text-sm text-gray-400 mb-8">個人KPI・Tier別分析・3ヶ月予測</p>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
          準備中（Phase 4 で実装）
        </div>
      </main>
    </div>
  )
}
