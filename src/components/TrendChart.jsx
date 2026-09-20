import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtTwd } from '../calc'

const ACCENT = '#0FB5A3'

// 週一為一週的開始，日期字串一律當 UTC 處理（跟快照的 date 產生方式一致）
function weekStartKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const diffToMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return d.toISOString().slice(0, 10)
}

// 走勢圖改成一週更新一個點：同一週裡只留最新那一天的數字代表這週，
// 底層每天照樣記錄快照（細節都還在），只是圖表顯示聚合成週線，比較不雜亂
function toWeekly(data) {
  const buckets = new Map()
  for (const d of data) {
    const key = weekStartKey(d.date)
    const cur = buckets.get(key)
    if (!cur || d.date > cur.date) buckets.set(key, d)
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export default function TrendChart({ snapshots, metric }) {
  const daily = (snapshots || [])
    .map((s) => ({
      date: s.date,
      value: metric === 'asset' ? s.totalAssetTwd : s.netWorthTwd,
    }))
    .filter((d) => d.value != null)
  const data = toWeekly(daily)

  const mmdd = (d) => (d ? d.slice(5).replace('-', '/') : '')

  if (data.length < 2) {
    return (
      <div className="trend-empty">
        走勢圖以週為單位更新，多累積幾週就會長出曲線。
        {data.length === 1 ? '（目前有 1 週的記錄點）' : ''}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.26} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E4EBE9" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={mmdd}
          tick={{ fontSize: 11, fill: '#93A29C', fontFamily: 'DM Mono, monospace' }}
          axisLine={false}
          tickLine={false}
          minTickGap={26}
        />
        <YAxis width={0} tick={false} axisLine={false} domain={['auto', 'auto']} />
        <Tooltip
          formatter={(v) => [fmtTwd(v), metric === 'asset' ? '總資產' : '淨資產']}
          labelFormatter={mmdd}
          contentStyle={{
            borderRadius: 10, border: '1px solid #E4EBE9', fontFamily: 'Manrope, sans-serif',
            fontSize: 12, boxShadow: '0 8px 24px -12px rgba(16,60,50,0.3)',
          }}
        />
        <Area type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2.5} fill="url(#trendFill)" dot={false} activeDot={{ r: 4, fill: ACCENT }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
