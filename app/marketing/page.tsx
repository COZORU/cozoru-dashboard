'use client'
import Sidebar from '@/components/Sidebar'
import { TrendingUp } from 'lucide-react'

export default function MarketingPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">３ マーケ管理</h1>
          <p className="text-sm text-gray-400 mt-1">CPA・CPO管理</p>
        </div>
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <TrendingUp size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium text-lg">準備中</p>
          <p className="text-gray-400 text-sm mt-2">マーケティングデータが揃い次第実装予定</p>
        </div>
      </main>
    </div>
  )
}
