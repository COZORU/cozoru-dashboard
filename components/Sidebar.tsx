'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart2, LayoutDashboard, Users, Star, TrendingUp, Upload, LogOut, UserCircle } from 'lucide-react'

const NAV_MAIN = [
  { href: '/total-dashboard', label: '総ダッシュボード',  icon: BarChart2 },
  { href: '/dashboard',       label: '０ 財務管理',       icon: LayoutDashboard },
  { href: '/livers',          label: '１ ライバー管理',   icon: Users },
  { href: '/debut',           label: '２ デビュー管理',   icon: Star },
  { href: '/marketing',       label: '３ マーケ管理',     icon: TrendingUp },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-[#1a1a2e] flex flex-col z-50">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="text-white font-bold text-xl">cozoru</div>
        <div className="text-white/40 text-xs mt-1">グループ経営ダッシュボード</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_MAIN.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                active
                  ? 'bg-[#1565c0] text-white font-medium'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
        {/* マイページ（準備中） */}
        <a
          href="#"
          onClick={e => e.preventDefault()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 cursor-default transition"
        >
          <UserCircle size={16} />
          マイページ
          <span className="ml-auto text-[9px] bg-white/10 text-white/30 px-1.5 py-0.5 rounded">準備中</span>
        </a>
        {/* CSVアップロード */}
        <Link
          href="/upload"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
            pathname === '/upload'
              ? 'bg-[#1565c0] text-white font-medium'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Upload size={16} />
          CSVアップロード
        </Link>
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white w-full transition"
        >
          <LogOut size={16} />
          ログアウト
        </button>
      </div>
    </aside>
  )
}
