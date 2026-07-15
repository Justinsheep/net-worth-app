// 抓台股 / 美股價格，寫入 public/prices.json。
// 用法：node scripts/fetch-prices.mjs（或 npm run prices）
// 代號清單放在專案根目錄的 watchlist.json。
// 資料來源：Yahoo Finance chart API（台股加 .TW / 上櫃 .TWO，美股直接用代號）。
// 這支腳本跑在 Node（伺服器端），沒有瀏覽器的跨網域限制。

import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`)
  const j = await res.json()
  const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (price == null) throw new Error(`${symbol} 無報價`)
  return Number(price)
}

async function main() {
  let watchlist = { tw_stock: [], us_stock: [] }
  try {
    watchlist = JSON.parse(await fs.readFile(path.join(root, 'watchlist.json'), 'utf8'))
  } catch {
    console.warn('找不到 watchlist.json，將產生空的 prices.json')
  }

  const out = { updatedAt: new Date().toISOString(), tw_stock: {}, us_stock: {} }

  // 台股：先試上市 .TW，失敗再試上櫃 .TWO
  for (const s of watchlist.tw_stock || []) {
    try {
      out.tw_stock[s] = await yahoo(`${s}.TW`)
    } catch {
      try {
        out.tw_stock[s] = await yahoo(`${s}.TWO`)
      } catch (e2) {
        console.warn('台股', s, '抓取失敗：', e2.message)
      }
    }
  }

  // 美股
  for (const s of watchlist.us_stock || []) {
    try {
      out.us_stock[s] = await yahoo(s)
    } catch (e) {
      console.warn('美股', s, '抓取失敗：', e.message)
    }
  }

  await fs.mkdir(path.join(root, 'public'), { recursive: true })
  await fs.writeFile(path.join(root, 'public', 'prices.json'), JSON.stringify(out, null, 2))
  console.log('已寫入 public/prices.json')
  console.log(out)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
