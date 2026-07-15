// 資產分類定義。category 用字串，未來加「黃金 / 基金 / 美債」只要在這裡多一列。
export const CATEGORIES = [
  { key: 'tw_stock', label: '台股', defaultCurrency: 'TWD', color: '#2F6FB2' },
  { key: 'us_stock', label: '美股', defaultCurrency: 'USD', color: '#7A5AF0' },
  { key: 'crypto', label: '加密貨幣', defaultCurrency: 'USD', color: '#E0912B' },
  { key: 'cash', label: '現金 / 外幣', defaultCurrency: 'TWD', color: '#0F9D74' },
  { key: 'debt', label: '負債', defaultCurrency: 'TWD', color: '#C2402E' },
]

export const catLabel = (k) => CATEGORIES.find((c) => c.key === k)?.label ?? k
export const catColor = (k) => CATEGORIES.find((c) => c.key === k)?.color ?? '#888'
export const catDefaultCurrency = (k) => CATEGORIES.find((c) => c.key === k)?.defaultCurrency ?? 'TWD'

// 現金與負債是「一筆金額」，不需要數量×單價，也沒有成本/報酬概念
export const isCashLike = (k) => k === 'cash' || k === 'debt'

// 報價對照表的 key：分類:代號（代號轉大寫）
export const priceKey = (h) => `${h.category}:${String(h.symbol || '').toUpperCase()}`

export const hasLivePrice = (h, prices) =>
  !isCashLike(h.category) && prices && prices[priceKey(h)] != null

// 這一筆實際使用的單價：有自動報價就用它，否則退回手動填的價
export function effectiveUnitPrice(h, prices) {
  if (isCashLike(h.category)) return 1
  const live = prices ? prices[priceKey(h)] : null
  if (live != null && !Number.isNaN(Number(live))) return Number(live)
  return Number(h.price || 0)
}

// 單筆換算成台幣（負債為負值）
export function holdingValueTwd(h, fx, prices) {
  const native = isCashLike(h.category)
    ? Number(h.quantity || 0)
    : Number(h.quantity || 0) * effectiveUnitPrice(h, prices)
  const rate = h.currency === 'USD' ? Number(fx || 0) : 1
  const sign = h.category === 'debt' ? -1 : 1
  return native * rate * sign
}

// ---------- 成本 / 損益（原幣計算）----------
// 每筆記錄「總投入金額」totalCost，成本單價 = totalCost / 數量
export const lotCost = (h) => Number(h.totalCost || 0)
export const hasCost = (h) =>
  !isCashLike(h.category) && lotCost(h) > 0 && Number(h.quantity || 0) > 0
export const costPerUnit = (h) => {
  const q = Number(h.quantity || 0)
  return q ? lotCost(h) / q : 0
}
// 原幣現值（不含匯率、不含負債正負）
export function lotValueNative(h, prices) {
  return Number(h.quantity || 0) * effectiveUnitPrice(h, prices)
}
export function lotPnlNative(h, prices) {
  if (!hasCost(h)) return null
  return lotValueNative(h, prices) - lotCost(h)
}
export function lotRoi(h, prices) {
  if (!hasCost(h)) return null
  const c = lotCost(h)
  return c ? (lotValueNative(h, prices) - c) / c : null
}

// 彙總：總資產、總負債、淨值，各類別（僅資產）金額
export function summarize(holdings, fx, prices) {
  let totalAsset = 0
  let totalDebt = 0
  const byCat = {}
  for (const h of holdings) {
    const v = holdingValueTwd(h, fx, prices)
    if (h.category === 'debt') totalDebt += Math.abs(v)
    else {
      totalAsset += v
      byCat[h.category] = (byCat[h.category] || 0) + v
    }
  }
  return { totalAsset, totalDebt, netWorth: totalAsset - totalDebt, byCat }
}

// 未實現損益（只計有填成本的部位，換算成台幣加總）
export function summarizePnl(holdings, fx, prices) {
  let costTwd = 0
  let valueTwd = 0
  for (const h of holdings) {
    if (!hasCost(h)) continue
    const rate = h.currency === 'USD' ? Number(fx || 0) : 1
    costTwd += lotCost(h) * rate
    valueTwd += lotValueNative(h, prices) * rate
  }
  const pnlTwd = valueTwd - costTwd
  return { costTwd, valueTwd, pnlTwd, roi: costTwd ? pnlTwd / costTwd : null, hasAny: costTwd > 0 }
}

// ---------- 格式化 ----------
export const fmtTwd = (n) => 'NT$ ' + Math.round(Number(n || 0)).toLocaleString('en-US')
export const fmtNum = (n) =>
  Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 8 })
export const fmtPct = (r) =>
  r == null ? '—' : (r >= 0 ? '+' : '-') + Math.abs(r * 100).toFixed(1) + '%'
export function fmtSignedNative(n, currency) {
  if (n == null) return '—'
  const unit = currency === 'USD' ? '$' : 'NT$'
  return (n >= 0 ? '+' : '-') + unit + Math.abs(Math.round(n)).toLocaleString('en-US')
}

// ---------- 大項彙總（第 6 版：可展開的持倉大項）----------
// 單筆損益（台幣）
export function lotPnlTwd(h, fx, prices) {
  if (!hasCost(h)) return null
  const rate = h.currency === 'USD' ? Number(fx || 0) : 1
  return (lotValueNative(h, prices) - lotCost(h)) * rate
}

// 同一檔（多筆買入）的彙總
export function symbolAgg(lots, fx, prices) {
  let qty = 0
  let valueTwd = 0
  let costTwd = 0
  let valueCostedTwd = 0
  for (const h of lots) {
    qty += Number(h.quantity || 0)
    valueTwd += holdingValueTwd(h, fx, prices)
    if (hasCost(h)) {
      const rate = h.currency === 'USD' ? Number(fx || 0) : 1
      costTwd += lotCost(h) * rate
      valueCostedTwd += lotValueNative(h, prices) * rate
    }
  }
  const anyCost = costTwd > 0
  const pnlTwd = anyCost ? valueCostedTwd - costTwd : null
  const roi = anyCost ? pnlTwd / costTwd : null
  return { qty, valueTwd, costTwd, pnlTwd, roi, anyCost }
}

export const fmtSignedTwd = (n) =>
  n == null ? '—' : (n >= 0 ? '+' : '-') + 'NT$' + Math.abs(Math.round(n)).toLocaleString('en-US')
