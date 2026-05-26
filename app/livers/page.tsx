'use client'
import { useEffect, useState, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import ChartSection from '@/components/ChartSection'
import { type SummaryData, LiverSection } from '@/components/FinanceDashboardClient'

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
  if (valid.length < 2) return <span className="text-gray-300 text-xs">—</span>
  const max = Math.max(...values), min = Math.min(...values)
  const range = max - min || 1
  const W = 40, H = 16
  const pts = values.map((v,i) =>
    `${(i/(values.length-1))*W},${H-((v-min)/range)*(H-2)+1}`
  ).join(' ')
  return (
    <svg width={W} height={H+2} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"/>
      {values.map((v,i) => (
        <circle key={i} cx={(i/(values.length-1))*W} cy={H-((v-min)/range)*(H-2)+1} r="2" fill={color}/>
      ))}
    </svg>
  )
}

function DiaAlert({ d }: { d: number[] }) {
  const drop3 = d[0]>0 && d[1]>0 && d[2]>0 && d[0]>d[1] && d[1]>d[2]
  const drop2 = !drop3 && d[1]>0 && d[2]>0 && d[1]>d[2]
  if (drop3) return <span title="ダイヤ3か月連続下降" className="ml-1 text-xs">🔴</span>
  if (drop2) return <span title="ダイヤ直近2か月下降" className="ml-1 text-xs">🟡</span>
  return null
}

function RankCell({ rank, prevRank }: { rank: string; prevRank: string }) {
  if (!rank) return <span className="text-gray-400 text-xs">—</span>
  const band = getRankBand(rank)
  const cur = RANK_ORD[rank]??-1, prv = RANK_ORD[prevRank]??-1
  const changed = !!prevRank && prevRank !== rank && prv >= 0 && cur >= 0
  const up = changed && cur > prv
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="font-bold text-sm" style={{color: band?.color}}>{rank}</span>
      {changed && (
        <span className={`text-xs font-semibold ${up?'text-emerald-500':'text-red-400'}`}>{up?'↑':'↓'}</span>
      )}
    </span>
  )
}

function TierBadge({ tier, prevTier }: { tier: string; prevTier: string }) {
  const changed = !!prevTier && prevTier !== tier
  const up = changed && (TIER_N[tier]||3) < (TIER_N[prevTier]||3)
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-bold ${TIER_STYLE[tier]||TIER_STYLE.T3}`}>
      {tier}
      {changed && <span className={up?'text-emerald-600':'text-orange-600'}>{up?'↑':'↓'}</span>}
    </span>
  )
}

function AccuracyCell({ prevFc1, dia }: { prevFc1: number; dia: number }) {
  if (!prevFc1 || !dia) return <span className="text-gray-300 text-xs">—</span>
  const pct = Math.round((dia-prevFc1)/prevFc1*100)
  const cls = Math.abs(pct)<10
    ? 'text-gray-500'
    : pct>0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'
  return (
    <span className={`text-xs font-mono ${cls}`} title={`予測${fmt(prevFc1)} → 実績${fmt(dia)}`}>
      {pct>=0?'+':''}{pct}%
    </span>
  )
}

// ─── Tier × ランク分布（横棒グラフ形式） ──────────────────────
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Tier × ランク分布</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Tier=月間応援ダイヤ量（売上貢献度）、ランク=配信実力・知名度。
            T1内のS/A帯比率が高いほど収益の質が高く、T2のA/B帯が厚いほど次世代T1の育成パイプラインが健全。
          </p>
        </div>
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-1.5">
          <span className="text-xs text-gray-500">T1内Sランク比率</span>
          <span className="text-xl font-bold text-red-700 leading-none">{sRatio}%</span>
          <span className="text-xs text-gray-400">({t1S}/{t1All.length}人)</span>
        </div>
      </div>
      <div className="space-y-3">
        {tiers.map(t => {
          const total = livers.filter(l => l.tier===t).length
          if (!total) return null
          return (
            <div key={t} className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-1 rounded w-10 text-center flex-shrink-0 ${TIER_STYLE[t]}`}>{t}</span>
              <div className="flex-1 flex h-8 rounded-lg overflow-hidden gap-px bg-gray-100">
                {RANK_BANDS.map(b => {
                  const cnt = matrix[t][b.key]||0
                  if (!cnt) return null
                  const pct = (cnt/total)*100
                  return (
                    <div key={b.key}
                      style={{width:`${pct}%`, backgroundColor:`${b.color}1a`, borderBottom:`3px solid ${b.color}`}}
                      className="flex items-center justify-center min-w-[28px]">
                      <span className="text-xs font-bold leading-none" style={{color:b.color}}>{cnt}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 min-w-[180px]">
                {RANK_BANDS.map(b => {
                  const cnt = matrix[t][b.key]||0
                  if (!cnt) return null
                  return (
                    <span key={b.key} className="text-xs whitespace-nowrap" style={{color:b.color}}>
                      {b.label}&nbsp;{cnt}
                    </span>
                  )
                })}
                <span className="text-xs font-semibold text-gray-500 ml-auto">計 {total}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tier別上位フォーカス ────────────────────────────────────
const TIER_META = [
  { tier:'T1', label:'T1（3万+）',   desc:'売上の大部分を占める最重要層。離脱・ダイヤ減少が全社売上に直結。', badge:'bg-blue-100 text-blue-800' },
  { tier:'T2', label:'T2（1〜3万）', desc:'次世代T1候補。ランク上昇・ダイヤ増加のトレンドが昇格の先行指標。',  badge:'bg-green-100 text-green-800' },
  { tier:'T3', label:'T3（1万未満）',desc:'育成・観察層。上位20%はT2昇格の有力候補。',                      badge:'bg-gray-100 text-gray-700' },
]

function TopTierFocus({ livers, latestMonth }: { livers: Liver[]; latestMonth: string }) {
  const hasAny = TIER_META.some(m => livers.some(l => l.tier===m.tier))
  if (!hasAny) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-gray-800">各Tier 上位フォーカス</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          各Tierのダイヤ上位20%（最低5人）。🔴=3か月連続下降（即対応）、🟡=直近2か月下降（要注視）。
        </p>
      </div>
      <div className="space-y-6">
        {TIER_META.map(({ tier, label, desc, badge }) => {
          const tierLivers = livers.filter(l => l.tier===tier)
          const top = tierLivers.slice(0, Math.max(5, Math.ceil(tierLivers.length*0.2)))
          if (!top.length) return null
          return (
            <div key={tier}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge}`}>{label}</span>
                <span className="text-xs text-gray-400">上位20% / {top.length}人</span>
                <span className="text-xs text-gray-400 hidden sm:inline">— {desc}</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {top.map(l => {
                  const band = getRankBand(l.rank)
                  const d = l.dia3m||[0,0,l.dia]
                  const drop3 = d[0]>0&&d[1]>0&&d[2]>0&&d[0]>d[1]&&d[1]>d[2]
                  const drop2 = !drop3&&d[1]>0&&d[2]>0&&d[1]>d[2]
                  const cur = RANK_ORD[l.rank]??-1, prv = RANK_ORD[l.prevRank]??-1
                  const rankUp = cur>prv && prv>=0, rankDn = cur<prv && prv>=0
                  const diff = monthDiff(l.debutMonth, latestMonth)
                  const isBanai = diff>=1 && diff<=2
                  const cardBorder = drop3 ? 'border-red-200' : drop2 ? 'border-amber-200' : 'border-gray-100'
                  const cardBg    = drop3 ? 'bg-red-50'    : drop2 ? 'bg-amber-50'    : 'bg-gray-50'
                  return (
                    <div key={l.uid} className={`w-36 border ${cardBorder} ${cardBg} rounded-xl p-3`}>
                      <div className="text-xs font-semibold text-gray-800 truncate mb-1.5" title={l.name}>
                        {isBanai&&<span className="mr-0.5">🎌</span>}{l.name}
                      </div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold" style={{color:band?.color}}>{l.rank}</span>
                          {rankUp&&<span className="text-[10px] text-emerald-500">↑</span>}
                          {rankDn&&<span className="text-[10px] text-red-400">↓</span>}
                        </div>
                        <span className="text-[10px] text-gray-400">{drop3?'🔴':drop2?'🟡':''}</span>
                      </div>
                      <div className="text-xs text-gray-600 font-mono mb-2">{fmt(l.dia)}</div>
                      <Sparkline values={d} color={band?.color||'#888'}/>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function LiversPage() {
  const [data, setData]           = useState<ApiData|null>(null)
  const [loading, setLoading]     = useState(true)
  const [month, setMonth]         = useState('')
  const [search, setSearch]       = useState('')
  const [tier, setTier]           = useState('ALL')
  const [rankBand, setRankBand]   = useState('ALL')
  const [alertOnly, setAlertOnly] = useState(false)
  const [chartData, setChartData] = useState<SummaryData|null>(null)

  useEffect(() => {
    const url = month ? `/api/data?action=livers&month=${month}` : '/api/data?action=livers'
    setLoading(true)
    fetch(url).then(r=>r.json()).then(j => {
      if (j.status==='ok') setData(j.data.livers)
      setLoading(false)
    }).catch(()=>setLoading(false))
  }, [month])

  // グラフ用データを取得
  useEffect(() => {
    fetch('/api/data?action=summary')
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok' && j.data?.summary) {
          setChartData(j.data.summary)
        }
      })
      .catch(() => {})
  }, [])

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
        {/* ページヘッダー */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">ライバー管理</h1>
          <p className="text-sm text-gray-400 mt-1">最新月: {latestMonth||'—'} ／ {livers.length} 人表示中</p>
        </div>

        {/* グラフセクション */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">トレンド ＆ 3ヶ月予測</p>
          {chartData ? (
            <ChartSection
              diaActual={(chartData.trend || []).map(t => ({ month: t.month, value: t.dia }))}
              diaForecast={(chartData.diaForecast || []).map(f => ({ month: f.month, value: f.dia }))}
              actActual={(chartData.trend || []).map(t => ({ month: t.month, value: t.active }))}
              actForecast={(chartData.activeForecast || []).map(f => ({ month: f.month, value: f.active }))}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[1,2].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-[240px] flex items-center justify-center">
                  <div className="flex items-center gap-2 text-gray-300 text-xs">
                    <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    グラフ読み込み中…
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ライバー基盤セクション（旧財務管理から移動） */}
        {chartData && (
          <div className="mb-8">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">ライバー基盤</p>
            <LiverSection
              cur={chartData.current}
              off={chartData.officeSummary}
              allOffices={Object.keys(chartData.officeSummary || {})}
              pctDia={chartData.pctDia}
              pctLeveshe={chartData.pctLeveshe}
              pctDebut={chartData.pctDebut}
              isGlobal={true}
              isLatestMonth={true}
            />
          </div>
        )}

        {/* フィルターバー */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={month} onChange={e=>setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="">最新月</option>
            {(data?.months||[]).slice().reverse().map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={tier} onChange={e=>setTier(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="ALL">全Tier</option>
            <option value="T1">T1（3万+）</option>
            <option value="T2">T2（1〜3万）</option>
            <option value="T3">T3（1万未満）</option>
          </select>
          <select value={rankBand} onChange={e=>setRankBand(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="ALL">全ランク帯</option>
            {RANK_BANDS.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <input type="text" placeholder="名前・UID・事務所" value={search}
            onChange={e=>setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 w-44"/>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={alertOnly} onChange={e=>setAlertOnly(e.target.checked)} className="rounded"/>
            アラートのみ
          </label>
        </div>

        {/* Tier × ランク分布 */}
        {!loading && allLivers.length>0 && <TierRankMatrix livers={allLivers}/>}

        {/* 上位T1フォーカス */}
        {!loading && allLivers.length>0 && <TopTierFocus livers={allLivers} latestMonth={latestMonth}/>}

        {/* 予測・予測精度の補足 */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 py-3 mb-3 text-xs text-gray-500 leading-relaxed">
          <span className="font-semibold text-gray-700">予測値・予測精度について</span>
          <span className="mx-2 text-gray-200">|</span>
          <span className="font-semibold text-gray-600">+1M/+2M/+3M予測</span>：直近3か月のダイヤ増加率の平均をもとに算出。
          <span className="mx-2 text-gray-200">|</span>
          <span className="font-semibold text-gray-600">予測精度</span>：先月時点の+1M予測 vs 今月実績の差。
          <span className="ml-1 text-emerald-600 font-semibold">+</span>なら上振れ、
          <span className="text-red-500 font-semibold">−</span>なら下振れ。
        </div>

        {/* メインテーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : livers.length===0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">データがありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">アカウント名</th>
                  <th className="px-3 py-3 text-left font-semibold">事務所</th>
                  <th className="px-3 py-3 text-center font-semibold">Tier / ランク</th>
                  <th className="px-3 py-3 text-right font-semibold">応援ダイヤ</th>
                  <th className="px-3 py-3 text-center font-semibold">3Mトレンド</th>
                  <th className="px-3 py-3 text-center font-semibold">予測精度</th>
                  <th className="px-3 py-3 text-right font-semibold">+1M予測</th>
                  <th className="px-3 py-3 text-right font-semibold">+2M / +3M</th>
                </tr>
              </thead>
              <tbody>
                {livers.map((l,i) => {
                  const band = getRankBand(l.rank)
                  const d = l.dia3m||[0,0,l.dia]
                  const drop3 = d[0]>0&&d[1]>0&&d[2]>0&&d[0]>d[1]&&d[1]>d[2]
                  const drop2 = !drop3&&d[1]>0&&d[2]>0&&d[1]>d[2]
                  const diff = monthDiff(l.debutMonth, latestMonth)
                  const isBanai = diff>=1&&diff<=2
                  const rowBg = drop3 ? 'bg-red-50' : drop2 ? 'bg-amber-50' : i%2===0 ? 'bg-white' : 'bg-slate-50'
                  return (
                    <tr key={l.uid} className={`${rowBg} border-b border-gray-100 hover:bg-blue-50 transition-colors`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[170px]">
                        <div className="flex items-center gap-1 min-w-0">
                          {isBanai&&<span title={`デビュー${diff}か月目・バナイベ候補`} className="flex-shrink-0 text-sm">🎌</span>}
                          <span className="truncate">{l.name||l.uid}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">{l.office}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <TierBadge tier={l.tier} prevTier={l.prevTier}/>
                          <RankCell rank={l.rank} prevRank={l.prevRank}/>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-mono text-gray-900">{fmt(l.dia)}</span>
                        <DiaAlert d={d}/>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Sparkline values={d} color={band?.color||'#888'}/>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <AccuracyCell prevFc1={l.prevFc1} dia={l.dia}/>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-mono font-semibold text-blue-700">{fmt(l.fc1)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-blue-500 text-xs">{fmt(l.fc2)}</span>
                          <span className="font-mono text-blue-400 text-[11px]">{fmt(l.fc3)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
