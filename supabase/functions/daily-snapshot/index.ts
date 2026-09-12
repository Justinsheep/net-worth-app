// 每天自動記一筆「資產走勢」快照，不靠使用者打開網頁——由外部排程（GitHub Actions）
// 每天固定時間呼叫這支 Function，幫「所有」已同步資料的使用者各算一次淨資產、寫進 snapshots。
//
// 安全性：這支 Function 用 service role 讀寫「所有人」的資料，繞過 RLS，
// 所以一定要驗證呼叫者帶對 CRON_SECRET，不能公開讓任何人呼叫（不然誰都能幫你觸發，
// 浪費你的資料庫寫入額度，也可能被拿去戳你有哪些使用者）。
//
// 報價來源盡量重用現有的東西，不重寫爬蟲：
//   台股／美股／基金：讀 GitHub Pages 上的 prices.json（deploy.yml 每 30 分鐘更新一次的那份）
//   加密貨幣：即時打 Binance（跟前端 prices.js 用同一個公開端點）
//   匯率：即時打 open.er-api.com（跟前端用同一個來源）

import { createClient } from 'jsr:@supabase/supabase-js@2'

const PRICES_JSON_URL = 'https://justinsheep.github.io/net-worth-app/prices.json'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'
const BINANCE_PRICE = 'https://data-api.binance.vision/api/v3/ticker/price'

// ---------- 從 calc.js 搬過來的最小子集：只留算「淨資產」用得到的部分 ----------
const isCashLike = (k: string) => k === 'cash' || k === 'bank' || k === 'debt'
const holdingIsCashLike = (h: any) => isCashLike(h.category) || (h.category === 'crypto' && h.subtype === 'exchange')
const STABLECOINS = ['USDT']
const isStablecoin = (h: any) =>
  h.category === 'crypto' && h.subtype !== 'exchange' && STABLECOINS.includes(String(h.symbol || '').toUpperCase())
const QUOTE_CURRENCY: Record<string, string> = { tw_stock: 'TWD', us_stock: 'USD', crypto: 'USD' }
function quoteCurrencyOf(category: string, h: any) {
  if (category === 'fund') return h?.currency || 'TWD'
  return QUOTE_CURRENCY[category] || 'TWD'
}
const priceKey = (h: any) => `${h.category}:${String(h.symbol || '').toUpperCase()}`
function effectiveUnitPrice(h: any, prices: Record<string, number>) {
  if (holdingIsCashLike(h)) return 1
  if (isStablecoin(h)) return 1
  const live = prices[priceKey(h)]
  if (live != null && !Number.isNaN(Number(live))) return Number(live)
  return Number(h.price || 0)
}
function rateToTwd(currency: string, fxRates: Record<string, number>) {
  if (currency === 'TWD') return 1
  if (fxRates?.TWD && fxRates[currency]) return fxRates.TWD / fxRates[currency]
  return 0
}
function holdingValueTwd(h: any, prices: Record<string, number>, fxRates: Record<string, number>) {
  if (holdingIsCashLike(h)) {
    const native = Number(h.quantity || 0)
    const rate = rateToTwd(h.currency, fxRates)
    const sign = h.category === 'debt' ? -1 : 1
    return native * rate * sign
  }
  const native = Number(h.quantity || 0) * effectiveUnitPrice(h, prices)
  const rate = rateToTwd(quoteCurrencyOf(h.category, h), fxRates)
  return native * rate
}
function summarize(holdings: any[], prices: Record<string, number>, fxRates: Record<string, number>) {
  let totalAsset = 0
  let totalDebt = 0
  for (const h of holdings) {
    const v = holdingValueTwd(h, prices, fxRates)
    if (h.category === 'debt') totalDebt += Math.abs(v)
    else totalAsset += v
  }
  return { totalAsset, totalDebt, netWorth: totalAsset - totalDebt }
}

async function fetchCryptoPrices(symbols: string[]) {
  const prices: Record<string, number> = {}
  await Promise.allSettled(
    symbols.map(async (sym) => {
      if (sym === 'USDT') return
      const pair = sym.endsWith('USDT') ? sym : sym + 'USDT'
      const res = await fetch(`${BINANCE_PRICE}?symbol=${pair}`)
      if (!res.ok) throw new Error(`${pair} HTTP ${res.status}`)
      const j = await res.json()
      const price = Number(j.price)
      if (Number.isFinite(price)) prices[`crypto:${sym}`] = price
    })
  )
  return prices
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const [pricesRes, fxRes] = await Promise.all([
      fetch(PRICES_JSON_URL).then((r) => r.json()),
      fetch(FX_URL).then((r) => r.json()),
    ])
    const fxRates = fxRes?.rates || {}

    const priceMap: Record<string, number> = {}
    for (const [code, p] of Object.entries<number>(pricesRes.tw_stock || {})) priceMap[`tw_stock:${code.toUpperCase()}`] = p
    for (const [code, p] of Object.entries<number>(pricesRes.us_stock || {})) priceMap[`us_stock:${code.toUpperCase()}`] = p
    for (const [code, p] of Object.entries<number>(pricesRes.fund || {})) priceMap[`fund:${code.toUpperCase()}`] = p

    const { data: rows, error: readErr } = await supabase
      .from('holdings')
      .select('user_id, data')
      .eq('deleted', false)
    if (readErr) throw readErr

    const byUser = new Map<string, any[]>()
    const cryptoSymbols = new Set<string>()
    for (const row of rows || []) {
      const list = byUser.get(row.user_id) || []
      list.push(row.data)
      byUser.set(row.user_id, list)
      if (row.data?.category === 'crypto' && row.data.symbol && !holdingIsCashLike(row.data)) {
        cryptoSymbols.add(String(row.data.symbol).toUpperCase())
      }
    }

    const cryptoPrices = await fetchCryptoPrices([...cryptoSymbols])
    Object.assign(priceMap, cryptoPrices)

    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const results: Record<string, unknown>[] = []

    for (const [userId, holdings] of byUser) {
      const { totalAsset, totalDebt, netWorth } = summarize(holdings, priceMap, fxRates)
      const { error: upErr } = await supabase.from('snapshots').upsert(
        {
          user_id: userId,
          id: today,
          data: { id: today, date: today, netWorthTwd: netWorth, totalAssetTwd: totalAsset, totalDebtTwd: totalDebt, updatedAt: Date.now() },
          updated_at: now,
        },
        { onConflict: 'user_id,id' }
      )
      results.push({ userId, netWorth, ok: !upErr, error: upErr?.message })
    }

    return new Response(JSON.stringify({ ok: true, date: today, users: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
