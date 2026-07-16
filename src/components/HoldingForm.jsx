import { useState, useEffect } from 'react'
import { CATEGORIES, isCashLike, catDefaultCurrency, quoteCurrencyOf, isStablecoin, priceKey } from '../calc'
import { fetchOneCryptoPrice } from '../prices'
import { CASH_CURRENCIES } from '../currencies'
import { DEBT_TYPES } from '../debtTypes'
import { IconGlyph } from '../icons'
import SymbolSearch from './SymbolSearch'
import BankSearch from './BankSearch'
import IconPicker from './IconPicker'

const blank = {
  category: 'tw_stock',
  subtype: '',
  name: '',
  symbol: '',
  bankName: '',
  quantity: '',
  price: '',
  currency: 'TWD',
  totalCost: '',
  buyDate: '',
  icon: '',
}

const SYMBOL_HINT = {
  tw_stock: '打代號或名稱搜尋',
  crypto: '打代號或名稱搜尋，例：BTC',
}

const HAS_SEARCH = { tw_stock: true, crypto: true }

const DEBT_LABEL = Object.fromEntries(DEBT_TYPES.map(([k, l]) => [k, l]))

export default function HoldingForm({ editing, template, prices, onSave, onClose }) {
  const [step, setStep] = useState(editing || template ? 3 : 1)
  const [form, setForm] = useState(blank)

  useEffect(() => {
    if (editing) {
      setForm({
        category: editing.category,
        subtype: editing.subtype ?? '',
        name: editing.name ?? '',
        symbol: editing.symbol ?? '',
        bankName: editing.bankName ?? '',
        quantity: editing.quantity ?? '',
        price: editing.price ?? '',
        currency: editing.currency ?? catDefaultCurrency(editing.category),
        totalCost: editing.totalCost ?? '',
        buyDate: editing.buyDate ?? '',
        icon: editing.icon ?? '',
      })
      setStep(3)
    } else if (template) {
      // 針對既有的一檔「加碼」：代號/名稱/幣別/圖示都先帶好，直接進到細節，數量/成本/日期留空
      setForm({
        ...blank,
        category: template.category,
        subtype: template.subtype ?? '',
        name: template.name ?? '',
        symbol: template.symbol ?? '',
        bankName: template.bankName ?? '',
        currency: template.currency ?? catDefaultCurrency(template.category),
        icon: template.icon ?? '',
      })
      setStep(3)
    } else {
      setForm(blank)
      setStep(1)
    }
  }, [editing, template])

  const cashLike = isCashLike(form.category)
  const isBank = form.category === 'bank'
  const isExchangeBalance = form.category === 'crypto' && form.subtype === 'exchange'
  const treatAsCashLike = cashLike || isExchangeBalance
  const isStable = isStablecoin({ category: form.category, symbol: form.symbol, subtype: form.subtype })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // ---- 第一步：選大分類 ----
  function pickCategory(cat) {
    setForm({ ...blank, category: cat, currency: catDefaultCurrency(cat) })
    setStep(2)
  }

  // ---- 第二步：選細分類 ----
  function pickSubtype(subtype) {
    set('subtype', subtype)
    setStep(3)
  }
  function pickDebtType(key) {
    setForm((f) => ({ ...f, subtype: key, name: f.name || DEBT_LABEL[key] }))
    setStep(3)
  }
  function pickCashCurrency(code) {
    set('currency', code)
    setStep(3)
  }
  function pickBank(name) {
    set('bankName', name)
    setStep(3)
  }

  function pickSymbol(code, name) {
    setForm((f) => ({ ...f, symbol: code, ...(name != null ? { name } : {}) }))
  }

  // 代號有抓到報價時，自動把數字帶進「現價」欄。
  // 台股報價是整包預先抓好的（prices 裡查得到就直接用）；
  // 加密貨幣只有「已存在的持倉」才會被整批抓，新增一顆全新的幣時 prices 裡還沒有，
  // 這裡改成主動去查那一顆的即時價（debounce 400ms，避免打字時每個字都打 API）。
  const [priceIsLive, setPriceIsLive] = useState(false)
  useEffect(() => {
    setPriceIsLive(false)
    if (treatAsCashLike || isStable || !form.symbol) return
    const category = form.category
    const symbol = form.symbol

    const cached = prices ? prices[priceKey({ category, symbol })] : null
    if (cached != null && !Number.isNaN(Number(cached))) {
      setForm((f) => (f.symbol === symbol && f.category === category ? { ...f, price: String(cached) } : f))
      setPriceIsLive(true)
      return
    }

    if (category !== 'crypto') return
    const t = setTimeout(() => {
      fetchOneCryptoPrice(symbol).then((live) => {
        if (live == null) return
        setForm((f) => (f.symbol === symbol && f.category === category ? { ...f, price: String(live) } : f))
        setPriceIsLive(true)
      })
    }, 400)
    return () => clearTimeout(t)
  }, [form.symbol, form.category, prices])

  const q = Number(form.quantity) || 0
  const tc = Number(form.totalCost) || 0
  const perUnit = q && tc ? tc / q : null

  function submit() {
    const skipCost = treatAsCashLike || isStable
    onSave({
      category: form.category,
      subtype: form.subtype || undefined,
      name: form.name.trim() || form.symbol.trim() || form.bankName.trim() || '未命名',
      symbol: form.symbol.trim(),
      bankName: isBank ? form.bankName.trim() : undefined,
      currency: form.currency,
      quantity: Number(form.quantity) || 0,
      price: treatAsCashLike ? 1 : Number(form.price) || 0,
      totalCost: skipCost ? undefined : (Number(form.totalCost) || undefined),
      buyDate: skipCost ? undefined : (form.buyDate || undefined),
      icon: form.icon || undefined,
    })
  }

  const canBack = !editing && step > 1

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {canBack ? (
            <button className="icon-btn back-btn" onClick={() => setStep(step - 1)} aria-label="上一步">‹</button>
          ) : <span />}
          <h2>{editing ? '編輯' : step === 1 ? '新增：選分類' : step === 2 ? '新增：選細項' : template ? `加碼：${template.name || template.symbol}` : '新增'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        {/* ---------- 第一步：五個大分類 ---------- */}
        {step === 1 && (
          <div className="wizard-grid">
            {CATEGORIES.map((c) => (
              <button key={c.key} className="wizard-tile" onClick={() => pickCategory(c.key)}>
                <span className="wizard-tile-icon" style={{ color: c.color }}><IconGlyph category={c.key} /></span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ---------- 第二步：細分類 ---------- */}
        {step === 2 && form.category === 'tw_stock' && (
          <div className="wizard-grid two">
            <button className="wizard-tile" onClick={() => pickSubtype('stock')}>
              <span className="wizard-tile-icon"><IconGlyph name="chartUp" /></span>
              <span>個股</span>
            </button>
            <button className="wizard-tile" onClick={() => pickSubtype('etf')}>
              <span className="wizard-tile-icon"><IconGlyph name="chest" /></span>
              <span>ETF</span>
            </button>
          </div>
        )}

        {step === 2 && form.category === 'crypto' && (
          <div className="wizard-grid two">
            <button className="wizard-tile" onClick={() => pickSubtype('spot')}>
              <span className="wizard-tile-icon"><IconGlyph name="coin" /></span>
              <span>現貨</span>
            </button>
            <button className="wizard-tile" onClick={() => pickSubtype('exchange')}>
              <span className="wizard-tile-icon"><IconGlyph name="safe" /></span>
              <span>交易所資金</span>
            </button>
          </div>
        )}
        {step === 2 && form.category === 'crypto' && (
          <p className="hint">「交易所資金」是放在交易所拿去打合約、網格等策略的錢，就填目前總金額，跟現金一樣不追蹤成本。</p>
        )}

        {step === 2 && form.category === 'cash' && (
          <div className="wizard-grid three">
            {CASH_CURRENCIES.map(([code, label]) => (
              <button key={code} className="wizard-tile small" onClick={() => pickCashCurrency(code)}>
                <span className="wizard-tile-code">{code}</span>
                <span className="wizard-tile-sub">{label}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && form.category === 'bank' && (
          <label className="field">
            <span>選銀行</span>
            <BankSearch value={form.bankName} onChange={(v) => set('bankName', v)} onSelect={pickBank} placeholder="打名稱搜尋，例：國泰世華" autoFocus />
          </label>
        )}

        {step === 2 && form.category === 'debt' && (
          <div className="wizard-grid three">
            {DEBT_TYPES.map(([key, label, icon]) => (
              <button key={key} className="wizard-tile small" onClick={() => pickDebtType(key)}>
                <span className="wizard-tile-icon"><IconGlyph name={icon} /></span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ---------- 第三步：詳細資料 ---------- */}
        {step === 3 && (
          <>
            {editing && (
              <label className="field">
                <span>分類</span>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, currency: catDefaultCurrency(e.target.value), subtype: '' }))}>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}

            {editing && form.category === 'tw_stock' && (
              <div className="seg-inline">
                <button className={form.subtype === 'etf' ? 'on' : ''} onClick={() => set('subtype', 'stock')}>個股</button>
                <button className={form.subtype === 'etf' ? 'on' : ''} onClick={() => set('subtype', 'etf')}>ETF</button>
              </div>
            )}
            {editing && form.category === 'crypto' && (
              <div className="seg-inline">
                <button className={form.subtype !== 'exchange' ? 'on' : ''} onClick={() => set('subtype', 'spot')}>現貨</button>
                <button className={form.subtype === 'exchange' ? 'on' : ''} onClick={() => set('subtype', 'exchange')}>交易所資金</button>
              </div>
            )}
            {editing && form.category === 'debt' && (
              <div className="seg-inline wrap">
                {DEBT_TYPES.map(([key, label]) => (
                  <button key={key} className={form.subtype === key ? 'on' : ''} onClick={() => set('subtype', key)}>{label}</button>
                ))}
              </div>
            )}

            {(editing || template) && isBank && (
              <label className="field">
                <span>銀行</span>
                <BankSearch value={form.bankName} onChange={(v) => set('bankName', v)} placeholder="打名稱搜尋，例：國泰世華" />
              </label>
            )}

            {treatAsCashLike ? (
              <label className="field">
                <span>名稱</span>
                <input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder={isBank ? '薪轉戶 / 活存 / 定存' : isExchangeBalance ? 'Binance 合約帳戶 / 網格機器人' : '玉山活存 / 房貸 / 現金'}
                />
              </label>
            ) : (
              <div className="field-row">
                <label className="field">
                  <span>代號（用來抓報價）</span>
                  {HAS_SEARCH[form.category] ? (
                    <SymbolSearch
                      category={form.category}
                      subtype={form.subtype}
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
            )}

            <div className="field-row">
              <label className="field">
                <span>{treatAsCashLike ? '金額' : '數量（股/顆）'}</span>
                <input type="number" inputMode="decimal" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="0" />
              </label>
              {!treatAsCashLike && !isStable && (
                <label className="field">
                  <span>
                    現價（{quoteCurrencyOf(form.category)}）
                    {priceIsLive ? <span className="live-tag inline">已抓到</span> : '，沒抓到時才用'}
                  </span>
                  <input type="number" inputMode="decimal" value={form.price} onChange={(e) => { setPriceIsLive(false); set('price', e.target.value) }} placeholder="0" />
                </label>
              )}
              {isStable && (
                <label className="field">
                  <span>現價</span>
                  <input value="1 USDT ≈ 1 美元" disabled />
                </label>
              )}
              <label className="field currency-field">
                <span>{treatAsCashLike ? '幣別' : '成本幣別'}</span>
                <select value={form.currency} onChange={(e) => set('currency', e.target.value)} disabled={isStable}>
                  {(form.category === 'cash' ? CASH_CURRENCIES : [['TWD', 'TWD'], ['USD', 'USD']]).map(([code]) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>

            {isStable ? (
              <p className="hint">USDT 是穩定幣，視為約當現金，固定以 1 美元計價，不追蹤成本與報酬率。</p>
            ) : !treatAsCashLike && (
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
                    ? <>成本單價 ≈ <b>{perUnit.toLocaleString('en-US', { maximumFractionDigits: 4 })} {form.currency}</b>（總投入 ÷ 數量）。市場報價固定是 <b>{quoteCurrencyOf(form.category)}</b>，跟成本幣別無關，換算會自動處理。</>
                    : <>「成本幣別」是指你實際花了多少錢買、用哪個幣別付的。市場報價固定是 <b>{quoteCurrencyOf(form.category)}</b>，系統會自動換算。同一檔不同時間買的，分開新增即可各自看報酬。</>}
                </p>
              </>
            )}

            <label className="field">
              <span>圖示（選填，不選就用分類預設）</span>
              <IconPicker value={form.icon} category={form.category} subtype={form.subtype} onChange={(v) => set('icon', v)} />
            </label>

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>取消</button>
              <button className="btn primary" onClick={submit}>{editing ? '儲存' : '新增'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
