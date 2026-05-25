import KPICard from '@/components/KPICard'
import TrendForecastChart from '@/components/TrendForecastChart'
import Sidebar from '@/components/Sidebar'

async function getData() {
  const url = process.env.GAS_API_URL
  if (!url || url.includes('placeholder')) return null
  try {
    const res = await fetch(`${url}?action=summary`, { cache: 'no-store' })
    const json = await res.json()
    return json.status === 'ok' ? json.data.summary : null
  } catch { return null }
}

function fmtYen(v: number) {
  return v >= 1_000_000 ? `¥${(v / 1_000_000).toFixed(2)}M` : `¥${v.toLocaleString()}`
}
function fmtDia(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
}

type SectionSnap = {
  revTaxIn: number; revTaxEx: number; dia: number; mf: number
  cpnC5: number; cpnB2: number; cpnA: number; cpnS: number; cpnOther: number
  leveshe: number; registered: number; active: number
  t1: number; t2: number; t3: number; debut: number; c5Count: number
}

const OFFICES = ['全社合計', 'cozoru:全社', 'ライブナウV', 'Tolance:全社']

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

export default async function DashboardPage() {
  const d = await getData()
  const cur = (d?.current || {}) as SectionSnap
  const trend: TrendItem[] = d?.trend || []
  const off: Record<string, SectionSnap> = d?.officeSummary || {}
  const cpnTotal = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)

  // 各指標の actual（実績）と forecast（スプシ計算値）
  const revActual   = trend.map(t => ({ month: t.month, value: t.revTaxIn }))
  const revForecast = (d?.revForecast    || []).map((f: {month:string;revTaxIn:number}) => ({ month: f.month, value: f.revTaxIn }))
  const diaActual   = trend.map(t => ({ month: t.month, value: t.dia }))
  const diaForecast = (d?.diaForecast    || []).map((f: {month:string;dia:number})      => ({ month: f.month, value: f.dia }))
  const actActual   = trend.map(t => ({ month: t.month, value: t.active }))
  const actForecast = (d?.activeForecast || []).map((f: {month:string;active:number})   => ({ month: f.month, value: f.active }))
  const debActual   = trend.map(t => ({ month: t.month, value: t.debut }))
  const debForecast = (d?.debutForecast  || []).map((f: {month:string;debut:number})    => ({ month: f.month, value: f.debut }))

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-400 mt-1">最新月: {d?.latestMonth || '—'}</p>
        </div>

        {/* 売上 KPI */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <KPICard title="売上（税込）" value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'} pct={d?.pctRevenue} color="#1565c0" />
          <KPICard title="売上（税抜）" value={cur.revTaxEx ? fmtYen(cur.revTaxEx) : '—'} color="#1976d2" />
          <KPICard title="投げ銭報酬（MF）" value={cur.mf ? fmtYen(cur.mf) : '—'} color="#0097a7" />
          <KPICard title="CPN報酬合計" value={cpnTotal ? fmtYen(cpnTotal) : '—'} color="#00695c" />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <KPICard title="応援ダイヤ" value={cur.dia ? `${fmtDia(cur.dia)} dia` : '—'} pct={d?.pctDia} color="#43a047" />
          <KPICard title="レベシェ" value={cur.leveshe ? fmtYen(cur.leveshe) : '—'} color="#ef6c00" />
          <KPICard title="今月デビュー数" value={cur.debut !== undefined ? `${cur.debut} 人` : '—'} pct={d?.pctDebut} color="#7b1fa2" />
          <KPICard title="C5達成数" value={cur.c5Count !== undefined ? `${cur.c5Count} 人` : '—'} color="#c62828" />
        </div>

        {/* CPN内訳 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">CPN報酬内訳（{d?.latestMonth}・全社）</h2>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'C5（30日50h）', val: cur.cpnC5 },
              { label: 'B2（デビューCPN）', val: cur.cpnB2 },
              { label: 'A（A1到達）', val: cur.cpnA },
              { label: 'S（S1到達）', val: cur.cpnS },
              { label: 'その他', val: cur.cpnOther },
            ].map(({ label, val }) => (
              <div key={label} className="text-center bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className="text-base font-bold text-gray-900">{val ? fmtYen(val) : '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier & ライバー基盤 */}
        <div className="grid grid-cols-6 gap-3 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">登録ライバー数</div>
            <div className="text-xl font-bold text-gray-900">{cur.registered ?? '—'} 人</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">アクティブ</div>
            <div className="text-xl font-bold text-gray-900">{cur.active ?? '—'} 人</div>
          </div>
          {[
            { label: 'T1（3万+）', key: 't1', color: 'bg-blue-100 text-blue-800' },
            { label: 'T2（1万〜3万）', key: 't2', color: 'bg-green-100 text-green-800' },
            { label: 'T3（1万未満）', key: 't3', color: 'bg-gray-100 text-gray-700' },
          ].map(({ label, key, color }) => (
            <div key={key} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-xl font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                {(cur as Record<string, number>)[key] ?? '—'} 人
              </div>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">デビュー数</div>
            <div className="text-xl font-bold text-purple-700">{cur.debut ?? '—'} 人</div>
          </div>
        </div>

        {/* 事務所別サマリ */}
        {Object.keys(off).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 overflow-x-auto">
            <div className="bg-[#1a1a2e] px-5 py-3">
              <h2 className="text-white font-bold text-sm">事務所別サマリ（{d?.latestMonth}）</h2>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2 text-left font-medium w-32">事務所</th>
                  <th className="px-3 py-2 text-right font-medium">売上（税込）</th>
                  <th className="px-3 py-2 text-right font-medium">売上（税抜）</th>
                  <th className="px-3 py-2 text-right font-medium">応援ダイヤ</th>
                  <th className="px-3 py-2 text-right font-medium">投げ銭MF</th>
                  <th className="px-3 py-2 text-right font-medium">C5</th>
                  <th className="px-3 py-2 text-right font-medium">B2</th>
                  <th className="px-3 py-2 text-right font-medium">A</th>
                  <th className="px-3 py-2 text-right font-medium">S</th>
                  <th className="px-3 py-2 text-right font-medium">レベシェ</th>
                  <th className="px-3 py-2 text-right font-medium">登録</th>
                  <th className="px-3 py-2 text-right font-medium">Act</th>
                  <th className="px-3 py-2 text-right font-medium">T1</th>
                  <th className="px-3 py-2 text-right font-medium">T2</th>
                  <th className="px-3 py-2 text-right font-medium">T3</th>
                  <th className="px-3 py-2 text-right font-medium">デビュー</th>
                  <th className="px-3 py-2 text-right font-medium">C5達成</th>
                </tr>
              </thead>
              <tbody>
                {OFFICES.map((office, i) => {
                  const s = off[office]
                  if (!s) return null
                  const isTotal = office === '全社合計'
                  const rowBg = isTotal ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  const textCls = isTotal ? 'text-blue-900 font-bold' : 'text-gray-900'
                  const numCls = isTotal ? 'text-blue-900 font-bold' : 'text-gray-700'
                  return (
                    <tr key={office} className={`${rowBg} border-b border-gray-50 ${isTotal ? 'border-t-2 border-blue-200' : ''}`}>
                      <td className={`px-4 py-2.5 ${textCls}`}>{office}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${numCls}`}>{fmtYen(s.revTaxIn)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtYen(s.revTaxEx)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtDia(s.dia)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtYen(s.mf)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{s.cpnC5 ? fmtYen(s.cpnC5) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{s.cpnB2 ? fmtYen(s.cpnB2) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{s.cpnA ? fmtYen(s.cpnA) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{s.cpnS ? fmtYen(s.cpnS) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtYen(s.leveshe)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{s.registered}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{s.active}</td>
                      <td className="px-3 py-2.5 text-right"><span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">{s.t1}</span></td>
                      <td className="px-3 py-2.5 text-right"><span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded">{s.t2}</span></td>
                      <td className="px-3 py-2.5 text-right"><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{s.t3}</span></td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{s.debut}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{s.c5Count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* トレンド＆予測チャート（全4指標・スプシ連動） */}
        {trend.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-700 mb-3">トレンド＆3ヶ月予測（スプシ連動）</h2>
            <div className="grid grid-cols-2 gap-4">
              {/* 売上（税込）実績＋予測 */}
              <TrendForecastChart
                title="売上（税込・全社）"
                color="#1565c0"
                actual={revActual}
                forecast={revForecast}
                fmt={v => v >= 1_000_000 ? `¥${(v/1_000_000).toFixed(1)}M` : `¥${v.toLocaleString()}`}
                height={200}
              />

              {/* 応援ダイヤ 実績＋予測 */}
              <TrendForecastChart
                title="応援ダイヤ（全社）"
                color="#43a047"
                actual={diaActual}
                forecast={diaForecast}
                fmt={v => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v.toLocaleString()}
                height={200}
              />

              {/* アクティブ数 実績＋予測 */}
              {actActual.length > 0 && (
                <TrendForecastChart
                  title="アクティブライバー数（全社）"
                  color="#0097a7"
                  actual={actActual}
                  forecast={actForecast}
                  fmt={v => `${v} 人`}
                  height={200}
                />
              )}

              {/* デビュー数 実績＋予測 */}
              {debActual.length > 0 && (
                <TrendForecastChart
                  title="デビュー数（全社）"
                  color="#7b1fa2"
                  actual={debActual}
                  forecast={debForecast}
                  fmt={v => `${v} 人`}
                  height={200}
                />
              )}
            </div>
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
