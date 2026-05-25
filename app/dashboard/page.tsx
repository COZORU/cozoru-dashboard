import KPICard from '@/components/KPICard'
import Sidebar from '@/components/Sidebar'
import ChartSection from '@/components/ChartSection'

export const revalidate = 300 // 5分ISRキャッシュ

async function getData() {
  const url = process.env.GAS_API_URL
  if (!url || url.includes('placeholder')) return null
  try {
    const res = await fetch(`${url}?action=summary`, { next: { revalidate: 300 } })
    const json = await res.json()
    return json.status === 'ok' ? json.data.summary : null
  } catch { return null }
}

function fmtYen(v: number) {
  return v >= 10000 ? `¥${Math.round(v / 10000).toLocaleString()}万` : `¥${v.toLocaleString()}`
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

type CpnKey = 'cpnC5' | 'cpnB2' | 'cpnA' | 'cpnS' | 'cpnOther'

const OFFICES = ['全社合計', 'cozoru:全社', 'ライブナウV', 'Tolance:全社']

type TrendItem = { month: string; revTaxIn: number; dia: number; active: number; debut: number }

const CPN_ITEMS: { label: string; key: CpnKey; color: string }[] = [
  { label: 'C5（30日50h）',   key: 'cpnC5',    color: '#c62828' },
  { label: 'B2（デビューCPN）', key: 'cpnB2',  color: '#1565c0' },
  { label: 'A（A1到達）',     key: 'cpnA',     color: '#e65100' },
  { label: 'S（S1到達）',     key: 'cpnS',     color: '#6a1b9a' },
  { label: 'その他',           key: 'cpnOther', color: '#546e7a' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-6 first:mt-0">
      {children}
    </p>
  )
}

export default async function DashboardPage() {
  const d = await getData()
  const cur = (d?.current || {}) as SectionSnap
  const trend: TrendItem[] = d?.trend || []
  const off: Record<string, SectionSnap> = d?.officeSummary || {}
  const cpnTotal = (cur.cpnC5||0)+(cur.cpnB2||0)+(cur.cpnA||0)+(cur.cpnS||0)+(cur.cpnOther||0)

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
        {/* ページヘッダー */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-400 mt-1">最新月: {d?.latestMonth || '—'}</p>
        </div>

        {/* 売上 KPI */}
        <SectionLabel>売上</SectionLabel>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <KPICard title="売上（税込）"     value={cur.revTaxIn ? fmtYen(cur.revTaxIn) : '—'} pct={d?.pctRevenue} color="#1565c0" />
          <KPICard title="売上（税抜）"     value={cur.revTaxEx ? fmtYen(cur.revTaxEx) : '—'} color="#1976d2" />
          <KPICard title="投げ銭報酬（MF）" value={cur.mf ? fmtYen(cur.mf) : '—'} color="#0097a7" />
          <KPICard title="CPN報酬合計"     value={cpnTotal ? fmtYen(cpnTotal) : '—'} color="#00695c" />
        </div>

        {/* ライバー KPI */}
        <SectionLabel>ライバー</SectionLabel>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <KPICard title="応援ダイヤ"   value={cur.dia ? `${fmtDia(cur.dia)} dia` : '—'} pct={d?.pctDia} color="#43a047" />
          <KPICard title="レベシェ"     value={cur.leveshe ? fmtYen(cur.leveshe) : '—'} color="#ef6c00" />
          <KPICard title="今月デビュー数" value={cur.debut !== undefined ? `${cur.debut} 人` : '—'} pct={d?.pctDebut} color="#7b1fa2" />
          <KPICard title="C5達成数"     value={cur.c5Count !== undefined ? `${cur.c5Count} 人` : '—'} color="#c62828" sub="翌月CSV取込後に確定" />
        </div>

        {/* CPN内訳 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-5 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">CPN報酬内訳（{d?.latestMonth}・全社）</h2>
          <div className="grid grid-cols-5 gap-3">
            {CPN_ITEMS.map(({ label, key, color }) => (
              <div key={key} className="bg-gray-50 rounded-lg p-3 border-l-[3px]" style={{ borderLeftColor: color }}>
                <div className="text-xs text-gray-500 mb-1.5">{label}</div>
                <div className="text-base font-bold text-gray-900">{cur[key] ? fmtYen(cur[key]) : '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ライバー基盤 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">ライバー基盤</h2>
          <div className="grid grid-cols-6 gap-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">登録ライバー数</div>
              <div className="text-xl font-bold text-gray-900">{cur.registered ?? '—'} 人</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">アクティブ</div>
              <div className="text-xl font-bold text-gray-900">{cur.active ?? '—'} 人</div>
            </div>
            {[
              { label: 'T1（3万+）',   key: 't1', color: 'bg-blue-100 text-blue-800' },
              { label: 'T2（1万〜3万）', key: 't2', color: 'bg-green-100 text-green-800' },
              { label: 'T3（1万未満）', key: 't3', color: 'bg-gray-100 text-gray-700' },
            ].map(({ label, key, color }) => (
              <div key={key} className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-xl font-bold inline-block px-2 py-0.5 rounded ${color}`}>
                  {(cur as Record<string, number>)[key] ?? '—'} 人
                </div>
              </div>
            ))}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">デビュー数</div>
              <div className="text-xl font-bold text-purple-700">{cur.debut ?? '—'} 人</div>
            </div>
          </div>
        </div>

        {/* 事務所別サマリ */}
        {Object.keys(off).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8 overflow-x-auto">
            <div className="bg-slate-100 px-5 py-3 border-b border-slate-200">
              <h2 className="text-slate-700 font-bold text-sm">事務所別サマリ（{d?.latestMonth}）</h2>
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

        {/* トレンド＆予測チャート */}
        {trend.length > 0 && (
          <div className="mb-6">
            <SectionLabel>トレンド ＆ 3ヶ月予測</SectionLabel>
            <ChartSection
              revActual={revActual} revForecast={revForecast}
              diaActual={diaActual} diaForecast={diaForecast}
              actActual={actActual} actForecast={actForecast}
              debActual={debActual} debForecast={debForecast}
            />
          </div>
        )}

        {/* 予測値の読み方 */}
        <details className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 group">
          <summary className="px-5 py-3.5 text-sm font-semibold text-gray-500 cursor-pointer flex items-center gap-2 select-none list-none hover:text-gray-700 transition-colors">
            <span className="text-base">📖</span>
            予測値の読み方
            <span className="ml-auto text-gray-300 text-xs group-open:hidden">▼ 開く</span>
            <span className="ml-auto text-gray-300 text-xs hidden group-open:inline">▲ 閉じる</span>
          </summary>
          <div className="px-5 pb-5 border-t border-gray-50">
            <div className="grid grid-cols-3 gap-5 mt-4">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">📈</span>
                  <span className="text-xs font-bold text-gray-700">ダイヤ予測（+1M/+2M/+3M）</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  毎月のダイヤの増え方・減り方のペースをそのまま未来に伸ばした数字です。
                </p>
                <div className="mt-2 bg-gray-50 rounded-lg p-2.5 text-xs text-gray-500 leading-relaxed">
                  例）1月 100 → 2月 130 → 3月 160<br/>
                  毎月+30のペース → 4月は <span className="font-bold text-gray-700">190 dia</span> と予測
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">📊</span>
                  <span className="text-xs font-bold text-gray-700">売上予測（チャートの点線）</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  ① 直近3か月の平均売上をベースにする<br/>
                  ② 各事務所の成長判定（◎/○/✖）×ダイヤ量で補正する
                </p>
                <div className="mt-2 bg-gray-50 rounded-lg p-2.5 text-xs text-gray-500 leading-relaxed">
                  ◎が多い月 → 予測が上ぶれ<br/>
                  ✖が多い月 → 予測が下ぶれ<br/>
                  <span className="text-gray-400">「平均 ＋ 成長の勢い」で算出</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">🎯</span>
                  <span className="text-xs font-bold text-gray-700">予測精度（ライバー管理）</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  「先月の予測」と「今月の実績」を比べた誤差率です。
                </p>
                <div className="mt-2 bg-gray-50 rounded-lg p-2.5 text-xs leading-relaxed space-y-1">
                  <div><span className="font-bold text-emerald-600">+20%</span> <span className="text-gray-500">→ 予測より2割多く稼いだ</span></div>
                  <div><span className="font-bold text-red-500">−15%</span> <span className="text-gray-500">→ 思ったより1.5割少なかった</span></div>
                </div>
              </div>
            </div>
          </div>
        </details>

        {!d && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
            GAS_API_URL が未設定です。GAS をデプロイ後に Vercel 環境変数を設定してください。
          </div>
        )}
      </main>
    </div>
  )
}
