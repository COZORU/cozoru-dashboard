import { NextResponse } from 'next/server'

// 書込/揮発系は常に最新、それ以外（読み取り集計）は1時間キャッシュ
const NO_CACHE_ACTIONS = new Set(['runsync', 'debug', 'logs'])

export async function GET(req: Request) {
  const gasUrl = process.env.GAS_API_URL
  if (!gasUrl) return NextResponse.json({ error: 'GAS_API_URL not set' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'all'
  const month  = searchParams.get('month') || ''
  const base   = searchParams.get('base')  || ''
  const basem  = searchParams.get('basem') || ''

  const url = `${gasUrl}?action=${action}&month=${month}&base=${base}&basem=${basem}`
  // 読み取り系は1時間キャッシュ＋stale-while-revalidate（期限切れでも古い結果を即返し、裏で更新→誰も待たない）。
  // 書込/揮発系（runsync 等）は常に最新。
  const noCache = NO_CACHE_ACTIONS.has(action)
  const res = await fetch(url, noCache ? { cache: 'no-store' } : { next: { revalidate: 3600 } })
  const json = await res.json()

  return NextResponse.json(json, {
    headers: {
      'Cache-Control': noCache ? 'no-store' : 's-maxage=3600, stale-while-revalidate=86400',
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
