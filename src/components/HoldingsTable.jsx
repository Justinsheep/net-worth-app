import { useState } from 'react'
import {
  CATEGORIES, catLabel, catColor, holdingIsCashLike, quoteCurrencyOf,
  holdingValueTwd, effectiveUnitPrice, hasLivePrice,
  lotPnlTwd, lotRoi, symbolAgg,
  fmtTwd, fmtNum, fmtPct, fmtSignedTwd,
} from '../calc'
import { IconGlyph } from '../icons'

function groupBySymbol(items) {
  const map = new Map()
  for (const h of items) {
    const key = h.symbol ? h.symbol.toUpperCase() : '__' + h.id
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.buyDate || '').localeCompare(String(b.buyDate || '')))
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function IconChip({ h }) {
  return (
    <span className="icon-chip" style={{ '--chip-c': catColor(h.category) }}>
      <IconGlyph name={h.icon} category={h.category} subtype={h.subtype} />
    </span>
  )
}

const DEBT_LABEL = { mortgage: '房貸', car: '車貸', student: '學貸', credit: '信用卡', other: '其他' }

// 展開後的單筆明細列（股票/加密貨幣現貨）
function LotRow({ h, fx, prices, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, prices)
  const live = hasLivePrice(h, prices)
  const unit = effectiveUnitPrice(h, prices)
  const pnl = lotPnlTwd(h, fx, prices)
  const roi = lotRoi(h, fx, prices)
  return (
    <div className="row lot">
      <div className="row-main">
        <div className="row-sub">
          {h.buyDate ? <span className="buy-date">{h.buyDate}</span> : <span className="buy-date">未填日期</span>}
          {fmtNum(h.quantity)} × {fmtNum(unit)} {quoteCurrencyOf(h.category)}
          {live && <span className="live-tag">即時</span>}
        </div>
      </div>
      <div className="row-right">
        <div className="row-value">{fmtTwd(v)}</div>
        {pnl != null && (
          <div className={'row-pnl' + (pnl >= 0 ? ' pos' : ' neg')}>
            {fmtPct(roi)} · {fmtSignedTwd(pnl)}
          </div>
        )}
      </div>
      <div className="row-actions">
        <button className="icon-btn" onClick={() => onEdit(h)} aria-label="編輯">✎</button>
        <button className="icon-btn danger" onClick={() => onDelete(h)} aria-label="刪除">🗑</button>
      </div>
    </div>
  )
}

// 現金/銀行/負債/交易所餘額：單筆一列
function PlainRow({ h, fx, prices, fxRates, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, prices, fxRates)
  const subLabel =
    h.category === 'bank' && h.bankName ? h.bankName
      : h.category === 'debt' && h.subtype ? DEBT_LABEL[h.subtype]
      : h.category === 'crypto' && h.subtype === 'exchange' ? '交易所資金'
      : null
  return (
    <div className="row">
      <IconChip h={h} />
      <div className="row-main">
        <div className="row-name">{h.name}</div>
        <div className="row-sub">
          {subLabel ? <span className="bank-name">{subLabel}　</span> : null}
          {fmtNum(h.quantity)} {h.currency}
        </div>
      </div>
      <div className={'row-value' + (v < 0 ? ' neg' : '')}>{fmtTwd(v)}</div>
      <div className="row-actions">
        <button className="icon-btn" onClick={() => onEdit(h)} aria-label="編輯">✎</button>
        <button className="icon-btn danger" onClick={() => onDelete(h)} aria-label="刪除">🗑</button>
      </div>
    </div>
  )
}

function PricedGroup({ g, lots, symKey, fx, prices, open, toggle, onEdit, onDelete }) {
  const agg = symbolAgg(lots, fx, prices)
  const key = g.key + ':' + symKey
  const isOpen = !!open[key]
  const unitWord = g.key === 'crypto' ? '' : ' 股'
  return (
    <div className="symgroup" key={key}>
      <button className="agg-row" onClick={() => toggle(key)}>
        <span className={'chev' + (isOpen ? ' open' : '')} aria-hidden="true">▸</span>
        <IconChip h={lots[0]} />
        <div className="agg-main">
          <div className="row-name">
            {lots[0].name}
            {lots[0].symbol ? <span className="row-symbol"> · {lots[0].symbol}</span> : null}
          </div>
          <div className="row-sub">
            {fmtNum(agg.qty)}{unitWord}
            {lots.length > 1 ? <span className="lot-count"> · {lots.length} 筆</span> : null}
          </div>
        </div>
        <div className="row-right">
          <div className="row-value">{fmtTwd(agg.valueTwd)}</div>
          {agg.anyCost && (
            <div className={'row-pnl' + (agg.pnlTwd >= 0 ? ' pos' : ' neg')}>
              {fmtPct(agg.roi)} · {fmtSignedTwd(agg.pnlTwd)}
            </div>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="lot-list">
          {lots.map((h) => (
            <LotRow key={h.id} h={h} fx={fx} prices={prices} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HoldingsTable({ holdings, fx, prices, fxRates, onEdit, onDelete }) {
  const [open, setOpen] = useState({})
  if (!holdings || holdings.length === 0) return null

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }))

  const groups = CATEGORIES.map((c) => ({
    ...c,
    items: holdings.filter((h) => h.category === c.key),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="table">
      {groups.map((g) => {
        // 依「單筆」而非分類判斷現金型，因為加密貨幣裡的「交易所」子分類要當現金處理
        const cashItems = g.items.filter((h) => holdingIsCashLike(h))
        const pricedItems = g.items.filter((h) => !holdingIsCashLike(h))
        return (
          <div className="group" key={g.key}>
            <div className="group-head">
              <span className="dot" style={{ background: catColor(g.key) }} />
              {catLabel(g.key)}
            </div>

            {cashItems.map((h) => (
              <PlainRow key={h.id} h={h} fx={fx} prices={prices} fxRates={fxRates} onEdit={onEdit} onDelete={onDelete} />
            ))}

            {groupBySymbol(pricedItems).map(([symKey, lots]) => (
              <PricedGroup
                key={g.key + ':' + symKey}
                g={g} lots={lots} symKey={symKey}
                fx={fx} prices={prices} open={open} toggle={toggle}
                onEdit={onEdit} onDelete={onDelete}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
