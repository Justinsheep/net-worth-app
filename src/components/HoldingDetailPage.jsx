import { useEffect, useState } from 'react'
import {
  catLabel, catColor, holdingIsCashLike, holdingValueTwd, effectiveUnitPrice,
  hasLivePrice, quoteCurrencyOf, lotPnlTwd, lotRoi, symbolAgg, priceKey,
  fmtTwd, fmtNum, fmtQty, qtyUnit, fmtPct, fmtSignedTwd,
} from '../calc'
import { DEBT_LABEL } from '../grouping'
import { IconChip } from '../icons'
import SwipeRow from './SwipeRow'

// 交易明細裡的一列。往右滑露出「✎編輯」「🗑刪除」，平常畫面乾淨、金額靠右。
function TxnRow({ h, priced, fx, prices, simpleMode, openSwipe, onOpenSwipeChange, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, prices)
  const actions = [
    { icon: '✎', label: '編輯', onClick: () => onEdit(h) },
    { icon: '🗑', label: '刪除', danger: true, onClick: () => onDelete(h) },
  ]
  if (priced) {
    const live = hasLivePrice(h, prices)
    const unit = effectiveUnitPrice(h, prices)
    const pnl = lotPnlTwd(h, fx, prices)
    const roi = lotRoi(h, fx, prices)
    return (
      <SwipeRow rowKey={h.id} openKey={openSwipe} onOpenChange={onOpenSwipeChange} actions={actions} onTap={() => onEdit(h)} frontClassName="txn-front">
        <div className="row-main">
          <div className="row-sub">
            {h.buyDate ? <span className="buy-date">{h.buyDate}</span> : <span className="buy-date">未填日期</span>}
            {fmtQty(h.quantity)} {qtyUnit(h.category)} × {fmtNum(unit)} {quoteCurrencyOf(h.category)}
            {live && <span className="live-tag">即時</span>}
          </div>
        </div>
        <div className="row-right">
          <div className="row-value">{fmtTwd(v)}</div>
          {!simpleMode && pnl != null && (
            <div className={'row-pnl' + (pnl >= 0 ? ' pos' : ' neg')}>{fmtPct(roi)} · {fmtSignedTwd(pnl)}</div>
          )}
        </div>
      </SwipeRow>
    )
  }
  return (
    <SwipeRow rowKey={h.id} openKey={openSwipe} onOpenChange={onOpenSwipeChange} actions={actions} onTap={() => onEdit(h)} frontClassName="txn-front">
      <div className="row-main">
        <div className="row-sub">{h.name} · {fmtNum(h.quantity)} {h.currency}</div>
      </div>
      <div className="row-right">
        <div className={'row-value' + (v < 0 ? ' neg' : '')}>{fmtTwd(v)}</div>
      </div>
    </SwipeRow>
  )
}

export default function HoldingDetailPage({ groupKey, holdings, fx, prices, fxRates, changePct, simpleMode, onBack, onEdit, onDelete, onAddMore, onAddMoreBucket }) {
  const [openSwipe, setOpenSwipe] = useState(null)
  const priced = groupKey.kind === 'symbol'

  let items
  if (groupKey.kind === 'symbol') {
    items = holdings.filter(
      (h) => h.category === groupKey.category && !holdingIsCashLike(h) &&
        (h.symbol ? h.symbol.toUpperCase() : '__' + h.id) === groupKey.symbol
    )
  } else if (groupKey.kind === 'debt') {
    items = holdings.filter((h) => h.category === 'debt' && (DEBT_LABEL[h.subtype] ? h.subtype : 'other') === groupKey.subtype)
  } else {
    items = holdings.filter((h) => h.category === 'bank' && (h.bankName || '未指定銀行') === groupKey.bankName)
  }
  items = [...items].sort((a, b) => String(a.buyDate || '').localeCompare(String(b.buyDate || '')))

  // 這一組被刪光了（例如剛剛在這頁把最後一筆刪掉）：自動返回列表
  useEffect(() => {
    if (items.length === 0) onBack()
  }, [items.length])

  if (items.length === 0) return null

  const first = items[0]
  const totalTwd = items.reduce((s, h) => s + holdingValueTwd(h, fx, prices, fxRates), 0)

  function addMore() {
    if (groupKey.kind === 'symbol') onAddMore(first)
    else if (groupKey.kind === 'debt') onAddMoreBucket('debt', { subtype: groupKey.subtype, currency: first.currency, icon: first.icon, name: groupKey.label })
    else onAddMoreBucket('bank', { bankName: groupKey.bankName, currency: first.currency, icon: first.icon })
  }
  function deleteAll() {
    onDelete(items) // 傳整組陣列，交由 App 層判斷是單筆還是整組
  }

  let agg = null
  let chgPct = null
  if (priced) {
    agg = symbolAgg(items, fx, prices)
    chgPct = changePct?.[priceKey({ category: groupKey.category, symbol: groupKey.symbol })]
  }

  return (
    <div className="detail-page">
      <div className="detail-head">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="返回">‹</button>
        <div className="detail-head-title">
          <span className="detail-head-name">{groupKey.label}</span>
          {priced && first.symbol && <span className="detail-head-sub">{first.symbol}　{catLabel(groupKey.category)}</span>}
          {!priced && <span className="detail-head-sub">{catLabel(groupKey.kind === 'debt' ? 'debt' : 'bank')}</span>}
        </div>
        <IconChip holding={first} color={catColor(first.category)} />
      </div>

      <section className="hero detail-hero">
        <div className="hero-label">{priced ? '現在市值' : '目前金額'}</div>
        <div className={'hero-value' + (totalTwd < 0 ? ' neg' : '')}>{fmtTwd(totalTwd)}</div>
        {priced && !simpleMode && (
          <div className="change-row">
            {chgPct != null ? (
              <span className={'change-chip ' + (chgPct >= 0 ? 'pos' : 'neg')}>今日 {fmtPct(chgPct)}</span>
            ) : (
              <span className="change-chip muted">今日 —</span>
            )}
          </div>
        )}
        {priced && (
          <>
            <div className="hero-rule" />
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-label">持股數</span>
                <span className="stat-value">{fmtQty(agg.qty)} {qtyUnit(groupKey.category)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">現價</span>
                <span className="stat-value">{fmtNum(effectiveUnitPrice(first, prices))} {quoteCurrencyOf(groupKey.category)}</span>
              </div>
              {!simpleMode && agg.anyCost && (
                <div className="stat">
                  <span className="stat-label">成本均價</span>
                  {groupKey.category === 'crypto' ? (
                    <span className="stat-value">{fmtNum(agg.costTwd / fx / agg.qty)} USD</span>
                  ) : (
                    <span className="stat-value">{fmtNum(agg.costTwd / agg.qty)} TWD</span>
                  )}
                </div>
              )}
              {!simpleMode && agg.anyCost && (
                <div className="stat">
                  <span className="stat-label">累積損益</span>
                  <span className={'stat-value ' + (agg.pnlTwd >= 0 ? 'pos' : 'neg')}>
                    {fmtTwd(agg.pnlTwd)} <small className="stat-pct">{fmtPct(agg.roi)}</small>
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="detail-txn-head">
          <h3 className="panel-title">交易明細</h3>
          <div className="detail-txn-actions">
            <button className="btn ghost sm" onClick={addMore}>＋ 加碼</button>
            <button className="btn danger sm" onClick={deleteAll}>刪除整組</button>
          </div>
        </div>
        {items.map((h) => (
          <TxnRow key={h.id} h={h} priced={priced} fx={fx} prices={prices} simpleMode={simpleMode} openSwipe={openSwipe} onOpenSwipeChange={setOpenSwipe} onEdit={onEdit} onDelete={(one) => onDelete([one])} />
        ))}
      </section>
    </div>
  )
}
