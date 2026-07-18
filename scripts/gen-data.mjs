// 一次產生 symbols.json（代號清單）和 prices.json（台股收盤價）。
// 用法：node scripts/gen-data.mjs（或 npm run data）
// 台股主來源：證交所「每日收盤行情」MI_INDEX(type=ALL)，含股票 + ETF 的代號/名稱/收盤價。
//   備援：STOCK_DAY_ALL（僅個股）、櫃買 TPEx（上櫃）。
// 所以不需要 watchlist——任何台股/ETF 都會有價（每日收盤價）。
// 加密貨幣：Binance USDT 交易對清單（價格由前端即時抓）。

import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
  return res.json()
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const isTwCode = (c) => /^\d{4,6}[A-Z]?$/.test(c)

async function twData() {
  const symbols = []
  const prices = {}
  const chg = {} // 漲跌幅（小數，例：0.023 = +2.3%）；抓不到就不寫入，前端顯示「—」
  const seen = new Set()
  const add = (code, name, price) => {
    code = String(code || '').trim()
    name = String(name || '').trim()
    if (!isTwCode(code)) return
    if (name && !seen.has(code)) {
      seen.add(code)
      symbols.push({ code, name })
    }
    if (price != null) prices[code] = price
  }

  // 主來源：MI_INDEX（每日收盤行情，含股票 + ETF）。往前找最近有資料的交易日。
  let miCount = 0
  try {
    let data = null
    for (let i = 0; i < 8; i++) {
      const d = new Date(Date.now() - i * 86400000)
      const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
      try {
        const j = await getJson(`https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${ymd}&type=ALL`)
        if (j && j.stat === 'OK' && Array.isArray(j.tables)) { data = j; break }
      } catch { /* 換前一天 */ }
    }
    if (data) {
      for (const t of data.tables || []) {
        const f = t.fields || []
        const ci = f.findIndex((x) => String(x).includes('證券代號'))
        const ni = f.findIndex((x) => String(x).includes('證券名稱'))
        const pi = f.findIndex((x) => String(x).includes('收盤價'))
        // 漲跌價差＝變動金額（無號），漲跌(+/-)＝正負號欄。兩者都找到才算漲跌幅，
        // 找不到就跳過（該檔今日變動前端會顯示「—」，不會顯示錯的數字）。
        const di = f.findIndex((x) => String(x).includes('漲跌價差'))
        const si = f.findIndex((x) => String(x).includes('(+/-)'))
        if (ci === -1 || pi === -1) continue
        for (const row of t.data || []) {
          const code = String(row[ci] || '').trim()
          const close = num(row[pi])
          add(code, ni >= 0 ? row[ni] : '', close)
          if (close != null) miCount++
          if (di !== -1 && si !== -1 && close != null) {
            const diff = num(row[di])
            const signRaw = String(row[si] ?? '').trim()
            const sign = signRaw.includes('-') ? -1 : signRaw.includes('+') ? 1 : 0
            if (diff != null && sign !== 0) {
              const amount = diff * sign
              const prevClose = close - amount
              if (prevClose > 0) chg[code] = amount / prevClose
            }
          }
        }
      }
    }
    console.log('MI_INDEX 收盤價：', miCount, '筆　漲跌幅：', Object.keys(chg).length, '筆')
  } catch (e) {
    console.warn('MI_INDEX 失敗：', e.message)
  }

  // 備援：STOCK_DAY_ALL（僅個股）——補名稱/價格，MI_INDEX 成功時多半已涵蓋
  if (miCount === 0) {
    try {
      const arr = await getJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
      for (const r of arr) add(r.Code ?? r.code, r.Name ?? r.name, num(r.ClosingPrice ?? r.closingPrice))
      console.log('STOCK_DAY_ALL 備援：', arr.length, '筆')
    } catch (e) {
      console.warn('STOCK_DAY_ALL 失敗：', e.message)
    }
  }

  // 上櫃 TPEx（盡力而為）
  try {
    const arr = await getJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    for (const r of arr)
      add(
        r.SecuritiesCompanyCode ?? r.Code ?? r.code,
        r.CompanyName ?? r.Name ?? r.name,
        num(r.Close ?? r.ClosingPrice ?? r.close)
      )
    console.log('上櫃 TPEx：', arr.length, '筆')
  } catch (e) {
    console.warn('上櫃 TPEx 失敗：', e.message)
  }

  symbols.sort((a, b) => a.code.localeCompare(b.code))
  return { symbols, prices, chg }
}

// 美股清單：NASDAQ 官方公開的上市公司名冊（nasdaqlisted / otherlisted，含 NYSE），
// 這是長年穩定、免金鑰的公開資料格式。含真實的 ETF 欄位，不用像台股那樣用代碼猜。
async function usStockSymbols() {
  const out = []
  const seen = new Set()

  async function getText(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
    return res.text()
  }
  function parsePipeFile(text, { symbolCol, nameCol, etfCol }) {
    const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('File Creation Time'))
    const header = lines[0].split('|')
    const si = header.indexOf(symbolCol)
    const ni = header.indexOf(nameCol)
    const ei = etfCol ? header.indexOf(etfCol) : -1
    if (si === -1 || ni === -1) return []
    return lines.slice(1).map((l) => {
      const cols = l.split('|')
      return { code: (cols[si] || '').trim(), name: (cols[ni] || '').trim(), etf: ei !== -1 && cols[ei] === 'Y' }
    }).filter((x) => x.code && x.name && !x.code.includes('.') && !x.code.includes('$'))
  }

  try {
    const [nasdaq, other] = await Promise.all([
      getText('https://old.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'),
      getText('https://old.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'),
    ])
    for (const it of parsePipeFile(nasdaq, { symbolCol: 'Symbol', nameCol: 'Security Name', etfCol: 'ETF' })) {
      if (!seen.has(it.code)) { seen.add(it.code); out.push(it) }
    }
    for (const it of parsePipeFile(other, { symbolCol: 'ACT Symbol', nameCol: 'Security Name', etfCol: 'ETF' })) {
      if (!seen.has(it.code)) { seen.add(it.code); out.push(it) }
    }
    console.log('美股：', out.length, '檔（含 NASDAQ + NYSE 等）')
  } catch (e) {
    console.warn('美股清單失敗：', e.message)
  }
  out.sort((a, b) => a.code.localeCompare(b.code))
  return out
}

// 基金清單：目前留空。台灣基金淨值分散在各基金公司/代銷平台，投信投顧公會雖有公開資料，
// 但這邊沒辦法連線實際驗證清單/淨值格式，怕接錯造成誤導，所以先不接——
// 「基金」分類本身已經可以用，只是代號要自己手動輸入，現價也要手動填。
async function fundSymbols() {
  return []
}

const CRYPTO_NAMES = {
  USDT: 'Tether 泰達幣（穩定幣）',
  BTC: 'Bitcoin 比特幣', ETH: 'Ethereum 以太幣', BNB: 'BNB', SOL: 'Solana',
  XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin', TRX: 'TRON', TON: 'Toncoin',
  AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', MATIC: 'Polygon',
  LTC: 'Litecoin', BCH: 'Bitcoin Cash', XAUT: 'Tether Gold 黃金', PAXG: 'PAX Gold 黃金',
  USDC: 'USD Coin', SHIB: 'Shiba Inu', UNI: 'Uniswap', ATOM: 'Cosmos', NEAR: 'NEAR',
}

async function cryptoSymbols() {
  const out = []
  const seen = new Set()
  try {
    const info = await getJson('https://data-api.binance.vision/api/v3/exchangeInfo')
    for (const s of info.symbols || []) {
      if (s.status === 'TRADING' && s.quoteAsset === 'USDT') {
        const base = s.baseAsset
        if (!seen.has(base)) {
          seen.add(base)
          out.push({ code: base, name: CRYPTO_NAMES[base] || base })
        }
      }
    }
    console.log('加密貨幣：', out.length, '種')
  } catch (e) {
    console.warn('加密貨幣清單失敗：', e.message)
  }
  // USDT 本身是計價幣，不會出現在上面 baseAsset 清單裡，手動補上
  if (!out.some((c) => c.code === 'USDT')) {
    out.push({ code: 'USDT', name: CRYPTO_NAMES.USDT })
  }
  out.sort((a, b) => a.code.localeCompare(b.code))
  return out
}

async function main() {
  const [tw, crypto, usStock, fund] = await Promise.all([twData(), cryptoSymbols(), usStockSymbols(), fundSymbols()])
  const now = new Date().toISOString()

  await fs.mkdir(path.join(root, 'public'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'public', 'symbols.json'),
    JSON.stringify({ updatedAt: now, tw_stock: tw.symbols, us_stock: usStock, crypto, fund })
  )
  await fs.writeFile(
    path.join(root, 'public', 'prices.json'),
    JSON.stringify({ updatedAt: now, tw_stock: tw.prices, tw_stock_chg: tw.chg }, null, 2)
  )

  console.log(`已寫入 symbols.json（台股 ${tw.symbols.length} 檔、美股 ${usStock.length} 檔、加密貨幣 ${crypto.length} 種、基金 ${fund.length} 檔）`)
  console.log(`已寫入 prices.json（台股報價 ${Object.keys(tw.prices).length} 檔、漲跌幅 ${Object.keys(tw.chg).length} 檔）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
