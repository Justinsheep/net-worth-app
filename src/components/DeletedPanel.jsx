import { useState } from 'react'
import { catLabel, catColor, holdingValueTwd, fmtTwd, fmtNum } from '../calc'
import { IconGlyph } from '../icons'

export default function DeletedPanel({ items, fx, prices, fxRates, onRestore, onPurge }) {
  const [selected, setSelected] = useState(new Set())

  if (!items || items.length === 0) {
    return <p className="hint">沒有已刪除的資料。</p>
  }

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allSelected = selected.size > 0 && selected.size === items.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((h) => h.id)))

  const restoreOne = (id) => onRestore([id])
  const purgeOne = (id) => {
    if (confirm('永久刪除這一筆？無法復原。')) onPurge([id])
  }
  const restoreSelected = () => { onRestore([...selected]); setSelected(new Set()) }
  const purgeSelected = () => {
    if (confirm(`永久刪除選取的 ${selected.size} 筆？無法復原。`)) { onPurge([...selected]); setSelected(new Set()) }
  }

  return (
    <div className="trash">
      <div className="trash-bar">
        <label className="trash-selectall">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          全選
        </label>
        <div className="trash-bulk-actions">
          <button className="btn ghost" disabled={!selected.size} onClick={restoreSelected}>復原選取</button>
          <button className="btn danger" disabled={!selected.size} onClick={purgeSelected}>永久刪除選取</button>
        </div>
      </div>

      <div className="trash-list">
        {items.map((h) => {
          const v = holdingValueTwd(h, fx, prices, fxRates)
          return (
            <div className="row trash-row" key={h.id}>
              <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} />
              <span className="icon-chip" style={{ '--chip-c': catColor(h.category) }}>
                <IconGlyph name={h.icon} category={h.category} subtype={h.subtype} />
              </span>
              <div className="row-main">
                <div className="row-name">{h.name}</div>
                <div className="row-sub">
                  {catLabel(h.category)}　{fmtNum(h.quantity)} {h.currency}
                </div>
              </div>
              <div className="row-value">{fmtTwd(v)}</div>
              <div className="row-actions">
                <button className="btn ghost sm" onClick={() => restoreOne(h.id)}>復原</button>
                <button className="btn danger sm" onClick={() => purgeOne(h.id)}>永久刪除</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
