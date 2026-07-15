// 產生代號搜尋清單，寫入 public/symbols.json。
// 用法：node scripts/gen-symbols.mjs（或 npm run symbols）
// 台股：證交所(上市) + 櫃買(上櫃) OpenAPI；加密貨幣：Binance USDT 交易對。
// 跑在 Node（伺服器端），沒有瀏覽器跨網域限制。

import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
  return res.json()
}

async function twStocks() {
  const out = []
  const seen = new Set()
  const push = (code, name) => {
    code = String(code || '').trim()
    name = String(name || '').trim()
    if (!code || !name || seen.has(code)) return
    seen.add(code)
    out.push({ code, name })
  }

  // 上市（TSE）
  try {
    const arr = await getJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    for (const r of arr) push(r.Code ?? r.code ?? r['證券代號'], r.Name ?? r.name ?? r['證券名稱'])
    console.log('上市清單筆數：', arr.length)
  } catch (e) {
    console.warn('上市清單抓取失敗：', e.message)
  }

  // 上櫃（TPEx）— 盡力而為，欄位名視 API 而定
  try {
    const arr = await getJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    for (const r of arr)
      push(r.SecuritiesCompanyCode ?? r.Code ?? r.code ?? r['證券代號'], r.CompanyName ?? r.Name ?? r.name ?? r['證券名稱'])
    console.log('上櫃清單筆數：', arr.length)
  } catch (e) {
    console.warn('上櫃清單抓取失敗：', e.message)
  }

  out.sort((a, b) => a.code.localeCompare(b.code))
  return out
}

// 常見幣種給個中/英文名，其餘就用代號當名稱
const CRYPTO_NAMES = {
  BTC: 'Bitcoin 比特幣', ETH: 'Ethereum 以太幣', BNB: 'BNB', SOL: 'Solana',
  XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin', TRX: 'TRON', TON: 'Toncoin',
  AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', MATIC: 'Polygon',
  LTC: 'Litecoin', BCH: 'Bitcoin Cash', XAUT: 'Tether Gold 黃金', PAXG: 'PAX Gold 黃金',
  USDC: 'USD Coin', SHIB: 'Shiba Inu', UNI: 'Uniswap', ATOM: 'Cosmos', NEAR: 'NEAR',
}

async function cryptos() {
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
    console.log('加密貨幣種類：', out.length)
  } catch (e) {
    console.warn('加密貨幣清單抓取失敗：', e.message)
  }
  out.sort((a, b) => a.code.localeCompare(b.code))
  return out
}

async function main() {
  const [tw_stock, crypto] = await Promise.all([twStocks(), cryptos()])
  const out = { updatedAt: new Date().toISOString(), tw_stock, crypto }
  await fs.mkdir(path.join(root, 'public'), { recursive: true })
  await fs.writeFile(path.join(root, 'public', 'symbols.json'), JSON.stringify(out))
  console.log(`已寫入 public/symbols.json（台股 ${tw_stock.length} 檔、加密貨幣 ${crypto.length} 種）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
