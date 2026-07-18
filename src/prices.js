// 前端自動報價。回傳一張 { 'crypto:BTC': 98000, 'tw_stock:2330': 1050, ... } 對照表，
// 以及一張同格式的「今日漲跌幅」對照表（changePct，小數，例 0.023 = +2.3%），
// 抓不到的代號就不會出現在 changePct 裡，前端會顯示「—」。
// 加密貨幣/美股與匯率由瀏覽器直接抓（即時）；台股讀取 public/prices.json（GitHub Actions 產生）。

const BINANCE_24H = 'https://data-api.binance.vision/api/v3/ticker/24hr'
const BINANCE_PRICE = 'https://data-api.binance.vision/api/v3/ticker/price'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'
const STOOQ_URL = 'https://stooq.com/q/l/'

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

// Stooq 的 CSV 報價（免金鑰），一次可查多檔，用逗號分隔。查不到的欄位是 N/D。
async function fetchStooqCsv(symbols) {
  const q = symbols.map((s) => `${s.toLowerCase()}.us`).join(',')
  const res = await fetch(`${STOOQ_URL}?s=${encodeURIComponent(q)}&f=sd2t2ohlcv&h&e=csv`)
  if (!res.ok) throw new Error(`stooq ${res.status}`)
  const text = await res.text()
  const lines = text.trim().split('\n').slice(1) // 第一行是欄位標題
  const out = {}
  for (const line of lines) {
    const cols = line.split(',')
    const sym = String(cols[0] || '').replace(/\.US$/i, '').toUpperCase()
    const close = Number(cols[6])
    if (sym && Number.isFinite(close) && close > 0) out[sym] = close
  }
  return out
}

// 查單一檔美股的即時價（供新增表單用，邏輯跟加密貨幣一樣：打什麼代號查什麼）。
// 美股沒有像台股證交所那種「一次拿到全市場」的免費管道，只查你實際用到的代號。
export async function fetchOneUsStockPrice(symbol) {
  const s = String(symbol || '').toUpperCase().trim()
  if (!s) return null
  try {
    const map = await fetchStooqCsv([s])
    return map[s] ?? null
  } catch {
    return null
  }
}

// 基金淨值目前還沒接上——台灣的基金淨值分散在各基金公司/代銷平台，投信投顧公會雖然有公開資料，
// 但我這邊沒辦法連線實際驗證格式，怕接錯顯示出「看起來對、其實錯」的淨值，寧可先讓你手動填。
// 之後找到能驗證過的資料源再補上（介面/成本/報酬全部都已經做好了，只差這個函式）。
export async function fetchOneFundPrice() {
  return null
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

  // ---- 美股（只查你實際持有的代號，一次批次查，減少請求數）----
  const usSymbols = [
    ...new Set(
      holdings
        .filter((h) => h.category === 'us_stock' && h.symbol)
        .map((h) => String(h.symbol).toUpperCase())
    ),
  ]
  if (usSymbols.length) {
    try {
      const map = await fetchStooqCsv(usSymbols)
      for (const s of usSymbols) {
        if (map[s] != null) out.prices[`us_stock:${s}`] = map[s]
        else out.errors.push(`美股 ${s} 抓取失敗`)
      }
    } catch (e) {
      out.errors.push('美股報價抓取失敗：' + e.message)
    }
  }

  // ---- 台股：讀 prices.json（可能還沒產生，屬正常）----
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
      out.stockUpdatedAt = j.updatedAt || null
    }
  } catch {
    // prices.json 不存在或格式錯誤：台股就退回手動價，不算錯誤
  }

  return out
}
