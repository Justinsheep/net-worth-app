import { useState } from 'react'
import {
  CATEGORIES, catLabel, catColor, holdingIsCashLike, quoteCurrencyOf,
  holdingValueTwd, effectiveUnitPrice, hasLivePrice,
  lotPnlTwd, lotRoi, symbolAgg,
  fmtTwd, fmtNum, fmtPct, fmtSignedTwd,
} from '../calc'
import { DEBT_TYPES } from '../debtTypes'
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

const DEBT_LABEL = Object.fromEntries(DEBT_TYPES.map(([k, l]) => [k, l]))
const DEBT_ORDER = DEBT_TYPES.map(([k]) => k)

// 依負債子分類分組（沒選過子分類的舊資料歸到「其他」）
function groupDebtBySubtype(items) {
  const map = new Map()
  for (const h of items) {
    const key = DEBT_LABEL[h.subtype] ? h.subtype : 'other'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  return [...map.entries()].sort((a, b) => DEBT_ORDER.indexOf(a[0]) - DEBT_ORDER.indexOf(b[0]))
}

// 依銀行名稱分組
function groupByBank(items) {
  const map = new Map()
  for (const h of items) {
    const key = h.bankName || '未指定銀行'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
}

function IconChip({ h }) {
  return (
    <span className="icon-chip" style={{ '--chip-c': catColor(h.category) }}>
      <IconGlyph name={h.icon} category={h.category} subtype={h.subtype} />
    </span>
  )
}

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

// 展開後的單筆明細列（負債子分類 / 銀行分組底下的每一筆，簡化版：只有名稱+金額）
function CashLotRow({ h, fx, prices, fxRates, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, prices, fxRates)
  return (
    <div className="row lot">
      <div className="row-main">
        <div className="row-sub">{h.name} · {fmtNum(h.quantity)} {h.currency}</div>
      </div>
      <div className="row-right">
        <div className={'row-value' + (v < 0 ? ' neg' : '')}>{fmtTwd(v)}</div>
      </div>
      <div className="row-actions">
        <button className="icon-btn" onClick={() => onEdit(h)} aria-label="編輯">✎</button>
        <button className="icon-btn danger" onClick={() => onDelete(h)} aria-label="刪除">🗑</button>
      </div>
    </div>
  )
}

// 現金：單筆一列（現金不分組，維持原樣）
function PlainRow({ h, fx, prices, fxRates, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, prices, fxRates)
  return (
    <div className="row">
      <IconChip h={h} />
      <div className="row-main">
        <div className="row-name">{h.name}</div>
        <div className="row-sub">{fmtNum(h.quantity)} {h.currency}</div>
      </div>
      <div className={'row-value' + (v < 0 ? ' neg' : '')}>{fmtTwd(v)}</div>
      <div className="row-actions">
        <button className="icon-btn" onClick={() => onEdit(h)} aria-label="編輯">✎</button>
        <button className="icon-btn danger" onClick={() => onDelete(h)} aria-label="刪除">🗑</button>
      </div>
    </div>
  )
}

// 股票/加密貨幣現貨：同一檔的大項（可展開），旁邊有「＋ 加碼」直接新增同一檔的一筆
function PricedGroup({ g, lots, symKey, fx, prices, open, toggle, onEdit, onDelete, onAddMore, onDeleteMany }) {
  const agg = symbolAgg(lots, fx, prices)
  const key = g.key + ':' + symKey
  const isOpen = !!open[key]
  const unitWord = g.key === 'crypto' ? '' : ' 股'
  return (
    <div className="symgroup" key={key}>
      <div className="agg-row">
        <button className="agg-toggle" onClick={() => toggle(key)}>
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
        <button className="icon-btn add-more-btn" onClick={() => onAddMore(lots[0])} title="加碼這檔" aria-label={`針對 ${lots[0].name} 新增一筆`}>＋</button>
        <button
          className="icon-btn danger add-more-btn"
          onClick={() => onDeleteMany(lots.map((h) => h.id), lots[0].name)}
          title="刪除這一檔" aria-label={`刪除 ${lots[0].name} 全部`}
        >🗑</button>
      </div>
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

// 負債子分類 / 銀行：依名稱分組的大項（可展開），旁邊有「＋ 加碼」
function BucketGroup({ groupKey, label, items, fx, prices, fxRates, open, toggle, onEdit, onDelete, onAddMore, onDeleteMany }) {
  const isOpen = !!open[groupKey]
  const subtotal = items.reduce((s, h) => s + holdingValueTwd(h, fx, prices, fxRates), 0)
  return (
    <div className="symgroup" key={groupKey}>
      <div className="agg-row">
        <button className="agg-toggle" onClick={() => toggle(groupKey)}>
          <span className={'chev' + (isOpen ? ' open' : '')} aria-hidden="true">▸</span>
          <IconChip h={items[0]} />
          <div className="agg-main">
            <div className="row-name">{label}</div>
            <div className="row-sub">{items.length} 筆</div>
          </div>
          <div className="row-right">
            <div className={'row-value' + (subtotal < 0 ? ' neg' : '')}>{fmtTwd(subtotal)}</div>
          </div>
        </button>
        <button className="icon-btn add-more-btn" onClick={() => onAddMore(items[0])} title="加碼" aria-label={`針對 ${label} 新增一筆`}>＋</button>
        <button
          className="icon-btn danger add-more-btn"
          onClick={() => onDeleteMany(items.map((h) => h.id), label)}
          title="刪除這一組" aria-label={`刪除 ${label} 全部`}
        >🗑</button>
      </div>
      {isOpen && (
        <div className="lot-list">
          {items.map((h) => (
            <CashLotRow key={h.id} h={h} fx={fx} prices={prices} fxRates={fxRates} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HoldingsTable({ holdings, fx, prices, fxRates, onEdit, onDelete, onDeleteMany, onAddMore, onAddMoreBucket }) {
  const [open, setOpen] = useState({})
  const [catOpen, setCatOpen] = useState({})
  if (!holdings || holdings.length === 0) return null

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }))
  const toggleCat = (key) => setCatOpen((o) => ({ ...o, [key]: o[key] !== true }))

  const groups = CATEGORIES.map((c) => ({
    ...c,
    items: holdings.filter((h) => h.category === c.key),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="table">
      {groups.map((g) => {
        const subtotal = g.items.reduce((s, h) => s + holdingValueTwd(h, fx, prices, fxRates), 0)
        const isOpen = catOpen[g.key] === true // 預設收起

        let body
        let itemCount
        if (g.key === 'debt') {
          const subGroups = groupDebtBySubtype(g.items)
          itemCount = subGroups.length
          body = subGroups.map(([subKey, items]) => (
            <BucketGroup
              key={'debt:' + subKey}
              groupKey={'debt:' + subKey}
              label={DEBT_LABEL[subKey] || '其他'}
              items={items}
              fx={fx} prices={prices} fxRates={fxRates} open={open} toggle={toggle}
              onEdit={onEdit} onDelete={onDelete} onDeleteMany={onDeleteMany}
              onAddMore={(tpl) => onAddMoreBucket('debt', { subtype: subKey, currency: tpl.currency, icon: tpl.icon, name: DEBT_LABEL[subKey] || '其他' })}
            />
          ))
        } else if (g.key === 'bank') {
          const bankGroups = groupByBank(g.items)
          itemCount = bankGroups.length
          body = bankGroups.map(([bankKey, items]) => (
            <BucketGroup
              key={'bank:' + bankKey}
              groupKey={'bank:' + bankKey}
              label={bankKey}
              items={items}
              fx={fx} prices={prices} fxRates={fxRates} open={open} toggle={toggle}
              onEdit={onEdit} onDelete={onDelete} onDeleteMany={onDeleteMany}
              onAddMore={(tpl) => onAddMoreBucket('bank', { bankName: bankKey, currency: tpl.currency, icon: tpl.icon })}
            />
          ))
        } else {
          const cashItems = g.items.filter((h) => holdingIsCashLike(h))
          const pricedItems = g.items.filter((h) => !holdingIsCashLike(h))
          const symGroups = groupBySymbol(pricedItems)
          itemCount = cashItems.length + symGroups.length
          body = (
            <>
              {cashItems.map((h) => (
                <PlainRow key={h.id} h={h} fx={fx} prices={prices} fxRates={fxRates} onEdit={onEdit} onDelete={onDelete} />
              ))}
              {symGroups.map(([symKey, lots]) => (
                <PricedGroup
                  key={g.key + ':' + symKey}
                  g={g} lots={lots} symKey={symKey}
                  fx={fx} prices={prices} open={open} toggle={toggle}
                  onEdit={onEdit} onDelete={onDelete} onAddMore={onAddMore} onDeleteMany={onDeleteMany}
                />
              ))}
            </>
          )
        }

        return (
          <div className="group" key={g.key}>
            <div className="group-head">
              <button className="group-head-toggle" onClick={() => toggleCat(g.key)}>
                <span className={'chev' + (isOpen ? ' open' : '')} aria-hidden="true">▸</span>
                <span className="dot" style={{ background: catColor(g.key) }} />
                <span className="group-head-label">{catLabel(g.key)}</span>
                <span className="group-head-count">{itemCount} 項</span>
                <span className="group-head-total">{fmtTwd(subtotal)}</span>
              </button>
              <button
                className="icon-btn danger"
                onClick={() => onDeleteMany(g.items.map((h) => h.id), catLabel(g.key))}
                title={`刪除「${catLabel(g.key)}」全部`}
                aria-label={`刪除「${catLabel(g.key)}」全部`}
              >🗑</button>
            </div>
            {isOpen && <div className="group-body">{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
