// 前端自動報價。回傳一張 { 'crypto:BTC': 98000, 'tw_stock:2330': 1050, ... } 對照表，
// 以及一張同格式的「今日漲跌幅」對照表（changePct，小數，例 0.023 = +2.3%），
// 抓不到的代號就不會出現在 changePct 裡，前端會顯示「—」。
// 加密貨幣與匯率瀏覽器直接抓；美股/基金透過自家 Supabase Edge Function 代抓；
// 台股讀 public/prices.json（GitHub Actions 排程產生），也是美股/基金的備援快取。

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

const BINANCE_24H = 'https://data-api.binance.vision/api/v3/ticker/24hr'
const BINANCE_PRICE = 'https://data-api.binance.vision/api/v3/ticker/price'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'

// 把持倉裡的加密貨幣代號轉成 Binance 交易對，例如 BTC -> BTCUSDT
function toPair(symbol) {
  const s = String(symbol || '').toUpperCase()
  return s.endsWith('USDT') ? s : s + 'USDT'
}

// 24hr ticker 一次就有現價和今日漲跌幅兩個資訊
async function fetchCrypto24h(symbol) {
  const pair = toPair(symbol)
  const res = await fetch(`${BINANCE_24H}?symbol=${pair}`)
  if (!res.ok) throw new Error(`${pair} ${res.status}`)
  const j = await res.json()
  return { price: Number(j.lastPrice), changePct: Number(j.priceChangePercent) / 100 }
}

// 查單一顆幣的即時價（供新增表單用）。跟 loadPrices 不同，這裡不受限於「已存在的持倉」，
// 打了什麼代號就查什麼，這樣新增一顆全新的幣時也能立刻看到現價。
export async function fetchOneCryptoPrice(symbol) {
  const s = String(symbol || '').toUpperCase().trim()
  if (!s) return null
  if (s === 'USDT') return 1
  try {
    const res = await fetch(`${BINANCE_PRICE}?symbol=${toPair(s)}`)
    if (!res.ok) return null
    const j = await res.json()
    const price = Number(j.price)
    return Number.isNaN(price) ? null : price
  } catch {
    return null
  }
}

// 美股報價、基金淨值：瀏覽器不能直連 Stooq / MoneyDJ（CORS 實測確認被擋），
// 改由我們自己的 Supabase Edge Function 在伺服器端代抓，這樣使用者一上線就是最新價。
// Edge Function 掛掉或還沒部署時，會自動退回 GitHub Actions 排程寫進 prices.json 的快取價。
async function fetchViaEdge(usSymbols, fundSymbols) {
  if (!SUPABASE_URL || (!usSymbols.length && !fundSymbols.length)) return null
  const res = await fetch(`${SUPABASE_URL}/functions/v1/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ us: usSymbols, fund: fundSymbols }),
  })
  if (!res.ok) throw new Error(`Edge Function HTTP ${res.status}`)
  return res.json()
}

export async function fetchOneUsStockPrice(symbol) {
  const s = String(symbol || '').toUpperCase().trim()
  if (!s) return null
  try {
    const j = await fetchViaEdge([s], [])
    return j?.us?.[s] ?? null
  } catch {
    return null
  }
}

export async function fetchOneFundPrice(code) {
  const c = String(code || '').toUpperCase().trim()
  if (!c) return null
  try {
    const j = await fetchViaEdge([], [c])
    return j?.fund?.[c] ?? null
  } catch {
    return null
  }
}

export async function loadPrices(holdings) {
  const out = { prices: {}, changePct: {}, fxUsdTwd: null, fxRates: null, stockUpdatedAt: null, errors: [] }

  // ---- 匯率：一次抓回「相對 USD」的完整匯率表，可換算任何幣別 ----
  try {
    const res = await fetch(FX_URL)
    const j = await res.json()
    const twd = j?.rates?.TWD
    if (twd) {
      out.fxUsdTwd = Number(twd)
      out.fxRates = j.rates
    } else throw new Error('回應中沒有 TWD')
  } catch (e) {
    out.errors.push('匯率抓取失敗：' + e.message)
  }

  // ---- 加密貨幣（逐一抓，單一失敗不影響其他）----
  const cryptoSymbols = [
    ...new Set(
      holdings
        .filter((h) => h.category === 'crypto' && h.symbol)
        .map((h) => String(h.symbol).toUpperCase())
    ),
  ]
  // USDT 是穩定幣，固定視為 1 美元，不用打 API（也沒有 USDTUSDT 這種交易對），今日漲跌固定 0
  for (const s of cryptoSymbols) {
    if (s === 'USDT') { out.prices['crypto:USDT'] = 1; out.changePct['crypto:USDT'] = 0 }
  }
  const toFetch = cryptoSymbols.filter((s) => s !== 'USDT')
  if (toFetch.length) {
    const results = await Promise.allSettled(toFetch.map((s) => fetchCrypto24h(s)))
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && !Number.isNaN(r.value.price)) {
        out.prices[`crypto:${toFetch[i]}`] = r.value.price
        if (!Number.isNaN(r.value.changePct)) out.changePct[`crypto:${toFetch[i]}`] = r.value.changePct
      } else {
        out.errors.push(`加密貨幣 ${toFetch[i]} 抓取失敗`)
      }
    })
  }

  // ---- 台股 / 美股 / 基金：先讀 prices.json（排程產生，也是 Edge Function 失敗時的備援）----
  try {
    const url = import.meta.env.BASE_URL + 'prices.json'
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      for (const [sym, price] of Object.entries(j.tw_stock || {})) {
        out.prices[`tw_stock:${sym.toUpperCase()}`] = Number(price)
      }
      for (const [sym, pct] of Object.entries(j.tw_stock_chg || {})) {
        out.changePct[`tw_stock:${sym.toUpperCase()}`] = Number(pct)
      }
      for (const [sym, price] of Object.entries(j.us_stock || {})) {
        out.prices[`us_stock:${sym.toUpperCase()}`] = Number(price)
      }
      for (const [sym, nav] of Object.entries(j.fund || {})) {
        out.prices[`fund:${sym.toUpperCase()}`] = Number(nav)
      }
      out.stockUpdatedAt = j.updatedAt || null
    }
  } catch {
    // prices.json 不存在或格式錯誤：退回手動價，不算錯誤
  }

  // ---- 美股 / 基金：透過自家 Edge Function 取得「此刻」的最新價，覆蓋掉上面的快取 ----
  const usSymbols = [
    ...new Set(holdings.filter((h) => h.category === 'us_stock' && h.symbol).map((h) => String(h.symbol).toUpperCase())),
  ]
  const fundSymbols = [
    ...new Set(holdings.filter((h) => h.category === 'fund' && h.symbol).map((h) => String(h.symbol).toUpperCase())),
  ]
  if (usSymbols.length || fundSymbols.length) {
    try {
      const j = await fetchViaEdge(usSymbols, fundSymbols)
      for (const [sym, price] of Object.entries(j?.us || {})) {
        if (Number.isFinite(Number(price))) out.prices[`us_stock:${sym.toUpperCase()}`] = Number(price)
      }
      for (const [sym, pct] of Object.entries(j?.usChg || {})) {
        if (Number.isFinite(Number(pct))) out.changePct[`us_stock:${sym.toUpperCase()}`] = Number(pct)
      }
      for (const [sym, nav] of Object.entries(j?.fund || {})) {
        if (Number.isFinite(Number(nav))) out.prices[`fund:${sym.toUpperCase()}`] = Number(nav)
      }
      // 這些代號連快取都沒有、Edge 也沒查到，才提示使用者
      for (const s of usSymbols) if (out.prices[`us_stock:${s}`] == null) out.errors.push(`美股 ${s} 抓不到報價`)
      for (const s of fundSymbols) if (out.prices[`fund:${s}`] == null) out.errors.push(`基金 ${s} 抓不到淨值`)
    } catch {
      // Edge Function 失敗就沿用上面的快取價，不干擾使用
    }
  }

  return out
}
