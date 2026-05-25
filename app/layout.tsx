import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'cozoru Dashboard',
  description: '経営支援ダッシュボード',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
