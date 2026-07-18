// 資產分類定義。category 用字串，未來加「黃金 / 基金 / 美債」只要在這裡多一列。
export const CATEGORIES = [
  { key: 'tw_stock', label: '台股', defaultCurrency: 'TWD', color: '#2F80B4' },
  { key: 'us_stock', label: '美股', defaultCurrency: 'USD', color: '#7856C9' },
  { key: 'crypto', label: '加密貨幣', defaultCurrency: 'USD', color: '#E19A3C' },
  { key: 'fund', label: '基金', defaultCurrency: 'TWD', color: '#1B9C8E' },
  { key: 'cash', label: '現金 / 外幣', defaultCurrency: 'TWD', color: '#12A67A' },
  { key: 'bank', label: '銀行', defaultCurrency: 'TWD', color: '#5B78E5' },
  { key: 'debt', label: '負債', defaultCurrency: 'TWD', color: '#E05B5B' },
]

export const catLabel = (k) => CATEGORIES.find((c) => c.key === k)?.label ?? k
export const catColor = (k) => CATEGORIES.find((c) => c.key === k)?.color ?? '#888'
export const catDefaultCurrency = (k) => CATEGORIES.find((c) => c.key === k)?.defaultCurrency ?? 'TWD'

// 台股 ETF 代碼判斷（台灣 ETF 代碼慣例以「00」開頭，如 0050、00631L）。
// 這是代碼規則判斷，不是完美的官方分類，但足夠用來篩選搜尋清單。
export const isEtfCode = (code) => /^00/.test(String(code || '').trim())

// 分類層級的「現金型」：金額直接輸入，不需要數量×單價，也沒有成本/報酬概念。
export const isCashLike = (k) => k === 'cash' || k === 'bank' || k === 'debt'

// 單筆層級的「現金型」：多了「加密貨幣─交易所」這個特例——
// 那是放在交易所拿去打合約/網格的資金，用法跟現金一樣（填金額，不綁定某顆幣的價格）。
export const holdingIsCashLike = (h) =>
  isCashLike(h.category) || (h.category === 'crypto' && h.subtype === 'exchange')

// 穩定幣（目前僅 USDT）視為約當現金：固定 1:1，不追蹤成本/報酬率
const STABLECOINS = ['USDT']
export const isStablecoin = (h) =>
  h.category === 'crypto' && h.subtype !== 'exchange' && STABLECOINS.includes(String(h.symbol || '').toUpperCase())

// 市場報價的幣別是「固定的」，由資料來源決定，跟使用者填的成本幣別無關：
// 台股報價來自證交所（台幣），加密貨幣報價來自 Binance（美元）。
export const QUOTE_CURRENCY = { tw_stock: 'TWD', us_stock: 'USD', crypto: 'USD' }
// 基金沒有統一的報價來源，幣別由使用者自己選（跟成本幣別是同一個欄位），其餘分類固定
export function quoteCurrencyOf(category, h) {
  if (category === 'fund') return h?.currency || 'TWD'
  return QUOTE_CURRENCY[category] || 'TWD'
}

// 報價對照表的 key：分類:代號（代號轉大寫）
export const priceKey = (h) => `${h.category}:${String(h.symbol || '').toUpperCase()}`

export const hasLivePrice = (h, prices) =>
  !holdingIsCashLike(h) && prices && prices[priceKey(h)] != null

// 這一筆實際使用的單價（單位是該分類的報價幣別）：
// 有自動報價就用它，否則退回手動填的價
export function effectiveUnitPrice(h, prices) {
  if (holdingIsCashLike(h)) return 1
  if (isStablecoin(h)) return 1
  const live = prices ? prices[priceKey(h)] : null
  if (live != null && !Number.isNaN(Number(live))) return Number(live)
  return Number(h.price || 0)
}

// 把任意幣別的金額換成台幣的匯率。優先用完整匯率表（fxRates，來自 open.er-api，
// 支援日圓/歐元/人民幣等多幣別）；表還沒抓到時，USD 退回單一的 fx 數字。
export function rateToTwd(currency, fx, fxRates) {
  if (currency === 'TWD') return 1
  if (fxRates && fxRates.TWD && fxRates[currency]) return fxRates.TWD / fxRates[currency]
  if (currency === 'USD') return Number(fx || 0)
  return 0 // 匯率表還沒載入、且不是 USD：暫時無法換算，等下次抓到匯率會自動修正
}

// 單筆現值換算成台幣。
export function holdingValueTwd(h, fx, prices, fxRates) {
  if (holdingIsCashLike(h)) {
    const native = Number(h.quantity || 0)
    const rate = rateToTwd(h.currency, fx, fxRates)
    const sign = h.category === 'debt' ? -1 : 1
    return native * rate * sign
  }
  const native = Number(h.quantity || 0) * effectiveUnitPrice(h, prices)
  const rate = rateToTwd(quoteCurrencyOf(h.category, h), fx, fxRates)
  return native * rate
}

// ---------- 成本 / 損益（統一用台幣比較）----------
export const lotCost = (h) => Number(h.totalCost || 0)
export const hasCost = (h) =>
  !holdingIsCashLike(h) && !isStablecoin(h) && lotCost(h) > 0 && Number(h.quantity || 0) > 0
export const costPerUnit = (h) => {
  const q = Number(h.quantity || 0)
  return q ? lotCost(h) / q : 0
}

// 成本換算成台幣：用使用者填的「成本幣別」(h.currency，僅 TWD/USD) 換算
export function lotCostTwd(h, fx) {
  if (!hasCost(h)) return 0
  const rate = h.currency === 'USD' ? Number(fx || 0) : 1
  return lotCost(h) * rate
}

// 單筆損益／報酬率（台幣基準）
export function lotPnlTwd(h, fx, prices) {
  if (!hasCost(h)) return null
  return holdingValueTwd(h, fx, prices) - lotCostTwd(h, fx)
}
export function lotRoi(h, fx, prices) {
  if (!hasCost(h)) return null
  const c = lotCostTwd(h, fx)
  return c ? lotPnlTwd(h, fx, prices) / c : null
}

// 彙總：總資產、總負債、淨值，各類別（僅資產）金額
export function summarize(holdings, fx, prices, fxRates) {
  let totalAsset = 0
  let totalDebt = 0
  const byCat = {}
  for (const h of holdings) {
    const v = holdingValueTwd(h, fx, prices, fxRates)
    if (h.category === 'debt') totalDebt += Math.abs(v)
    else {
      totalAsset += v
      byCat[h.category] = (byCat[h.category] || 0) + v
    }
  }
  return { totalAsset, totalDebt, netWorth: totalAsset - totalDebt, byCat }
}

// 未實現損益（只計有填成本的部位，台幣加總）
export function summarizePnl(holdings, fx, prices) {
  let costTwd = 0
  let valueTwd = 0
  for (const h of holdings) {
    if (!hasCost(h)) continue
    costTwd += lotCostTwd(h, fx)
    valueTwd += holdingValueTwd(h, fx, prices)
  }
  const pnlTwd = valueTwd - costTwd
  return { costTwd, valueTwd, pnlTwd, roi: costTwd ? pnlTwd / costTwd : null, hasAny: costTwd > 0 }
}

// 同一檔（多筆買入）的彙總
export function symbolAgg(lots, fx, prices) {
  let qty = 0
  let valueTwd = 0
  let costTwd = 0
  let pnlTwd = 0
  let anyCost = false
  for (const h of lots) {
    qty += Number(h.quantity || 0)
    valueTwd += holdingValueTwd(h, fx, prices)
    if (hasCost(h)) {
      anyCost = true
      costTwd += lotCostTwd(h, fx)
      pnlTwd += lotPnlTwd(h, fx, prices)
    }
  }
  const roi = anyCost && costTwd ? pnlTwd / costTwd : null
  return { qty, valueTwd, costTwd, pnlTwd: anyCost ? pnlTwd : null, roi, anyCost }
}

// ---------- 格式化 ----------
export const fmtTwd = (n) => 'NT$ ' + Math.round(Number(n || 0)).toLocaleString('en-US')
export const fmtNum = (n) =>
  Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
// 持股數量（股票股數／加密貨幣顆數）不受上面兩位小數限制，小額加密貨幣才不會顯示成 0
export const fmtQty = (n) =>
  Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 8 })
// 數量單位：台股「股」、加密貨幣「顆」，其他分類沒有單位
export const qtyUnit = (category) => {
  if (category === 'tw_stock' || category === 'us_stock') return '股'
  if (category === 'crypto') return '顆'
  if (category === 'fund') return '單位'
  return ''
}
export const fmtPct = (r) =>
  r == null ? '—' : (r >= 0 ? '+' : '-') + Math.abs(r * 100).toFixed(1) + '%'
export const fmtSignedTwd = (n) =>
  n == null ? '—' : (n >= 0 ? '+' : '-') + 'NT$' + Math.abs(Math.round(n)).toLocaleString('en-US')
