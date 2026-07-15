import { useState, useEffect } from 'react'
import { CATEGORIES, isCashLike, catDefaultCurrency } from '../calc'
import SymbolSearch from './SymbolSearch'

const blank = {
  category: 'tw_stock',
  name: '',
  symbol: '',
  quantity: '',
  price: '',
  currency: 'TWD',
  totalCost: '',
  buyDate: '',
}

const SYMBOL_HINT = {
  tw_stock: '打代號或名稱搜尋，例：0050',
  crypto: '打代號或名稱搜尋，例：BTC',
  cash: '',
  debt: '',
}

const HAS_SEARCH = { tw_stock: true, crypto: true }

export default function HoldingForm({ editing, onSave, onClose }) {
  const [form, setForm] = useState(blank)

  useEffect(() => {
    if (editing) {
      setForm({
        category: editing.category,
        name: editing.name ?? '',
        symbol: editing.symbol ?? '',
        quantity: editing.quantity ?? '',
        price: editing.price ?? '',
        currency: editing.currency ?? catDefaultCurrency(editing.category),
        totalCost: editing.totalCost ?? '',
        buyDate: editing.buyDate ?? '',
      })
    } else {
      setForm(blank)
    }
  }, [editing])

  const cashLike = isCashLike(form.category)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const changeCategory = (cat) =>
    setForm((f) => ({ ...f, category: cat, currency: catDefaultCurrency(cat) }))

  // 從搜尋清單選代號：帶入代號；有名稱就一併帶入（仍可自己改）
  function pickSymbol(code, name) {
    setForm((f) => ({ ...f, symbol: code, ...(name != null ? { name } : {}) }))
  }

  const q = Number(form.quantity) || 0
  const tc = Number(form.totalCost) || 0
  const perUnit = q && tc ? tc / q : null

  function submit() {
    onSave({
      category: form.category,
      name: form.name.trim() || form.symbol.trim() || '未命名',
      symbol: form.symbol.trim(),
      currency: form.currency,
      quantity: Number(form.quantity) || 0,
      price: cashLike ? 1 : Number(form.price) || 0,
      totalCost: cashLike ? undefined : (Number(form.totalCost) || undefined),
      buyDate: cashLike ? undefined : (form.buyDate || undefined),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editing ? '編輯' : '新增'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <label className="field">
          <span>分類</span>
          <select value={form.category} onChange={(e) => changeCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            <span>代號{!cashLike ? '（用來抓報價）' : '（選填）'}</span>
            {HAS_SEARCH[form.category] ? (
              <SymbolSearch
                category={form.category}
                value={form.symbol}
                onPick={pickSymbol}
                placeholder={SYMBOL_HINT[form.category]}
              />
            ) : (
              <input value={form.symbol} onChange={(e) => set('symbol', e.target.value)} placeholder={SYMBOL_HINT[form.category] || ''} />
            )}
          </label>
          <label className="field">
            <span>名稱</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="選代號會自動帶入，可自己改" />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>{cashLike ? '金額' : '數量（股/顆）'}</span>
            <input type="number" inputMode="decimal" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="0" />
          </label>
          {!cashLike && (
            <label className="field">
              <span>現價（沒抓到時才用）</span>
              <input type="number" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0" />
            </label>
          )}
          <label className="field currency-field">
            <span>幣別</span>
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              <option value="TWD">TWD</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        {!cashLike && (
          <>
            <div className="field-row">
              <label className="field">
                <span>總投入成本（選填）</span>
                <input type="number" inputMode="decimal" value={form.totalCost} onChange={(e) => set('totalCost', e.target.value)} placeholder="這筆總共花了多少" />
              </label>
              <label className="field">
                <span>買入日期（選填）</span>
                <input type="date" value={form.buyDate} onChange={(e) => set('buyDate', e.target.value)} />
              </label>
            </div>
            <p className="hint">
              {perUnit != null
                ? <>成本單價 ≈ <b>{perUnit.toLocaleString('en-US', { maximumFractionDigits: 4 })} {form.currency}</b>（總投入 ÷ 數量）。</>
                : <>同一檔不同時間買的，分開新增即可各自看報酬，明細會收在同一個大項下。</>}
            </p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>{editing ? '儲存' : '新增'}</button>
        </div>
      </div>
    </div>
  )
}
