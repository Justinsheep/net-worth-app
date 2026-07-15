import {
  CATEGORIES, catLabel, catColor, isCashLike,
  holdingValueTwd, effectiveUnitPrice, hasLivePrice,
  lotValueNative, lotPnlNative, lotRoi, lotCost, hasCost,
  fmtTwd, fmtNum, fmtPct, fmtSignedNative,
} from '../calc'

// 依代號把同類別的持倉分組（同一檔的多筆買入會排在一起）
function groupBySymbol(items) {
  const map = new Map()
  for (const h of items) {
    const key = h.symbol ? h.symbol.toUpperCase() : '__' + h.id
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  // 每組內依買入日期排序（早的在前）
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.buyDate || '').localeCompare(String(b.buyDate || '')))
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export default function HoldingsTable({ holdings, fx, prices, onEdit, onDelete }) {
  if (!holdings || holdings.length === 0) return null

  const groups = CATEGORIES.map((c) => ({
    ...c,
    items: holdings.filter((h) => h.category === c.key),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="table">
      {groups.map((g) => {
        const symGroups = groupBySymbol(g.items)
        return (
          <div className="group" key={g.key}>
            <div className="group-head">
              <span className="dot" style={{ background: catColor(g.key) }} />
              {catLabel(g.key)}
            </div>

            {symGroups.map(([symKey, lots]) => (
              <div className="symgroup" key={symKey}>
                {lots.map((h) => {
                  const v = holdingValueTwd(h, fx, prices)
                  const live = hasLivePrice(h, prices)
                  const unit = effectiveUnitPrice(h, prices)
                  const pnl = lotPnlNative(h, prices)
                  const roi = lotRoi(h, prices)
                  return (
                    <div className="row" key={h.id}>
                      <div className="row-main">
                        <div className="row-name">
                          {h.name}{h.symbol ? <span className="row-symbol"> · {h.symbol}</span> : null}
                        </div>
                        <div className="row-sub">
                          {h.buyDate ? <span className="buy-date">{h.buyDate} 買入</span> : null}
                          {isCashLike(h.category)
                            ? `${fmtNum(h.quantity)} ${h.currency}`
                            : (
                              <>
                                {fmtNum(h.quantity)} × {fmtNum(unit)} {h.currency}
                                {live && <span className="live-tag">即時</span>}
                              </>
                            )}
                        </div>
                      </div>
                      <div className="row-right">
                        <div className={'row-value' + (v < 0 ? ' neg' : '')}>{fmtTwd(v)}</div>
                        {pnl != null && (
                          <div className={'row-pnl' + (pnl >= 0 ? ' pos' : ' neg')}>
                            {fmtPct(roi)} · {fmtSignedNative(pnl, h.currency)}
                          </div>
                        )}
                      </div>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => onEdit(h)} aria-label="編輯">✎</button>
                        <button className="icon-btn danger" onClick={() => onDelete(h)} aria-label="刪除">🗑</button>
                      </div>
                    </div>
                  )
                })}

                {lots.length >= 2 && (() => {
                  const cur = lots[0].currency
                  const valueNative = lots.reduce((s, h) => s + lotValueNative(h, prices), 0)
                  const costNative = lots.reduce((s, h) => s + (hasCost(h) ? lotCost(h) : 0), 0)
                  const valueTwd = lots.reduce((s, h) => s + holdingValueTwd(h, fx, prices), 0)
                  const anyCost = costNative > 0
                  const pnl = anyCost ? valueNative - costNative : null
                  const roi = anyCost ? pnl / costNative : null
                  return (
                    <div className="subtotal">
                      <span className="subtotal-label">合計 {lots[0].symbol || lots[0].name}</span>
                      <span className="subtotal-figs">
                        現值 {fmtTwd(valueTwd)}
                        {anyCost && <> · <span className={pnl >= 0 ? 'pos' : 'neg'}>{fmtPct(roi)} · {fmtSignedNative(pnl, cur)}</span></>}
                      </span>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
