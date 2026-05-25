'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'

const OFFICES = ['株式会社cozoru', '株式会社Tolance', 'ライブナウV']

export default function UploadPage() {
  const [office, setOffice]   = useState(OFFICES[0])
  const [month, setMonth]     = useState('')
  const [file, setFile]       = useState<File | null>(null)
  const [status, setStatus]   = useState<'idle'|'loading'|'ok'|'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !month) return
    setStatus('loading')
    const csvText = await file.text()
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ office, targetMonth: month, csvText }),
    })
    const json = await res.json()
    if (json.status === 'ok') {
      setStatus('ok')
      setMessage(`${json.count} 件を取込みました`)
    } else {
      setStatus('error')
      setMessage(json.message || 'エラーが発生しました')
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">CSVアップロード</h1>
        <div className="max-w-lg bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleUpload} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">事務所</label>
              <select
                value={office}
                onChange={e => setOffice(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565c0]"
              >
                {OFFICES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">対象月</label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565c0]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CSVファイル</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#1565c0] file:text-white file:text-sm hover:file:bg-[#0d47a1]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-[#1565c0] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#0d47a1] disabled:opacity-50 transition"
            >
              {status === 'loading' ? '処理中...' : 'アップロード・取込実行'}
            </button>
          </form>

          {status === 'ok' && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-emerald-700 text-sm">
              ✅ {message}
            </div>
          )}
          {status === 'error' && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              ❌ {message}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
