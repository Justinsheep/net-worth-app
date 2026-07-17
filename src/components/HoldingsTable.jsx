import { useState } from 'react'
import { CATEGORIES, catLabel, catColor, holdingIsCashLike, holdingValueTwd } from '../calc'
import { groupBySymbol, groupDebtBySubtype, groupByBank, DEBT_LABEL } from '../grouping'
import { fmtTwd, fmtNum, fmtQty, qtyUnit } from '../calc'
import { IconChip } from '../icons'
import SwipeRow from './SwipeRow'

// 現金：單筆一列（現金不分組，維持原樣，也沒有詳細頁可點）
function PlainRow({ h, fx, prices, fxRates, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, prices, fxRates)
  return (
    <div className="row">
      <IconChip holding={h} color={catColor(h.category)} />
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

// 股票/加密貨幣現貨、負債子分類、銀行：一個可點進詳細頁的大項列。
// 往右滑露出「＋加碼」「🗑刪除整組」，平常畫面乾淨、金額靠右對齊。
function GroupRow({ rowKey, openSwipe, onOpenSwipeChange, icon, title, sub, valueTwd, onOpen, onAddMore, onDeleteAll, deleteLabel }) {
  return (
    <div className="symgroup">
      <SwipeRow
        rowKey={rowKey}
        openKey={openSwipe}
        onOpenChange={onOpenSwipeChange}
        onTap={onOpen}
        frontClassName="agg-front"
        actions={[
          { icon: '＋', label: `針對 ${deleteLabel} 新增一筆`, onClick: onAddMore },
          { icon: '🗑', label: `刪除 ${deleteLabel} 全部`, danger: true, onClick: onDeleteAll },
        ]}
      >
        {icon}
        <div className="agg-main">
          <div className="row-name">{title}</div>
          <div className="row-sub">{sub}</div>
        </div>
        <div className={'row-value' + (valueTwd < 0 ? ' neg' : '')}>{fmtTwd(valueTwd)}</div>
      </SwipeRow>
    </div>
  )
}

export default function HoldingsTable({ holdings, fx, prices, fxRates, simpleMode, onEdit, onDelete, onDeleteMany, onAddMore, onAddMoreBucket, onOpenDetail }) {
  const [catOpen, setCatOpen] = useState({})
  const [openSwipe, setOpenSwipe] = useState(null)
  if (!holdings || holdings.length === 0) return null

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
          body = subGroups.map(([subKey, items]) => {
            const label = DEBT_LABEL[subKey] || '其他'
            const total = items.reduce((s, h) => s + holdingValueTwd(h, fx, prices, fxRates), 0)
            return (
              <GroupRow
                key={'debt:' + subKey}
                rowKey={'debt:' + subKey}
                openSwipe={openSwipe}
                onOpenSwipeChange={setOpenSwipe}
                icon={<IconChip holding={items[0]} color={catColor(items[0].category)} />}
                title={label}
                sub={`${items.length} 筆`}
                valueTwd={total}
                deleteLabel={label}
                onOpen={() => onOpenDetail({ kind: 'debt', subtype: subKey, label })}
                onAddMore={() => onAddMoreBucket('debt', { subtype: subKey, currency: items[0].currency, icon: items[0].icon, name: label })}
                onDeleteAll={() => onDeleteMany(items.map((h) => h.id), label)}
              />
            )
          })
        } else if (g.key === 'bank') {
          const bankGroups = groupByBank(g.items)
          itemCount = bankGroups.length
          body = bankGroups.map(([bankKey, items]) => {
            const total = items.reduce((s, h) => s + holdingValueTwd(h, fx, prices, fxRates), 0)
            return (
              <GroupRow
                key={'bank:' + bankKey}
                rowKey={'bank:' + bankKey}
                openSwipe={openSwipe}
                onOpenSwipeChange={setOpenSwipe}
                icon={<IconChip holding={items[0]} color={catColor(items[0].category)} />}
                title={bankKey}
                sub={`${items.length} 筆`}
                valueTwd={total}
                deleteLabel={bankKey}
                onOpen={() => onOpenDetail({ kind: 'bank', bankName: bankKey, label: bankKey })}
                onAddMore={() => onAddMoreBucket('bank', { bankName: bankKey, currency: items[0].currency, icon: items[0].icon })}
                onDeleteAll={() => onDeleteMany(items.map((h) => h.id), bankKey)}
              />
            )
          })
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
              {symGroups.map(([symKey, lots]) => {
                const total = lots.reduce((s, h) => s + holdingValueTwd(h, fx, prices), 0)
                const qty = lots.reduce((s, h) => s + Number(h.quantity || 0), 0)
                return (
                  <GroupRow
                    key={g.key + ':' + symKey}
                    rowKey={g.key + ':' + symKey}
                    openSwipe={openSwipe}
                    onOpenSwipeChange={setOpenSwipe}
                    icon={<IconChip holding={lots[0]} color={catColor(lots[0].category)} />}
                    title={lots[0].name}
                    sub={`${fmtQty(qty)} ${qtyUnit(g.key)}`}
                    valueTwd={total}
                    deleteLabel={lots[0].name}
                    onOpen={() => onOpenDetail({ kind: 'symbol', category: g.key, symbol: symKey, label: lots[0].name })}
                    onAddMore={() => onAddMore(lots[0])}
                    onDeleteAll={() => onDeleteMany(lots.map((h) => h.id), lots[0].name)}
                  />
                )
              })}
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
