import { useState, useEffect, useRef } from 'react'
import { CATEGORIES, isCashLike, catDefaultCurrency, catColor, quoteCurrencyOf, isStablecoin, priceKey } from '../calc'
import { fetchOneCryptoPrice, fetchOneUsStockPrice, fetchOneFundPrice } from '../prices'
import { CASH_CURRENCIES } from '../currencies'
import { DEBT_TYPES } from '../debtTypes'
import { IconGlyph } from '../icons'
import { evalExpr } from '../calcExpr'
import SymbolSearch from './SymbolSearch'
import BankSearch from './BankSearch'
import IconPicker from './IconPicker'
import NumberPad from './NumberPad'

const initRaw = (v) => (v == null || v === '' ? '' : String(v))

// 可以直接打算式的數字輸入格：例如打 26912-14942，失焦或按 Enter 自動算成 11970。
// 手機聚焦時下方會浮出 + − × ÷ 按鈕（數字鍵盤沒有運算符），並即時顯示 = 結果。
function CalcInput({ value, onCommit, placeholder }) {
  const ref = useRef(null)
  const [raw, setRaw] = useState(initRaw(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => { if (!focused) setRaw(initRaw(value)) }, [value, focused])

  const hasOp = /[+\-*/()]/.test(raw.slice(1)) // 排除單一負號開頭
  const preview = hasOp ? evalExpr(raw) : null

  function commit() {
    const r = evalExpr(raw)
    if (r != null) { setRaw(String(r)); onCommit(String(r)) }
    setFocused(false)
  }

  function insert(ch) {
    const el = ref.current
    if (!el) { setRaw(raw + ch); return }
    const a = el.selectionStart ?? raw.length
    const b = el.selectionEnd ?? raw.length
    const next = raw.slice(0, a) + ch + raw.slice(b)
    setRaw(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + 1, a + 1) })
  }

  return (
    <div className="calc-input">
      <input
        ref={ref} type="text" inputMode="decimal" value={raw} placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur() } }}
      />
      {focused && (
        <div className="calc-ops">
          {[['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']].map(([op, label]) => (
            <button key={op} type="button" className="calc-op" onMouseDown={(e) => { e.preventDefault(); insert(op) }}>{label}</button>
          ))}
          {preview != null && String(preview) !== raw && (
            <span className="calc-preview">= {preview.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          )}
        </div>
      )}
    </div>
  )
}

const blank = {
  category: 'tw_stock', subtype: '', name: '', symbol: '', bankName: '',
  quantity: '', price: '', currency: 'TWD', totalCost: '', buyDate: '', icon: '',
}

const SYMBOL_HINT = {
  tw_stock: '打代號或名稱搜尋', us_stock: '打代號或名稱搜尋，例：AAPL',
  crypto: '打代號或名稱搜尋，例：BTC', fund: '打 MoneyDJ 基金代號，例：ACFT01（暫無自動建議）',
}
const HAS_SEARCH = { tw_stock: true, us_stock: true, crypto: true, fund: true }
const DEBT_LABEL = Object.fromEntries(DEBT_TYPES.map(([k, l]) => [k, l]))

export default function HoldingForm({ editing, template, prices, symbolPrefs, simpleMode, onSave, onClose }) {
  const [step, setStep] = useState(editing || template ? 3 : 1)
  const [form, setForm] = useState(blank)
  const [moreOpen, setMoreOpen] = useState(false)
  const [priceIsLive, setPriceIsLive] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)
  const [padOpen, setPadOpen] = useState(false)
  const [costPadOpen, setCostPadOpen] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        category: editing.category, subtype: editing.subtype ?? '', name: editing.name ?? '',
        symbol: editing.symbol ?? '', bankName: editing.bankName ?? '',
        quantity: editing.quantity ?? '', price: editing.price ?? '',
        currency: editing.currency ?? catDefaultCurrency(editing.category),
        totalCost: editing.totalCost ?? '', buyDate: editing.buyDate ?? '', icon: editing.icon ?? '',
      })
      // 編輯既有資料若本來就有填成本/日期/圖示，「更多」預設展開讓你看得到
      setMoreOpen(!!(editing.totalCost || editing.buyDate || editing.icon))
      setStep(3)
    } else if (template) {
      setForm({
        ...blank, category: template.category, subtype: template.subtype ?? '',
        name: template.name ?? '', symbol: template.symbol ?? '', bankName: template.bankName ?? '',
        currency: template.currency ?? catDefaultCurrency(template.category), icon: template.icon ?? '',
      })
      setMoreOpen(false)
      setStep(3)
    } else {
      setForm(blank)
      setMoreOpen(false)
      setStep(1)
    }
  }, [editing, template])

  const cashLike = isCashLike(form.category)
  const isBank = form.category === 'bank'
  const isExchangeBalance = form.category === 'crypto' && form.subtype === 'exchange'
  const treatAsCashLike = cashLike || isExchangeBalance
  const isStable = isStablecoin({ category: form.category, symbol: form.symbol, subtype: form.subtype })
  const priced = !treatAsCashLike && !isStable

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // ---- 第一步：選大分類 ----
  function pickCategory(cat) {
    setForm({ ...blank, category: cat, currency: catDefaultCurrency(cat) })
    // 現金、基金不需要選細項，直接進細節（基金幣別在第三步的成本幣別欄選就好）
    setStep(cat === 'cash' || cat === 'fund' ? 3 : 2)
  }

  // ---- 第二步：細分類 ----
  const pickSubtype = (subtype) => {
    setForm((f) => ({ ...f, subtype, symbol: '', name: f.symbol ? '' : f.name }))
    setStep(3)
  }
  const pickDebtType = (key) => {
    setForm((f) => {
      const wasAutoFilled = f.name === '' || f.name === DEBT_LABEL[f.subtype]
      return { ...f, subtype: key, name: wasAutoFilled ? DEBT_LABEL[key] : f.name }
    })
    setStep(3)
  }
  const pickBank = (name) => { set('bankName', name); setStep(3) }

  function pickSymbol(code, name) {
    setForm((f) => {
      const next = { ...f }
      if (code != null) next.symbol = code
      if (name != null) next.name = name
      // 記憶上次：同一代號上次用什麼成本幣別，這次自動帶上
      const lookupCode = code != null ? code : f.symbol
      const pref = symbolPrefs?.[`${f.category}:${String(lookupCode).toUpperCase()}`]
      if (pref?.currency) next.currency = pref.currency
      return next
    })
  }

  // 代號有抓到報價時自動帶進現價。
  // 台股走排程快取；加密貨幣瀏覽器可直連 Binance；美股/基金透過自家 Edge Function 代抓。
  // debounce 700ms：避免打字過程中每個字都送出一次請求。
  useEffect(() => {
    setPriceIsLive(false)
    setPriceLoading(false)
    if (!priced || !form.symbol) return
    const category = form.category
    const symbol = form.symbol
    const cached = prices ? prices[priceKey({ category, symbol })] : null
    if (cached != null && !Number.isNaN(Number(cached))) {
      setForm((f) => (f.symbol === symbol && f.category === category ? { ...f, price: String(cached) } : f))
      setPriceIsLive(true)
      return
    }
    const fetcher = category === 'crypto' ? fetchOneCryptoPrice
      : category === 'us_stock' ? fetchOneUsStockPrice
      : category === 'fund' ? fetchOneFundPrice
      : null
    if (!fetcher) return
    let cancelled = false
    const t = setTimeout(() => {
      setPriceLoading(true)
      fetcher(symbol)
        .then((live) => {
          if (cancelled || live == null) return
          setForm((f) => (f.symbol === symbol && f.category === category ? { ...f, price: String(live) } : f))
          setPriceIsLive(true)
        })
        .finally(() => { if (!cancelled) setPriceLoading(false) })
    }, 700)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form.symbol, form.category, prices])

  const q = Number(form.quantity) || 0
  const tc = Number(form.totalCost) || 0
  const perUnit = q && tc ? tc / q : null
  const showManualPrice = priced && form.symbol && !priceIsLive // 抓不到價時才露出現價欄

  function submit() {
    const skipCost = !priced
    onSave({
      category: form.category,
      subtype: form.subtype || undefined,
      name: form.name.trim() || form.symbol.trim() || form.bankName.trim() || '未命名',
      symbol: form.symbol.trim(),
      bankName: isBank ? form.bankName.trim() : undefined,
      currency: form.currency,
      quantity: Number(form.quantity) || 0,
      price: !priced ? 1 : Number(form.price) || 0,
      totalCost: skipCost ? undefined : (Number(form.totalCost) || undefined),
      buyDate: skipCost ? undefined : (form.buyDate || undefined),
      icon: form.icon || undefined,
    })
  }

  const canBack = !editing && !template && step > 1
  const goBack = () => setStep(step === 3 && (form.category === 'cash' || form.category === 'fund') ? 1 : step - 1)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {canBack ? (
            <button className="icon-btn back-btn" onClick={goBack} aria-label="上一步">‹</button>
          ) : <span />}
          <h2>{editing ? '編輯' : step === 1 ? '新增：選分類' : step === 2 ? '新增：選細項' : template ? `加碼：${template.name || template.symbol}` : '新增'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        {/* ---------- 第一步：五大分類 ---------- */}
        {step === 1 && (
          <div className="wizard-grid three">
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
              <span className="wizard-tile-icon"><IconGlyph name="chartUp" /></span><span>個股</span>
            </button>
            <button className="wizard-tile" onClick={() => pickSubtype('etf')}>
              <span className="wizard-tile-icon"><IconGlyph name="goldbar" /></span><span>ETF</span>
            </button>
          </div>
        )}
        {step === 2 && form.category === 'us_stock' && (
          <div className="wizard-grid two">
            <button className="wizard-tile" onClick={() => pickSubtype('stock')}>
              <span className="wizard-tile-icon"><IconGlyph name="chartUp" /></span><span>個股</span>
            </button>
            <button className="wizard-tile" onClick={() => pickSubtype('etf')}>
              <span className="wizard-tile-icon"><IconGlyph name="goldbar" /></span><span>ETF</span>
            </button>
          </div>
        )}

        {step === 2 && form.category === 'crypto' && (
          <>
            <div className="wizard-grid two">
              <button className="wizard-tile" onClick={() => pickSubtype('spot')}>
                <span className="wizard-tile-icon"><IconGlyph name="coin" /></span><span>現貨</span>
              </button>
              <button className="wizard-tile" onClick={() => pickSubtype('exchange')}>
                <span className="wizard-tile-icon"><IconGlyph name="bank" /></span><span>交易所資金</span>
              </button>
            </div>
            <p className="hint">「交易所資金」是放在交易所打合約、網格等策略的錢，填目前總金額即可，跟現金一樣不追蹤成本。</p>
          </>
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
                <span className="wizard-tile-icon"><IconGlyph name={icon} /></span><span>{label}</span>
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
                  {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
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

            {/* 名稱 / 代號 */}
            {treatAsCashLike || isStable ? (
              <label className="field">
                <span>名稱</span>
                <input value={form.name} onChange={(e) => set('name', e.target.value)}
                  placeholder={isBank ? '薪轉戶 / 活存 / 定存' : isExchangeBalance ? 'Binance 合約帳戶 / 網格' : isStable ? 'USDT' : '玉山活存 / 現金'} />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>代號</span>
                  {HAS_SEARCH[form.category] ? (
                    <SymbolSearch category={form.category} subtype={form.subtype} value={form.symbol} onPick={pickSymbol} placeholder={SYMBOL_HINT[form.category]} />
                  ) : (
                    <input value={form.symbol} onChange={(e) => set('symbol', e.target.value)} placeholder={SYMBOL_HINT[form.category] || ''} />
                  )}
                </label>
                <label className="field">
                  <span>名稱</span>
                  {HAS_SEARCH[form.category] ? (
                    <SymbolSearch category={form.category} subtype={form.subtype} value={form.name} onPick={pickSymbol} placeholder="打名稱搜尋，或選代號自動帶入" field="name" />
                  ) : (
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="選代號自動帶入" />
                  )}
                </label>
              </>
            )}

            {/* 數量 / 金額（＋幣別 or 現價） */}
            <div className="field-row">
              <label className="field">
                <span>{treatAsCashLike ? '金額' : isStable ? '數量（顆）' : '數量（股/顆）'}</span>
                <button type="button" className="calc-trigger" onClick={() => setPadOpen(true)}>
                  {form.quantity !== '' ? form.quantity : <span className="calc-trigger-placeholder">點一下輸入</span>}
                </button>
              </label>
              {showManualPrice && (
                <label className="field">
                  <span>現價（{quoteCurrencyOf(form.category, form)}）</span>
                  <CalcInput value={form.price} onCommit={(v) => set('price', v)} placeholder={priceLoading ? '查詢中…' : '抓不到報價，請手動填'} />
                </label>
              )}
              {treatAsCashLike && (
                <label className="field currency-field">
                  <span>幣別</span>
                  <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                    {(form.category === 'cash' ? CASH_CURRENCIES : [['TWD', 'TWD'], ['USD', 'USD']]).map(([code]) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {priced && priceIsLive && (
              <p className="hint ok-hint">✓ 已抓到現價，會自動更新。</p>
            )}
            {priced && priceLoading && (
              <p className="hint">正在查詢報價…（第一次查詢可能要幾秒）</p>
            )}
            {priced && !priceIsLive && !priceLoading && form.symbol && (form.category === 'us_stock' || form.category === 'fund') && (
              <p className="hint">這個代號查不到報價，先手動填現價即可。</p>
            )}
            {isStable && <p className="hint">USDT 視為約當現金，固定 1 美元計價，不追蹤成本。</p>}

            {/* 更多（選填）：成本、日期、圖示 */}
            {(priced || !isStable) && (
              <>
                <button type="button" className="more-toggle" onClick={() => setMoreOpen(!moreOpen)}>
                  <span className={'chev' + (moreOpen ? ' open' : '')} aria-hidden="true">▸</span>
                  更多（選填）
                </button>

                {moreOpen && (
                  <div className="more-body">
                    {priced && !simpleMode && (
                      <>
                        <div className="field-row">
                          <label className="field">
                            <span>總投入成本</span>
                            <button type="button" className="calc-trigger" onClick={() => setCostPadOpen(true)}>
                              {form.totalCost !== '' ? form.totalCost : <span className="calc-trigger-placeholder">點一下輸入</span>}
                            </button>
                          </label>
                          <label className="field currency-field">
                            <span>成本幣別</span>
                            <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                              <option value="TWD">TWD</option>
                              <option value="USD">USD</option>
                            </select>
                          </label>
                        </div>
                        <label className="field">
                          <span>買入日期</span>
                          <input type="date" value={form.buyDate} onChange={(e) => set('buyDate', e.target.value)} />
                        </label>
                        {perUnit != null && (
                          <p className="hint">成本單價 ≈ <b>{perUnit.toLocaleString('en-US', { maximumFractionDigits: 2 })} {form.currency}</b>（總投入 ÷ 數量）。市場報價固定是 {quoteCurrencyOf(form.category, form)}，換算自動處理。</p>
                        )}
                      </>
                    )}

                    {template ? (
                      <div className="field">
                        <span>圖示</span>
                        <div className="icon-locked">
                          <span className="icon-chip" style={{ '--chip-c': catColor(form.category) }}>
                            <IconGlyph name={form.icon} category={form.category} subtype={form.subtype} />
                          </span>
                          <span className="icon-locked-note">跟這組一致，不能更改</span>
                        </div>
                      </div>
                    ) : (
                      <label className="field">
                        <span>圖示（不選就用分類預設）</span>
                        <IconPicker value={form.icon} category={form.category} subtype={form.subtype} onChange={(v) => set('icon', v)} />
                      </label>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>取消</button>
              <button className="btn primary" onClick={submit}>{editing ? '儲存' : '新增'}</button>
            </div>
          </>
        )}
      </div>

      {padOpen && (
        <NumberPad
          title={treatAsCashLike ? '金額' : '數量'}
          value={form.quantity}
          onCommit={(v) => set('quantity', v)}
          onClose={() => setPadOpen(false)}
        />
      )}
      {costPadOpen && (
        <NumberPad
          title="總投入成本"
          value={form.totalCost}
          onCommit={(v) => set('totalCost', v)}
          onClose={() => setCostPadOpen(false)}
        />
      )}
    </div>
  )
}
