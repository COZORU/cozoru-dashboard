import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const gasUrl = process.env.GAS_API_URL
  if (!gasUrl) return NextResponse.json({ error: 'GAS_API_URL not set' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'all'
  const month  = searchParams.get('month') || ''

  const url = `${gasUrl}?action=${action}&month=${month}`
  const res = await fetch(url, { cache: 'no-store' }) // 毎回最新を取得
  const json = await res.json()

  return NextResponse.json(json, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

export async function POST(req: Request) {
  const gasUrl = process.env.GAS_API_URL
  if (!gasUrl) return NextResponse.json({ error: 'GAS_API_URL not set' }, { status: 500 })

  const body = await req.json()
  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return NextResponse.json(json)
}
