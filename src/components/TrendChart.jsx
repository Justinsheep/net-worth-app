import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtTwd } from '../calc'

const ACCENT = '#0FB5A3'

export default function TrendChart({ snapshots, metric }) {
  const data = (snapshots || [])
    .map((s) => ({
      date: s.date,
      value: metric === 'asset' ? s.totalAssetTwd : s.netWorthTwd,
    }))
    .filter((d) => d.value != null)

  const mmdd = (d) => (d ? d.slice(5).replace('-', '/') : '')

  if (data.length < 2) {
    return (
      <div className="trend-empty">
        走勢會隨你每天開啟自動累積，多來幾天就會長出曲線。
        {data.length === 1 ? '（目前有 1 個記錄點）' : ''}
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
