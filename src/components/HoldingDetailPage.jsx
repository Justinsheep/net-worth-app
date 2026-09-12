import { useEffect, useState } from 'react'
import { catLabel, catColor, holdingValueTwd, fmtTwd, fmtNum } from '../calc'
import { DEBT_LABEL } from '../grouping'
import { IconChip } from '../icons'
import SwipeRow from './SwipeRow'
import IconPicker from './IconPicker'

// 變動紀錄裡的一列。往右滑露出「✎編輯」「🗑刪除」，平常畫面乾淨、金額靠右。
// 只用在負債子分類／銀行分組——這兩種底下本來就會有好幾筆不同的東西（兩台車的車貸、
// 好幾個帳戶），跟股票不一樣，不能合併成一筆。
function TxnRow({ h, fx, fxRates, openSwipe, onOpenSwipeChange, onEdit, onDelete }) {
  const v = holdingValueTwd(h, fx, undefined, fxRates)
  return (
    <SwipeRow rowKey={h.id} openKey={openSwipe} onOpenChange={onOpenSwipeChange}
      actions={[{ icon: '✎', label: '編輯', onClick: () => onEdit(h) }, { icon: '🗑', label: '刪除', danger: true, onClick: () => onDelete(h) }]}
      onTap={() => onEdit(h)} frontClassName="txn-front">
      <div className="row-main">
        <div className="row-sub">{h.name} · {fmtNum(h.quantity)} {h.currency}</div>
      </div>
      <div className="row-right">
        <div className={'row-value' + (v < 0 ? ' neg' : '')}>{fmtTwd(v)}</div>
      </div>
    </SwipeRow>
  )
}

// 負債子分類／銀行分組的詳細頁：底下可能有好幾筆不同的項目。
// 股票／加密貨幣／基金／現金一檔（一個項目）只有一筆記錄，走 CashDetailPage。
export default function HoldingDetailPage({ groupKey, holdings, fx, fxRates, onBack, onEdit, onDelete, onAddMoreBucket, onChangeIcon }) {
  const [openSwipe, setOpenSwipe] = useState(null)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  let items
  if (groupKey.kind === 'debt') {
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
  const totalTwd = items.reduce((s, h) => s + holdingValueTwd(h, fx, undefined, fxRates), 0)

  function addMore() {
    if (groupKey.kind === 'debt') onAddMoreBucket('debt', { subtype: groupKey.subtype, currency: first.currency, icon: first.icon, name: groupKey.label })
    else onAddMoreBucket('bank', { bankName: groupKey.bankName, currency: first.currency, icon: first.icon })
  }
  function deleteAll() {
    onDelete(items) // 傳整組陣列，交由 App 層判斷是單筆還是整組
  }

  return (
    <div className="detail-page">
      <div className="detail-head">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="返回">‹</button>
        <div className="detail-head-title">
          <span className="detail-head-name">{groupKey.label}</span>
          <span className="detail-head-sub">{catLabel(groupKey.kind === 'debt' ? 'debt' : 'bank')}</span>
        </div>
        <button className="detail-icon-btn" onClick={() => setIconPickerOpen(true)} aria-label="更改圖示">
          <IconChip holding={first} color={catColor(first.category)} />
        </button>
      </div>

      {iconPickerOpen && (
        <div className="modal-backdrop" onClick={() => setIconPickerOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span />
              <h2>選圖示</h2>
              <button className="icon-btn" onClick={() => setIconPickerOpen(false)} aria-label="關閉">✕</button>
            </div>
            <IconPicker
              value={first.icon}
              category={first.category}
              subtype={first.subtype}
              onChange={(v) => { onChangeIcon(items, v); setIconPickerOpen(false) }}
            />
          </div>
        </div>
      )}

      <section className="hero detail-hero">
        <div className="hero-label">目前金額</div>
        <div className={'hero-value' + (totalTwd < 0 ? ' neg' : '')}>{fmtTwd(totalTwd)}</div>
      </section>

      <section className="panel">
        <div className="detail-txn-head">
          <h3 className="panel-title">變動紀錄</h3>
          <div className="detail-txn-actions">
            <button className="btn ghost sm" onClick={addMore}>＋ 加碼</button>
            <button className="btn danger sm" onClick={deleteAll}>刪除整組</button>
          </div>
        </div>
        {items.map((h) => (
          <TxnRow key={h.id} h={h} fx={fx} fxRates={fxRates} openSwipe={openSwipe} onOpenSwipeChange={setOpenSwipe} onEdit={onEdit} onDelete={(one) => onDelete([one])} />
        ))}
      </section>
    </div>
  )
}
