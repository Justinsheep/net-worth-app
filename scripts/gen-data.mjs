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
        if (ci === -1 || pi === -1) continue
        for (const row of t.data || []) {
          add(row[ci], ni >= 0 ? row[ni] : '', num(row[pi]))
          if (num(row[pi]) != null) miCount++
        }
      }
    }
    console.log('MI_INDEX 收盤價：', miCount, '筆')
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
  return { symbols, prices }
}

const CRYPTO_NAMES = {
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
  out.sort((a, b) => a.code.localeCompare(b.code))
  return out
}

async function main() {
  const [tw, crypto] = await Promise.all([twData(), cryptoSymbols()])
  const now = new Date().toISOString()

  await fs.mkdir(path.join(root, 'public'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'public', 'symbols.json'),
    JSON.stringify({ updatedAt: now, tw_stock: tw.symbols, crypto })
  )
  await fs.writeFile(
    path.join(root, 'public', 'prices.json'),
    JSON.stringify({ updatedAt: now, tw_stock: tw.prices }, null, 2)
  )

  console.log(`已寫入 symbols.json（台股 ${tw.symbols.length} 檔、加密貨幣 ${crypto.length} 種）`)
  console.log(`已寫入 prices.json（台股報價 ${Object.keys(tw.prices).length} 檔）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
