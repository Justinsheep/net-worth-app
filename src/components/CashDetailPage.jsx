import { useEffect, useState } from 'react'
import {
  catColor, catLabel, holdingIsCashLike, holdingValueTwd, effectiveUnitPrice, hasLivePrice,
  quoteCurrencyOf, hasCost, costPerUnit, lotPnlTwd, lotRoi, priceKey, qtyUnit,
  fmtTwd, fmtNum, fmtQty, fmtPct,
} from '../calc'
import { IconChip } from '../icons'
import NumberPad from './NumberPad'
import IconPicker from './IconPicker'

const fmtDateTime = (ms) =>
  new Date(ms).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

// 一筆變動紀錄：沿用交易確認視窗同一套「改前 → 改後」樣式。
// 股票/加密貨幣的數量用 fmtQty（到小數點後 8 位，小額加密貨幣才不會被四捨五入成 0）；
// 現金/外幣的金額才用 fmtNum（到小數點後 2 位，符合一般貨幣的顯示習慣）。
function HistoryRow({ entry, unit, qty }) {
  const fmt = qty ? fmtQty : fmtNum
  return (
    <div className="tx-preview-row history-row">
      <div className="tx-preview-name">{fmtDateTime(entry.at)}</div>
      <div className="tx-preview-calc">
        <span className="tx-before">{fmt(entry.before)}</span>
        <span className="tx-arrow" aria-hidden="true">→</span>
        <span className="tx-after">{fmt(entry.after)}</span>
        <span className="tx-unit">{unit}</span>
        <span className={'tx-delta ' + (entry.delta >= 0 ? 'pos' : 'neg')}>
          {entry.delta >= 0 ? '+' : '−'}{fmt(Math.abs(entry.delta))}
        </span>
      </div>
    </div>
  )
}

// 單一項目的詳細頁：現金/外幣是「餘額 + 變動紀錄」；股票/加密貨幣/基金是「總股數 + 變動紀錄」，
// 一檔只有一筆記錄（不再逐筆存交易），成本均價由使用者自己在「編輯」裡填，不是自動算的。
export default function CashDetailPage({
  holding, fx, fxRates, prices, changePct, simpleMode,
  onBack, onAdjust, onSetBalance, onEditMeta, onDeleteHolding, onChangeIcon,
}) {
  const [mode, setMode] = useState(null) // null | 'delta' | 'set'
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  useEffect(() => {
    if (!holding) onBack()
  }, [holding])

  if (!holding) return null

  const priced = !holdingIsCashLike(holding)
  const valueTwd = holdingValueTwd(holding, fx, prices, fxRates)
  const unit = priced ? (qtyUnit(holding.category) || '單位') : holding.currency
  const history = [...(holding.history || [])].reverse()
  const chgPct = priced ? changePct?.[priceKey(holding)] : null

  function commitPad(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    if (mode === 'delta') onAdjust(n)
    else if (mode === 'set') onSetBalance(n)
    setMode(null)
  }

  return (
    <div className="detail-page">
      <div className="detail-head">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="返回">‹</button>
        <div className="detail-head-title">
          <span className="detail-head-name">{holding.name}</span>
          <span className="detail-head-sub">
            {priced ? `${holding.symbol ? holding.symbol + '　' : ''}${catLabel(holding.category)}` : catLabel(holding.category)}
          </span>
        </div>
        <button className="icon-btn" onClick={onEditMeta} aria-label="編輯">✎</button>
        <button className="detail-icon-btn" onClick={() => setIconPickerOpen(true)} aria-label="更改圖示">
          <IconChip holding={holding} color={catColor(holding.category)} />
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
              value={holding.icon}
              category={holding.category}
              subtype={holding.subtype}
              onChange={(v) => { onChangeIcon(v); setIconPickerOpen(false) }}
            />
          </div>
        </div>
      )}

      <section className="hero detail-hero">
        <div className="hero-label">{priced ? '現在市值' : '目前餘額'}</div>
        {priced ? (
          <div className={'hero-value' + (valueTwd < 0 ? ' neg' : '')}>{fmtTwd(valueTwd)}</div>
        ) : (
          <div className={'hero-value' + (valueTwd < 0 ? ' neg' : '')}>
            {fmtNum(holding.quantity)} <small className="stat-pct">{holding.currency}</small>
          </div>
        )}
        {priced && !simpleMode && (
          <div className="change-row">
            {chgPct != null ? (
              <span className={'change-chip ' + (chgPct >= 0 ? 'pos' : 'neg')}>今日 {fmtPct(chgPct)}</span>
            ) : (
              <span className="change-chip muted">今日 —</span>
            )}
          </div>
        )}
        {!priced && holding.currency !== 'TWD' && (
          <div className="change-row">
            <span className="change-chip muted">約當 NT$ {fmtNum(valueTwd)}</span>
          </div>
        )}
        {priced && (
          <>
            <div className="hero-rule" />
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-label">持有數量</span>
                <span className="stat-value">{fmtQty(holding.quantity)} {qtyUnit(holding.category)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">{hasLivePrice(holding, prices) ? '現價（即時）' : '現價'}</span>
                <span className="stat-value">{fmtNum(effectiveUnitPrice(holding, prices))} {quoteCurrencyOf(holding.category, holding)}</span>
              </div>
              {!simpleMode && hasCost(holding) && (
                <div className="stat">
                  <span className="stat-label">成本均價</span>
                  <span className="stat-value">{fmtNum(costPerUnit(holding))} {holding.currency}</span>
                </div>
              )}
              {!simpleMode && hasCost(holding) && (
                <div className="stat">
                  <span className="stat-label">累積損益</span>
                  <span className={'stat-value ' + (lotPnlTwd(holding, fx, prices) >= 0 ? 'pos' : 'neg')}>
                    {fmtTwd(lotPnlTwd(holding, fx, prices))} <small className="stat-pct">{fmtPct(lotRoi(holding, fx, prices))}</small>
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <div className="cash-actions">
        <button className="btn primary" onClick={() => setMode('delta')}>± 增減{priced ? '數量' : '金額'}</button>
        <button className="btn ghost" onClick={() => setMode('set')}>✎ 修改{priced ? '數量' : '餘額'}</button>
      </div>

      <section className="panel">
        <div className="detail-txn-head">
          <h3 className="panel-title">變動紀錄</h3>
          <div className="detail-txn-actions">
            <button className="btn danger sm" onClick={onDeleteHolding}>刪除</button>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="empty">還沒有任何變動紀錄。<br />用上面的按鈕記一筆，或用「編輯」直接改成本均價。</div>
        ) : (
          history.map((entry) => <HistoryRow key={entry.id} entry={entry} unit={unit} qty={priced} />)
        )}
      </section>

      {mode && (
        <NumberPad
          title={mode === 'delta'
            ? `增減${priced ? '數量' : '金額'}（可輸入負數表示減少）`
            : `修改${priced ? '數量' : '餘額'}`}
          value={mode === 'set' ? String(holding.quantity) : ''}
          allowNegative={mode === 'delta'}
          onCommit={commitPad}
          onClose={() => setMode(null)}
        />
      )}
    </div>
  )
}
