// Supabase Edge Function：代替瀏覽器去抓美股報價與基金淨值。
//
// 為什麼需要這個：Stooq（美股）和 MoneyDJ（基金）都不允許瀏覽器直接連線抓資料
// （CORS 限制，是對方網站的規定，我們改不了）。但「伺服器對伺服器」沒有這個限制，
// 所以由這個 Function 代抓，再回傳給我們自己的網頁，就能做到「使用者一上線就是最新價」。
//
// 呼叫方式（POST）：
//   { "us": ["AAPL", "TSLA"], "fund": ["ACFT01"] }
// 回傳：
//   { "us": { "AAPL": 186.43 }, "fund": { "ACFT01": 264.96 }, "errors": [] }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_SYMBOLS = 200 // 防呆：避免有人一次丟太多代號進來

// ---- 美股：Yahoo Finance 的公開報價端點 ----
// 原本用 Stooq，但實測從伺服器端呼叫會回 404（應該是擋了資料中心 IP），改用 Yahoo。
// 好處是回應裡有昨收價，可以順便算出今日漲跌幅。
async function fetchOneUsFromYahoo(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const j = await res.json()
  const meta = j?.chart?.result?.[0]?.meta
  if (!meta) throw new Error('回應格式不符')
  const price = Number(meta.regularMarketPrice)
  if (!Number.isFinite(price) || price <= 0) throw new Error('報價數值異常')
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose)
  const changePct = Number.isFinite(prev) && prev > 0 ? (price - prev) / prev : null
  return { price, changePct }
}

async function fetchUsPrices(symbols: string[]) {
  const prices: Record<string, number> = {}
  const changePct: Record<string, number> = {}
  const errors: string[] = []
  if (!symbols.length) return { prices, changePct, errors }

  const results = await Promise.allSettled(symbols.map((s) => fetchOneUsFromYahoo(s)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      prices[symbols[i]] = r.value.price
      if (r.value.changePct != null) changePct[symbols[i]] = r.value.changePct
    } else {
      errors.push(`美股 ${symbols[i]}：${r.reason?.message ?? r.reason}`)
    }
  })
  return { prices, changePct, errors }
}

// ---- 基金：MoneyDJ 的基金頁面，解析最新一筆淨值 ----
async function fetchFundNav(code: string) {
  const res = await fetch(`https://www.moneydj.com/funddj/ya/yp010000.djhtm?a=${encodeURIComponent(code)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`MoneyDJ HTTP ${res.status}`)
  const html = await res.text()
  const m = html.match(/<td class="t3n0[^"]*">\d{2}\/\d{2}<\/td>\s*<td class="t3n1[^"]*">([\d.]+)<\/td>/)
  if (!m) throw new Error('頁面格式不符，找不到淨值')
  const nav = Number(m[1])
  if (!Number.isFinite(nav) || nav <= 0) throw new Error('淨值數值異常')
  return nav
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const body = await req.json().catch(() => ({}))
    const usList = Array.isArray(body.us)
      ? [...new Set(body.us.map((s: unknown) => String(s || '').toUpperCase().trim()).filter(Boolean))].slice(0, MAX_SYMBOLS)
      : []
    const fundList = Array.isArray(body.fund)
      ? [...new Set(body.fund.map((s: unknown) => String(s || '').toUpperCase().trim()).filter(Boolean))].slice(0, MAX_SYMBOLS)
      : []

    const errors: string[] = []
    let us: Record<string, number> = {}
    let usChg: Record<string, number> = {}
    const fund: Record<string, number> = {}

    if (usList.length) {
      const r = await fetchUsPrices(usList)
      us = r.prices
      usChg = r.changePct
      errors.push(...r.errors)
    }

    if (fundList.length) {
      const results = await Promise.allSettled(fundList.map((c) => fetchFundNav(c)))
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') fund[fundList[i]] = r.value
        else errors.push(`基金 ${fundList[i]} 失敗：${r.reason?.message ?? r.reason}`)
      })
    }

    return new Response(JSON.stringify({ us, usChg, fund, errors }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ us: {}, usChg: {}, fund: {}, errors: [String(e instanceof Error ? e.message : e)] }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
