import { useState, useEffect, useMemo } from 'react'
import {
  CATEGORIES, catLabel, catColor, holdingIsCashLike, quoteCurrencyOf,
  rateToTwd, fmtNum, fmtQty, qtyUnit, priceKey,
} from '../calc'
import { groupBySymbol } from '../grouping'
import { IconChip } from '../icons'
import { fetchOneCryptoPrice, fetchOneUsStockPrice, fetchOneFundPrice } from '../prices'
import SymbolSearch from './SymbolSearch'
import NumberPad from './NumberPad'

// 可以當「錢的來源／去處」的項目：銀行、現金、加密貨幣交易所資金
const isAccount = (h) =>
  h.category === 'bank' || h.category === 'cash' || (h.category === 'crypto' && h.subtype === 'exchange')

// 可買賣的分類（有報價、有股數概念的）
const TRADABLE = ['tw_stock', 'us_stock', 'crypto', 'fund']

const MODES = [
  ['buy', '買入'],
  ['sell', '賣出'],
  ['move', '轉帳'],
]

// 金額欄位：點一下跳出計算機（跟新增表單同一套操作）
function AmountField({ label, value, currency, onChange, hint }) {
  const [padOpen, setPadOpen] = useState(false)
  return (
    <label className="field">
      <span>{label}{currency ? `（${currency}）` : ''}</span>
      <button type="button" className="calc-trigger" onClick={() => setPadOpen(true)}>
        {value !== '' ? value : <span className="calc-trigger-placeholder">點一下輸入</span>}
      </button>
      {hint && <span className="field-hint">{hint}</span>}
      {padOpen && (
        <NumberPad title={label} value={value} onCommit={onChange} onClose={() => setPadOpen(false)} />
      )}
    </label>
  )
}

function AccountSelect({ label, accounts, value, onChange, excludeId }) {
  const list = accounts.filter((a) => a.id !== excludeId)
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">請選擇</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}（{fmtNum(a.quantity)} {a.currency}）
          </option>
        ))}
      </select>
    </label>
  )
}

export default function TransferForm({ holdings, fx, fxRates, prices, onClose }) {
  const [mode, setMode] = useState('buy')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const accounts = useMemo(() => holdings.filter(isAccount), [holdings])

  // 現有可賣的部位，依分類＋代號分組
  const positions = useMemo(() => {
    const out = []
    for (const cat of TRADABLE) {
      const items = holdings.filter((h) => h.category === cat && !holdingIsCashLike(h))
      for (const [symKey, lots] of groupBySymbol(items)) {
        const qty = lots.reduce((s, h) => s + Number(h.quantity || 0), 0)
        if (qty <= 0) continue
        out.push({ key: `${cat}:${symKey}`, category: cat, symbol: symKey, name: lots[0].name, qty, lots })
      }
    }
    return out
  }, [holdings])

  // ---- 共用欄位 ----
  const [sourceId, setSourceId] = useState('')
  const [destId, setDestId] = useState('')
  const [amount, setAmount] = useState('')     // 買入金額 / 賣出金額 / 轉出金額
  const [amount2, setAmount2] = useState('')   // 轉帳：轉入金額（跨幣別時才需要另外填）
  const [fee, setFee] = useState('')

  // ---- 買入專用 ----
  const [buyCat, setBuyCat] = useState('tw_stock')
  const [buySubtype, setBuySubtype] = useState('')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10))
  const [livePrice, setLivePrice] = useState(null)

  // ---- 賣出專用 ----
  const [posKey, setPosKey] = useState('')
  const [sellQty, setSellQty] = useState('')

  const source = accounts.find((a) => a.id === sourceId)
  const dest = accounts.find((a) => a.id === destId)
  const position = positions.find((p) => p.key === posKey)

  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  // 買入時查一下現價，方便你確認股數／金額有沒有填錯
  useEffect(() => {
    setLivePrice(null)
    if (mode !== 'buy' || !symbol) return
    const cached = prices?.[priceKey({ category: buyCat, symbol })]
    if (cached != null) { setLivePrice(Number(cached)); return }
    const fetcher = buyCat === 'crypto' ? fetchOneCryptoPrice
      : buyCat === 'us_stock' ? fetchOneUsStockPrice
      : buyCat === 'fund' ? fetchOneFundPrice
      : null
    if (!fetcher) return
    let cancelled = false
    const t = setTimeout(() => {
      fetcher(symbol).then((p) => { if (!cancelled && p != null) setLivePrice(p) })
    }, 700)
    return () => { cancelled = true; clearTimeout(t) }
  }, [mode, symbol, buyCat, prices])

  // 轉帳同幣別時，轉入金額自動跟著轉出金額走
  useEffect(() => {
    if (mode === 'move' && source && dest && source.currency === dest.currency) setAmount2(amount)
  }, [mode, amount, source?.currency, dest?.currency])

  const sameCurrency = source && dest && source.currency === dest.currency

  // ---- 摘要與驗證 ----
  let summary = null
  let invalid = ''

  if (mode === 'buy') {
    const gross = num(amount) + num(fee)
    // 成本幣別沿用扣款帳戶；不是台幣/美元的帳戶就依當下匯率換成台幣記錄
    const costCurrency = source && (source.currency === 'TWD' || source.currency === 'USD') ? source.currency : 'TWD'
    const costValue = source && costCurrency !== source.currency
      ? gross * rateToTwd(source.currency, fx, fxRates)
      : gross
    if (!source) invalid = '請選擇扣款帳戶'
    else if (gross <= 0) invalid = '請填買入金額'
    else if (!symbol.trim()) invalid = '請填代號'
    else if (num(qty) <= 0) invalid = '請填數量'
    if (!invalid) {
      summary = (
        <>
          <div>從 <b>{source.name}</b> 扣 <b>{fmtNum(gross)} {source.currency}</b>
            {num(fee) > 0 && <span className="tx-sub">（含手續費 {fmtNum(num(fee))}）</span>}
          </div>
          <div>新增 <b>{name || symbol}</b> {fmtQty(num(qty))} {qtyUnit(buyCat)}，
            成本 <b>{fmtNum(costValue)} {costCurrency}</b></div>
          {livePrice != null && (
            <div className="tx-sub">
              目前現價 {fmtNum(livePrice)} {quoteCurrencyOf(buyCat, { currency: costCurrency })}
              ，你的成本單價 ≈ {fmtNum(gross / num(qty))} {source.currency}
            </div>
          )}
        </>
      )
    }
  }

  if (mode === 'sell') {
    const credit = num(amount) - num(fee)
    if (!position) invalid = '請選擇要賣出的標的'
    else if (num(sellQty) <= 0) invalid = '請填賣出數量'
    else if (num(sellQty) > position.qty + 0.00000001) invalid = `最多只能賣 ${fmtQty(position.qty)} ${qtyUnit(position.category)}`
    else if (!dest) invalid = '請選擇入帳帳戶'
    else if (num(amount) <= 0) invalid = '請填賣出金額'
    if (!invalid) {
      summary = (
        <>
          <div>賣出 <b>{position.name}</b> {fmtQty(num(sellQty))} {qtyUnit(position.category)}
            <span className="tx-sub">（剩 {fmtQty(position.qty - num(sellQty))}）</span>
          </div>
          <div><b>{dest.name}</b> 增加 <b>{fmtNum(credit)} {dest.currency}</b>
            {num(fee) > 0 && <span className="tx-sub">（已扣手續費／稅 {fmtNum(num(fee))}）</span>}
          </div>
        </>
      )
    }
  }

  if (mode === 'move') {
    const out = num(amount) + num(fee)
    if (!source) invalid = '請選擇轉出帳戶'
    else if (!dest) invalid = '請選擇轉入帳戶'
    else if (num(amount) <= 0) invalid = '請填轉出金額'
    else if (!sameCurrency && num(amount2) <= 0) invalid = '請填轉入金額'
    if (!invalid) {
      summary = (
        <>
          <div><b>{source.name}</b> 減少 <b>{fmtNum(out)} {source.currency}</b>
            {num(fee) > 0 && <span className="tx-sub">（含手續費 {fmtNum(num(fee))}）</span>}
          </div>
          <div><b>{dest.name}</b> 增加 <b>{fmtNum(sameCurrency ? num(amount) : num(amount2))} {dest.currency}</b></div>
        </>
      )
    }
  }

  async function submit() {
    if (invalid || busy) return
    setBusy(true)
    setError('')
    try {
      const { store } = await import('../store')
      if (mode === 'buy') {
        const gross = num(amount) + num(fee)
        const costCurrency = source.currency === 'TWD' || source.currency === 'USD' ? source.currency : 'TWD'
        const costValue = costCurrency !== source.currency ? gross * rateToTwd(source.currency, fx, fxRates) : gross
        await store.applyBuy({
          sourceId,
          deduct: gross,
          holding: {
            category: buyCat,
            subtype: buySubtype || undefined,
            name: name.trim() || symbol.trim(),
            symbol: symbol.trim(),
            currency: costCurrency,
            quantity: num(qty),
            price: livePrice != null ? livePrice : 0,
            totalCost: costValue,
            buyDate: buyDate || undefined,
          },
        })
      } else if (mode === 'sell') {
        await store.applySell({
          lots: position.lots,
          sellQty: num(sellQty),
          destId,
          credit: num(amount) - num(fee),
        })
      } else {
        await store.applyTransfer({
          fromId: sourceId,
          fromAmount: num(amount) + num(fee),
          toId: destId,
          toAmount: sameCurrency ? num(amount) : num(amount2),
        })
      }
      onClose()
    } catch (e) {
      setError(e?.message || '操作失敗，請再試一次')
      setBusy(false)
    }
  }

  const noAccounts = accounts.length === 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span />
          <h2>記一筆交易</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <div className="seg tx-modes">
          {MODES.map(([k, label]) => (
            <button key={k} className={mode === k ? 'on' : ''} onClick={() => { setMode(k); setError('') }}>{label}</button>
          ))}
        </div>

        {noAccounts ? (
          <p className="hint">還沒有任何銀行或現金帳戶。先用「＋」新增一個帳戶，才能記錄買入、賣出或轉帳。</p>
        ) : (
          <>
            {mode === 'buy' && (
              <>
                <AccountSelect label="從哪個帳戶扣款" accounts={accounts} value={sourceId} onChange={setSourceId} />
                <div className="field-row">
                  <AmountField label="買入金額" currency={source?.currency} value={amount} onChange={setAmount} />
                  <AmountField label="手續費（選填）" currency={source?.currency} value={fee} onChange={setFee} />
                </div>

                <div className="tx-divider">買什麼</div>

                <label className="field">
                  <span>分類</span>
                  <select value={buyCat} onChange={(e) => { setBuyCat(e.target.value); setSymbol(''); setName(''); setBuySubtype('') }}>
                    {CATEGORIES.filter((c) => TRADABLE.includes(c.key)).map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </label>
                {(buyCat === 'tw_stock' || buyCat === 'us_stock') && (
                  <div className="seg-inline">
                    <button className={buySubtype !== 'etf' ? 'on' : ''} onClick={() => setBuySubtype('stock')}>個股</button>
                    <button className={buySubtype === 'etf' ? 'on' : ''} onClick={() => setBuySubtype('etf')}>ETF</button>
                  </div>
                )}
                <label className="field">
                  <span>代號</span>
                  <SymbolSearch
                    category={buyCat} subtype={buySubtype} value={symbol}
                    onPick={(code, nm) => { if (code != null) setSymbol(code); if (nm != null) setName(nm) }}
                    placeholder="打代號或名稱搜尋"
                  />
                </label>
                <label className="field">
                  <span>名稱</span>
                  <SymbolSearch
                    category={buyCat} subtype={buySubtype} value={name}
                    onPick={(code, nm) => { if (code != null) setSymbol(code); if (nm != null) setName(nm) }}
                    placeholder="打名稱搜尋，或選代號自動帶入" field="name"
                  />
                </label>
                <div className="field-row">
                  <AmountField label={`數量（${qtyUnit(buyCat) || '單位'}）`} value={qty} onChange={setQty} />
                  <label className="field">
                    <span>買入日期</span>
                    <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
                  </label>
                </div>
              </>
            )}

            {mode === 'sell' && (
              <>
                <label className="field">
                  <span>賣出標的</span>
                  <select value={posKey} onChange={(e) => { setPosKey(e.target.value); setSellQty('') }}>
                    <option value="">請選擇</option>
                    {positions.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}（持有 {fmtQty(p.qty)} {qtyUnit(p.category)}）
                      </option>
                    ))}
                  </select>
                </label>
                {positions.length === 0 && <p className="hint">目前沒有可賣出的持倉。</p>}
                <div className="field-row">
                  <AmountField
                    label={`賣出數量（${position ? qtyUnit(position.category) : '股'}）`}
                    value={sellQty} onChange={setSellQty}
                    hint={position ? `持有 ${fmtQty(position.qty)}` : ''}
                  />
                  {position && (
                    <button type="button" className="btn ghost sm tx-all-btn" onClick={() => setSellQty(String(position.qty))}>全部賣出</button>
                  )}
                </div>

                <div className="tx-divider">錢進到哪</div>

                <AccountSelect label="入帳帳戶" accounts={accounts} value={destId} onChange={setDestId} />
                <div className="field-row">
                  <AmountField label="賣出金額" currency={dest?.currency} value={amount} onChange={setAmount} />
                  <AmountField label="手續費／稅（選填）" currency={dest?.currency} value={fee} onChange={setFee} />
                </div>
              </>
            )}

            {mode === 'move' && (
              <>
                <AccountSelect label="從" accounts={accounts} value={sourceId} onChange={setSourceId} excludeId={destId} />
                <div className="field-row">
                  <AmountField label="轉出金額" currency={source?.currency} value={amount} onChange={setAmount} />
                  <AmountField label="手續費（選填）" currency={source?.currency} value={fee} onChange={setFee} />
                </div>
                <AccountSelect label="到" accounts={accounts} value={destId} onChange={setDestId} excludeId={sourceId} />
                {source && dest && !sameCurrency && (
                  <AmountField
                    label="轉入金額" currency={dest.currency} value={amount2} onChange={setAmount2}
                    hint="跨幣別，請填實際入帳的金額"
                  />
                )}
              </>
            )}

            {summary && <div className="tx-summary">{summary}</div>}
            {invalid && <p className="hint tx-invalid">{invalid}</p>}
            {error && <p className="hint danger-text">{error}</p>}

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>取消</button>
              <button className="btn primary" disabled={!!invalid || busy} onClick={submit}>
                {busy ? '處理中…' : '確認'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
