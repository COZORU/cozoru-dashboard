import KPICard from '@/components/KPICard'
import Sidebar from '@/components/Sidebar'
import ChartSection from '@/components/ChartSection'

export const revalidate = 300

async function getData() {
  const url = process.env.GAS_API_URL
  if (!url || url.includes('placeholder')) return null
  try {
    const res = await fetch(`${url}?action=fullpl`, { next: { revalidate: 300 } })
    const json = await res.json()
    return json.status === 'ok' ? json.data.fullpl : null
  } catch { return null }
}

function fmtYen(v: number) {
  return v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`
}
function fmtDia(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

type Snap = {
  revTaxIn: number; revTaxEx: number; dia: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number; registered: number; active: number
  t1: number; t2: number; t3: number; debut: number
}

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-6 first:mt-0">
      {children}
    </p>
  )
}

export default async function TotalDashboardPage() {
  const d = await getData()
  const cur = (d?.current || {}) as Snap
  const trend: TrendItem[] = d?.trend || []
  const cpnTotal = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)

  const revActual   = trend.map(t => ({ month: t.month, value: t.revTaxIn }))
  const diaActual   = trend.map(t => ({ month: t.month, value: t.dia }))
  const actActual   = trend.map(t => ({ month: t.month, value: t.active }))
  const debActual   = trend.map(t => ({ month: t.month, value: t.debut }))

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">総ダッシュボード</h1>
          <p className="text-sm text-gray-400 mt-1">
            全社実績PL（PL(全社) ※最終調整）　最新月: {d?.latestMonth || '—'}
          </p>
        </div>

        {/* 売上 KPI */}
        <SectionLabel>売上</SectionLabel>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <KPICard title="売上（税込）"     value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'} pct={d?.pctRevenue} color="#1565c0" />
          <KPICard title="売上（税抜）"     value={cur.revTaxEx ? fmtYen(cur.revTaxEx) : '—'} color="#1976d2" />
          <KPICard title="投げ銭報酬（MF）" value={cur.mf ? fmtYen(cur.mf) : '—'} color="#0097a7" />
          <KPICard title="CPN報酬合計"      value={cpnTotal ? fmtYen(cpnTotal) : '—'} color="#00695c" />
        </div>

        {/* CPN内訳 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            CPN報酬内訳（{d?.latestMonth}・全社）
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {([
              { label: 'C5（30日50h）',    key: 'cpnC5',    color: '#c62828' },
              { label: 'B2（デビューCPN）', key: 'cpnB2',   color: '#1565c0' },
              { label: 'A（A1到達）',       key: 'cpnA',    color: '#e65100' },
              { label: 'S（S1到達）',       key: 'cpnS',    color: '#6a1b9a' },
              { label: 'その他',            key: 'cpnOther', color: '#546e7a' },
            ] as const).map(({ label, key, color }) => (
              <div key={key} className="bg-gray-50 rounded-lg p-3 border-l-[3px]" style={{ borderLeftColor: color }}>
                <div className="text-xs text-gray-500 mb-1.5">{label}</div>
                <div className="text-base font-bold text-gray-900">
                  {(cur as Record<string, number>)[key] ? fmtYen((cur as Record<string, number>)[key]) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ライバー KPI */}
        <SectionLabel>ライバー基盤</SectionLabel>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <KPICard title="応援ダイヤ"    value={cur.dia ? `${fmtDia(cur.dia)} dia` : '—'} pct={d?.pctDia} color="#43a047" />
          <KPICard title="レベシェ"      value={cur.leveshe ? fmtYen(cur.leveshe) : '—'} color="#ef6c00" />
          <KPICard title="今月デビュー数" value={cur.debut !== undefined ? `${cur.debut} 人` : '—'} pct={d?.pctDebut} color="#7b1fa2" />
          <KPICard title="アクティブ"    value={cur.active !== undefined ? `${cur.active} 人` : '—'} color="#1565c0" />
        </div>

        {/* ライバー基盤詳細 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Tier構成</h2>
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">登録数</div>
              <div className="text-xl font-bold text-gray-900">{cur.registered ?? '—'} 人</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">アクティブ</div>
              <div className="text-xl font-bold text-gray-900">{cur.active ?? '—'} 人</div>
            </div>
            {[
              { label: 'T1（3万+）',    key: 't1', color: 'bg-blue-100 text-blue-800' },
              { label: 'T2（1〜3万）', key: 't2', color: 'bg-green-100 text-green-800' },
              { label: 'T3（1万未満）', key: 't3', color: 'bg-gray-100 text-gray-700' },
            ].map(({ label, key, color }) => (
              <div key={key} className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-xl font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                  {(cur as Record<string, number>)[key] ?? '—'} 人
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* トレンドチャート */}
        {trend.length > 0 && (
          <div className="mb-6">
            <SectionLabel>月次トレンド</SectionLabel>
            <ChartSection
              revActual={revActual} revForecast={[]}
              diaActual={diaActual} diaForecast={[]}
              actActual={actActual} actForecast={[]}
              debActual={debActual} debForecast={[]}
            />
          </div>
        )}

        {!d && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
            GAS_API_URL が未設定です。GAS をデプロイ後に Vercel 環境変数を設定してください。
          </div>
        )}
      </main>
    </div>
  )
}
