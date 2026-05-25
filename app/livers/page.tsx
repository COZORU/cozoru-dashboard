'use client'
import { useEffect, useState, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'

// ─── Types ───────────────────────────────────────────────────
type Liver = {
  uid: string; name: string; office: string; label: string
  dia: number; rank: string; tier: string; active: boolean
  fc1: number; fc2: number; fc3: number
  prevRank: string; prevTier: string
  dia3m: number[]; hours3m: number[]
  debutMonth: string; prevFc1: number
}
type ApiData = { months: string[]; latestMonth: string; livers: Liver[] }

// ─── Constants ───────────────────────────────────────────────
const RANK_ORD: Record<string, number> = {
  D:0, C1:1,C2:2,C3:3,C4:4,C5:5, B1:6,B2:7,B3:8, A1:9,A2:10,A3:11, S1:12,S2:13,S3:14
}
const RANK_BANDS = [
  { key:'S', label:'S帯', ranks:new Set(['S1','S2','S3']),           color:'#c62828' },
  { key:'A', label:'A帯', ranks:new Set(['A1','A2','A3']),           color:'#e65100' },
  { key:'B', label:'B帯', ranks:new Set(['B1','B2','B3']),           color:'#1565c0' },
  { key:'C', label:'C帯', ranks:new Set(['C1','C2','C3','C4','C5']), color:'#2e7d32' },
  { key:'D', label:'D',   ranks:new Set(['D']),                      color:'#757575' },
]
const TIER_STYLE: Record<string,string> = {
  T1:'bg-blue-100 text-blue-800', T2:'bg-green-100 text-green-800', T3:'bg-gray-100 text-gray-600'
}
const TIER_N: Record<string,number> = { T1:1, T2:2, T3:3 }

const getRankBand = (rank: string) => RANK_BANDS.find(b => b.ranks.has(rank))

function fmt(v: number) {
  return v >= 10000 ? `${(v/10000).toFixed(1)}万` : v.toLocaleString()
}
function monthDiff(a: string, b: string) {
  if (!a || !b) return 999
  const [ay,am] = a.split('-').map(Number)
  const [by,bm] = b.split('-').map(Number)
  return (by-ay)*12 + (bm-am)
}

// ─── Sub-components ──────────────────────────────────────────
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const valid = values.filter(v => v > 0)
  if (valid.length < 2) return <span className="text-gray-200 text-xs">—</span>
  const max = Math.max(...values), min = Math.min(...values)
  const range = max - min || 1
  const W = 44, H = 18
  const pts = values.map((v,i) =>
    `${(i/(values.length-1))*W},${H-((v-min)/range)*(H-2)+1}`
  ).join(' ')
  return (
    <svg width={W} height={H+2} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"/>
      {values.map((v,i) => (
        <circle key={i} cx={(i/(values.length-1))*W} cy={H-((v-min)/range)*(H-2)+1} r="2.5" fill={color}/>
      ))}
    </svg>
  )
}

function DiaAlert({ d }: { d: number[] }) {
  const drop3 = d[0]>0 && d[1]>0 && d[2]>0 && d[0]>d[1] && d[1]>d[2]
  const drop2 = !drop3 && d[1]>0 && d[2]>0 && d[1]>d[2]
  if (drop3) return <span title="ダイヤ3か月連続下降" className="ml-1 text-sm">🔴</span>
  if (drop2) return <span title="ダイヤ直近2か月下降" className="ml-1 text-sm">🟡</span>
  return null
}

function HoursAlert({ h }: { h: number[] }) {
  if (!h[0]||!h[1]||!h[2]) return null
  if (h[0]>h[1] && h[1]>h[2]) return <span title="配信時間3か月連続下降" className="text-xs ml-0.5">⏰🔴</span>
  if (h[1]>h[2]) return <span title="配信時間直近2か月下降" className="text-xs ml-0.5">⏰🟡</span>
  return null
}

function RankCell({ rank, prevRank }: { rank: string; prevRank: string }) {
  if (!rank) return <span className="text-gray-400">—</span>
  const band = getRankBand(rank)
  const cur = RANK_ORD[rank]??-1, prv = RANK_ORD[prevRank]??-1
  const changed = !!prevRank && prevRank !== rank && prv >= 0 && cur >= 0
  const up = changed && cur > prv
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-bold text-sm" style={{color: band?.color}}>{rank}</span>
      {changed && (
        <span className={`text-xs font-semibold ${up?'text-green-500':'text-red-400'}`}>
          {up?'↑':'↓'}<span className="text-gray-400 font-normal text-[10px]">{prevRank}</span>
        </span>
      )}
    </span>
  )
}

function TierCell({ tier, prevTier }: { tier: string; prevTier: string }) {
  const changed = !!prevTier && prevTier !== tier
  const up = changed && (TIER_N[tier]||3) < (TIER_N[prevTier]||3)
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-bold ${TIER_STYLE[tier]||TIER_STYLE.T3}`}>
      {tier}
      {changed && <span className={up?'text-green-600':'text-orange-600'}>{up?'↑':'↓'}</span>}
    </span>
  )
}

function AccuracyCell({ prevFc1, dia }: { prevFc1: number; dia: number }) {
  if (!prevFc1 || !dia) return <span className="text-gray-300 text-xs">—</span>
  const pct = Math.round((dia-prevFc1)/prevFc1*100)
  const cls = Math.abs(pct)<10 ? 'text-gray-400' : pct>0 ? 'text-green-600' : 'text-red-500'
  return (
    <span className={`text-xs font-mono ${cls}`} title={`予測${fmt(prevFc1)}→実績${fmt(dia)}`}>
      {pct>=0?'+':''}{pct}%
    </span>
  )
}

// ─── Tier × ランク分布マトリクス ─────────────────────────────
function TierRankMatrix({ livers }: { livers: Liver[] }) {
  const tiers = ['T1','T2','T3']
  const matrix: Record<string,Record<string,number>> = {}
  tiers.forEach(t => { matrix[t]={}; RANK_BANDS.forEach(b => { matrix[t][b.key]=0 }) })
  livers.forEach(l => {
    const b = getRankBand(l.rank)
    if (b && matrix[l.tier]) matrix[l.tier][b.key]++
  })
  const t1All = livers.filter(l => l.tier==='T1')
  const t1S   = matrix['T1']['S']||0
  const sRatio = t1All.length>0 ? Math.round(t1S/t1All.length*100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-700">Tier × ランク分布</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">T1内Sランク比率</span>
          <span className="font-bold text-red-700 text-lg leading-none">{sRatio}%</span>
          <span className="text-gray-400">({t1S}/{t1All.length}人)</span>
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="w-10 bg-gray-50 px-2 py-1.5 text-left text-gray-400 border border-gray-100 font-normal">Tier</th>
            {RANK_BANDS.map(b => (
              <th key={b.key} className="px-3 py-1.5 text-center font-bold border border-gray-100"
                style={{color:b.color, backgroundColor:`${b.color}15`}}>{b.label}</th>
            ))}
            <th className="px-2 py-1.5 text-center text-gray-400 border border-gray-100 font-normal">計</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map(t => {
            const total = livers.filter(l => l.tier===t).length
            return (
              <tr key={t} className={t==='T1'?'bg-blue-50':t==='T2'?'bg-green-50':''}>
                <td className="px-2 py-1.5 border border-gray-100">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${TIER_STYLE[t]}`}>{t}</span>
                </td>
                {RANK_BANDS.map(b => (
                  <td key={b.key} className="px-3 py-1.5 text-center font-mono border border-gray-100">
                    {matrix[t][b.key]>0
                      ? <span className="font-semibold" style={{color:b.color}}>{matrix[t][b.key]}</span>
                      : <span className="text-gray-200">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-bold text-gray-600 border border-gray-100">{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── 上位T1フォーカス ─────────────────────────────────────────
function TopT1Focus({ livers, latestMonth }: { livers: Liver[]; latestMonth: string }) {
  const t1 = livers.filter(l => l.tier==='T1')
  const top = t1.slice(0, Math.max(5, Math.ceil(t1.length*0.2)))
  if (!top.length) return null
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <h2 className="text-sm font-bold text-gray-700 mb-3">上位T1フォーカス（上位20% / {top.length}人）</h2>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {top.map(l => {
          const band = getRankBand(l.rank)
          const d = l.dia3m||[0,0,l.dia]
          const drop3 = d[0]>0&&d[1]>0&&d[2]>0&&d[0]>d[1]&&d[1]>d[2]
          const drop2 = !drop3&&d[1]>0&&d[2]>0&&d[1]>d[2]
          const cur = RANK_ORD[l.rank]??-1, prv = RANK_ORD[l.prevRank]??-1
          const rankUp = cur>prv && prv>=0, rankDn = cur<prv && prv>=0
          const diff = monthDiff(l.debutMonth, latestMonth)
          const isBanai = diff>=1 && diff<=2
          return (
            <div key={l.uid} className={`flex-shrink-0 w-36 border rounded-lg p-2.5
              ${drop3?'border-red-200 bg-red-50':drop2?'border-yellow-200 bg-yellow-50':'border-gray-100 bg-gray-50'}`}>
              <div className="text-xs font-bold text-gray-800 truncate mb-1" title={l.name}>
                {isBanai&&<span className="mr-0.5">🎌</span>}{l.name}
              </div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-bold" style={{color:band?.color}}>{l.rank}</span>
                {rankUp&&<span className="text-xs text-green-500">↑</span>}
                {rankDn&&<span className="text-xs text-red-400">↓</span>}
                {drop3&&<span className="text-xs">🔴</span>}
                {drop2&&<span className="text-xs">🟡</span>}
              </div>
              <div className="text-xs text-gray-500 font-mono mb-1.5">{fmt(l.dia)}</div>
              <Sparkline values={d} color={band?.color||'#888'}/>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function LiversPage() {
  const [data, setData]         = useState<ApiData|null>(null)
  const [loading, setLoading]   = useState(true)
  const [month, setMonth]       = useState('')
  const [search, setSearch]     = useState('')
  const [tier, setTier]         = useState('ALL')
  const [rankBand, setRankBand] = useState('ALL')
  const [alertOnly, setAlertOnly] = useState(false)

  useEffect(() => {
    const url = month ? `/api/data?action=livers&month=${month}` : '/api/data?action=livers'
    setLoading(true)
    fetch(url).then(r=>r.json()).then(j => {
      if (j.status==='ok') setData(j.data.livers)
      setLoading(false)
    }).catch(()=>setLoading(false))
  }, [month])

  const allLivers = useMemo(()=>data?.livers||[], [data])

  const livers = useMemo(()=>allLivers.filter(l => {
    if (tier!=='ALL' && l.tier!==tier) return false
    if (rankBand!=='ALL') {
      const b = getRankBand(l.rank)
      if (!b||b.key!==rankBand) return false
    }
    if (search && !l.name.includes(search) && !l.uid.includes(search) && !l.office.includes(search)) return false
    if (alertOnly) {
      const d = l.dia3m||[0,0,0]
      if (!(d[1]>0&&d[2]>0&&d[1]>d[2])) return false
    }
    return true
  }), [allLivers, tier, rankBand, search, alertOnly])

  const latestMonth = data?.latestMonth||''

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar/>
      <main className="ml-56 flex-1 p-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">ライバー管理</h1>
          <p className="text-sm text-gray-400 mt-1">最新月: {latestMonth||'—'} ／ {livers.length} 人表示中</p>
        </div>

        {/* フィルターバー */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={month} onChange={e=>setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0]">
            <option value="">最新月</option>
            {(data?.months||[]).slice().reverse().map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={tier} onChange={e=>setTier(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0]">
            <option value="ALL">全Tier</option>
            <option value="T1">T1（3万+）</option>
            <option value="T2">T2（1〜3万）</option>
            <option value="T3">T3（1万未満）</option>
          </select>
          <select value={rankBand} onChange={e=>setRankBand(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0]">
            <option value="ALL">全ランク帯</option>
            {RANK_BANDS.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <input type="text" placeholder="名前 / UID / 事務所 で検索" value={search}
            onChange={e=>setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1565c0] w-60"/>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={alertOnly} onChange={e=>setAlertOnly(e.target.checked)}
              className="rounded"/>
            🟡🔴 アラートのみ
          </label>
        </div>

        {/* Tier×ランク分布マトリクス */}
        {!loading && allLivers.length>0 && <TierRankMatrix livers={allLivers}/>}

        {/* 上位T1フォーカス */}
        {!loading && allLivers.length>0 && <TopT1Focus livers={allLivers} latestMonth={latestMonth}/>}

        {/* テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : livers.length===0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1a1a2e] text-white text-xs">
                    <th className="px-3 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">アカウント名</th>
                    <th className="px-3 py-3 text-left font-medium">事務所</th>
                    <th className="px-3 py-3 text-center font-medium">Tier</th>
                    <th className="px-3 py-3 text-center font-medium">ランク</th>
                    <th className="px-3 py-3 text-right font-medium">応援ダイヤ</th>
                    <th className="px-3 py-3 text-center font-medium">ダイヤTrend</th>
                    <th className="px-3 py-3 text-center font-medium" title="総配信時間 直近3か月">配信hTrend</th>
                    <th className="px-3 py-3 text-center font-medium" title="前月の+1M予測 vs 今月実績">予測精度</th>
                    <th className="px-3 py-3 text-right font-medium">+1M予測</th>
                    <th className="px-3 py-3 text-right font-medium">+2M予測</th>
                    <th className="px-3 py-3 text-right font-medium">+3M予測</th>
                  </tr>
                </thead>
                <tbody>
                  {livers.map((l,i) => {
                    const band = getRankBand(l.rank)
                    const d = l.dia3m||[0,0,l.dia]
                    const h = l.hours3m||[0,0,0]
                    const drop3 = d[0]>0&&d[1]>0&&d[2]>0&&d[0]>d[1]&&d[1]>d[2]
                    const diff = monthDiff(l.debutMonth, latestMonth)
                    const isBanai = diff>=1&&diff<=2
                    const rowBg = drop3?'bg-red-50':i%2===0?'bg-white':'bg-gray-50'
                    return (
                      <tr key={l.uid} className={`${rowBg} border-b border-gray-50 hover:bg-blue-50 transition-colors`}>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{i+1}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {isBanai&&<span title={`デビュー${diff}か月目・バナイベ候補`} className="mr-1">🎌</span>}
                          {l.name||l.uid}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{l.office}</td>
                        <td className="px-3 py-2.5 text-center"><TierCell tier={l.tier} prevTier={l.prevTier}/></td>
                        <td className="px-3 py-2.5 text-center"><RankCell rank={l.rank} prevRank={l.prevRank}/></td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-900 whitespace-nowrap">
                          {fmt(l.dia)}<DiaAlert d={d}/>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Sparkline values={d} color={band?.color||'#888'}/>
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <Sparkline values={h} color="#90a4ae"/>
                          <HoursAlert h={h}/>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <AccuracyCell prevFc1={l.prevFc1} dia={l.dia}/>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-600">{fmt(l.fc1)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-500">{fmt(l.fc2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-400">{fmt(l.fc3)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
