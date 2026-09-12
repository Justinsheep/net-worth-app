import { useEffect, useState } from 'react'
import { catColor, holdingValueTwd, fmtNum } from '../calc'
import { IconChip } from '../icons'
import NumberPad from './NumberPad'
import IconPicker from './IconPicker'

const fmtDateTime = (ms) =>
  new Date(ms).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

// 一筆變動紀錄：沿用交易確認視窗同一套「改前 → 改後」樣式
function HistoryRow({ entry, currency }) {
  return (
    <div className="tx-preview-row history-row">
      <div className="tx-preview-name">{fmtDateTime(entry.at)}</div>
      <div className="tx-preview-calc">
        <span className="tx-before">{fmtNum(entry.before)}</span>
        <span className="tx-arrow" aria-hidden="true">→</span>
        <span className="tx-after">{fmtNum(entry.after)}</span>
        <span className="tx-unit">{currency}</span>
        <span className={'tx-delta ' + (entry.delta >= 0 ? 'pos' : 'neg')}>
          {entry.delta >= 0 ? '+' : '−'}{fmtNum(Math.abs(entry.delta))}
        </span>
      </div>
    </div>
  )
}

// 現金 / 外幣（不分組的單一項目）的詳細頁：不是「持股」，沒有成本/報酬率概念，
// 取而代之的是「餘額 + 每次變動的紀錄」，更貼近實際記帳的用法。
export default function CashDetailPage({ holding, fx, fxRates, onBack, onAdjust, onSetBalance, onEditMeta, onDeleteHolding, onChangeIcon }) {
  const [mode, setMode] = useState(null) // null | 'delta' | 'set'
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  useEffect(() => {
    if (!holding) onBack()
  }, [holding])

  if (!holding) return null

  const valueTwd = holdingValueTwd(holding, fx, fxRates)
  const history = [...(holding.history || [])].reverse()

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
          <span className="detail-head-sub">現金 / 外幣</span>
        </div>
        <button className="icon-btn" onClick={onEditMeta} aria-label="編輯名稱與幣別">✎</button>
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
              onChange={(v) => { onChangeIcon(v); setIconPickerOpen(false) }}
            />
          </div>
        </div>
      )}

      <section className="hero detail-hero">
        <div className="hero-label">目前餘額</div>
        <div className={'hero-value' + (valueTwd < 0 ? ' neg' : '')}>
          {fmtNum(holding.quantity)} <small className="stat-pct">{holding.currency}</small>
        </div>
        {holding.currency !== 'TWD' && (
          <div className="change-row">
            <span className="change-chip muted">約當 NT$ {fmtNum(valueTwd)}</span>
          </div>
        )}
      </section>

      <div className="cash-actions">
        <button className="btn primary" onClick={() => setMode('delta')}>± 增減金額</button>
        <button className="btn ghost" onClick={() => setMode('set')}>✎ 修改餘額</button>
      </div>

      <section className="panel">
        <div className="detail-txn-head">
          <h3 className="panel-title">變動紀錄</h3>
          <div className="detail-txn-actions">
            <button className="btn danger sm" onClick={onDeleteHolding}>刪除</button>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="empty">還沒有任何變動紀錄。<br />用上面「增減金額」或「修改餘額」記一筆。</div>
        ) : (
          history.map((entry) => <HistoryRow key={entry.id} entry={entry} currency={holding.currency} />)
        )}
      </section>

      {mode && (
        <NumberPad
          title={mode === 'delta' ? '增減金額（可輸入負數表示減少）' : '修改餘額'}
          value={mode === 'set' ? String(holding.quantity) : ''}
          allowNegative={mode === 'delta'}
          onCommit={commitPad}
          onClose={() => setMode(null)}
        />
      )}
    </div>
  )
}
