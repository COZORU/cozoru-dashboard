import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const gasUrl = process.env.GAS_API_URL
  if (!gasUrl) return NextResponse.json({ error: 'GAS_API_URL not set' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'all'
  const month  = searchParams.get('month') || ''
  const base   = searchParams.get('base')  || ''
  const basem  = searchParams.get('basem') || ''

  const url = `${gasUrl}?action=${action}&month=${month}&base=${base}&basem=${basem}`
  const res = await fetch(url, { next: { revalidate: 60 } }) // 1分キャッシュ
  const json = await res.json()

  return NextResponse.json(json, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
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
