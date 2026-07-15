import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { CATEGORIES, catLabel, catColor, fmtTwd } from '../calc'

export default function AllocationChart({ byCat }) {
  const data = CATEGORIES.filter((c) => c.key !== 'debt' && (byCat[c.key] || 0) > 0).map((c) => ({
    key: c.key,
    name: catLabel(c.key),
    value: Math.round(byCat[c.key]),
  }))

  const total = data.reduce((s, d) => s + d.value, 0)

  if (data.length === 0) {
    return <div className="empty-chart">還沒有資產資料。按右上角「新增」加入第一筆。</div>
  }

  return (
    <div className="chart-wrap">
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.key} fill={catColor(d.key)} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => fmtTwd(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend">
        {data.map((d) => (
          <li key={d.key}>
            <span className="dot" style={{ background: catColor(d.key) }} />
            <span className="legend-name">{d.name}</span>
            <span className="legend-pct">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
