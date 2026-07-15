// 一次產生 symbols.json（代號清單）和 prices.json（台股收盤價）。
// 用法：node scripts/gen-data.mjs（或 npm run data）
// 台股：證交所(上市) + 櫃買(上櫃) OpenAPI 的「整批」資料，一次拿到全部代號、名稱、收盤價，
//       所以不需要 watchlist——任何台股/ETF 都會有價（每日收盤價）。
// 加密貨幣：Binance USDT 交易對清單（價格由前端即時抓，這裡只做搜尋清單）。

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

async function twData() {
  const symbols = []
  const prices = {}
  const seen = new Set()
  const add = (code, name, price) => {
    code = String(code || '').trim()
    name = String(name || '').trim()
    if (!code) return
    if (name && !seen.has(code)) {
      seen.add(code)
      symbols.push({ code, name })
    }
    if (price != null) prices[code] = price
  }

  // 上市（TSE）：整批日成交，含代號 / 名稱 / 收盤價
  try {
    const arr = await getJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    for (const r of arr) add(r.Code ?? r.code, r.Name ?? r.name, num(r.ClosingPrice ?? r.closingPrice))
    console.log('上市：', arr.length, '筆')
  } catch (e) {
    console.warn('上市抓取失敗：', e.message)
  }

  // 上櫃（TPEx）：盡力而為，欄位名視 API 而定
  try {
    const arr = await getJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    for (const r of arr)
      add(
        r.SecuritiesCompanyCode ?? r.Code ?? r.code ?? r['證券代號'],
        r.CompanyName ?? r.Name ?? r.name ?? r['證券名稱'],
        num(r.Close ?? r.ClosingPrice ?? r.close ?? r['收盤'])
      )
    console.log('上櫃：', arr.length, '筆')
  } catch (e) {
    console.warn('上櫃抓取失敗：', e.message)
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
    console.warn('加密貨幣清單抓取失敗：', e.message)
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
