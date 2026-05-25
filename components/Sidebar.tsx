'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, Star, Upload, LogOut } from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/livers',    label: 'ライバー管理',   icon: Users },
  { href: '/debut',     label: 'デビュー管理',   icon: Star },
  { href: '/upload',    label: 'CSVアップロード', icon: Upload },
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
        <div className="text-white/40 text-xs mt-1">経営ダッシュボード</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
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
