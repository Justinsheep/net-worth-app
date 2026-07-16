// 前端自動報價。回傳一張 { 'crypto:BTC': 98000, 'tw_stock:2330': 1050, ... } 對照表，
// 以及 USD/TWD 匯率。加密貨幣與匯率由瀏覽器直接抓（即時）；
// 台股/美股讀取 public/prices.json（由 npm run prices 或 GitHub Actions 產生）。

const BINANCE = 'https://data-api.binance.vision/api/v3/ticker/price'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'

// 把持倉裡的加密貨幣代號轉成 Binance 交易對，例如 BTC -> BTCUSDT
function toPair(symbol) {
  const s = String(symbol || '').toUpperCase()
  return s.endsWith('USDT') ? s : s + 'USDT'
}

async function fetchCryptoPrice(symbol) {
  const pair = toPair(symbol)
  const res = await fetch(`${BINANCE}?symbol=${pair}`)
  if (!res.ok) throw new Error(`${pair} ${res.status}`)
  const j = await res.json()
  return Number(j.price)
}

// 查單一顆幣的即時價（供新增表單用）。跟 loadPrices 不同，這裡不受限於「已存在的持倉」，
// 打了什麼代號就查什麼，這樣新增一顆全新的幣時也能立刻看到現價。
export async function fetchOneCryptoPrice(symbol) {
  const s = String(symbol || '').toUpperCase().trim()
  if (!s) return null
  if (s === 'USDT') return 1
  try {
    const price = await fetchCryptoPrice(s)
    return Number.isNaN(price) ? null : price
  } catch {
    return null
  }
}

export async function loadPrices(holdings) {
  const out = { prices: {}, fxUsdTwd: null, fxRates: null, stockUpdatedAt: null, errors: [] }

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
  // USDT 是穩定幣，固定視為 1 美元，不用打 API（也沒有 USDTUSDT 這種交易對）
  for (const s of cryptoSymbols) {
    if (s === 'USDT') out.prices['crypto:USDT'] = 1
  }
  const toFetch = cryptoSymbols.filter((s) => s !== 'USDT')
  if (toFetch.length) {
    const results = await Promise.allSettled(toFetch.map((s) => fetchCryptoPrice(s)))
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && !Number.isNaN(r.value)) {
        out.prices[`crypto:${toFetch[i]}`] = r.value
      } else {
        out.errors.push(`加密貨幣 ${toFetch[i]} 抓取失敗`)
      }
    })
  }

  // ---- 台股 / 美股：讀 prices.json（可能還沒產生，屬正常）----
  try {
    const url = import.meta.env.BASE_URL + 'prices.json'
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      for (const [sym, price] of Object.entries(j.tw_stock || {})) {
        out.prices[`tw_stock:${sym.toUpperCase()}`] = Number(price)
      }
      out.stockUpdatedAt = j.updatedAt || null
    }
  } catch {
    // prices.json 不存在或格式錯誤：台股/美股就退回手動價，不算錯誤
  }

  return out
}
