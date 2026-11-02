// Supabase Edge Function：代替瀏覽器去抓美股報價與基金淨值。
//
// 為什麼需要這個：Stooq（美股）和 MoneyDJ（基金）都不允許瀏覽器直接連線抓資料
// （CORS 限制，是對方網站的規定，我們改不了）。但「伺服器對伺服器」沒有這個限制，
// 所以由這個 Function 代抓，再回傳給我們自己的網頁，就能做到「使用者一上線就是最新價」。
//
// 呼叫方式（POST）：
//   { "us": ["AAPL", "TSLA"], "fund": ["ACFT01"], "tw": ["00631L"] }
// 回傳：
//   { "us": { "AAPL": 186.43 }, "usChg": {}, "fund": { "ACFT01": 264.96 },
//     "tw": { "00631L": 33.75 }, "twChg": { "00631L": -0.012 }, "twTime": { "00631L": "2026-11-02T02:13:59.000Z" }, "errors": [] }
//
// tw＝台股盤中即時價（證交所 MIS 即時行情，瀏覽器沒有 CORS 不能直連）。收盤後／假日就是最後一盤的收盤價。

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
// ---- 台股：證交所 MIS 即時行情（最新成交價、昨收、最後更新時間）----
async function fetchTwRealtime(codes: string[]) {
  const prices: Record<string, number> = {}
  const changePct: Record<string, number> = {}
  const time: Record<string, string> = {}
  if (!codes.length) return { prices, changePct, time }
  const ex = codes.flatMap((c) => [`tse_${c}.tw`, `otc_${c}.tw`]).join('|')
  const res = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(ex)}&json=1&delay=0`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mis.twse.com.tw/stock/index.jsp' },
  })
  if (!res.ok) throw new Error(`MIS HTTP ${res.status}`)
  const j = await res.json()
  const num = (v: unknown) => {
    const n = Number(String(v ?? '').replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  for (const r of j?.msgArray ?? []) {
    const price = num(r.z) ?? num(r.trade?.z) // z 是最新成交價；剛開盤還沒成交時是 '-'，退回最近一筆成交
    const prev = num(r.y)
    if (!(price != null && price > 0)) continue
    prices[r.c] = price
    if (prev != null && prev > 0) changePct[r.c] = (price - prev) / prev
    const ms = Number(r.tlong)
    if (Number.isFinite(ms) && ms > 0) time[r.c] = new Date(ms).toISOString()
  }
  if (!Object.keys(prices).length) {
    // 沒有任何一檔有價：把證交所回的訊息帶回去，方便判斷是被擋、沒開盤還是代號錯
    throw new Error(`MIS 沒有回傳報價（筆數 ${(j?.msgArray ?? []).length}，rtcode ${j?.rtcode ?? '?'}，${j?.rtmessage ?? '無訊息'}）`)
  }
  return { prices, changePct, time }
}

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

    const twList = Array.isArray(body.tw)
      ? [...new Set(body.tw.map((s: unknown) => String(s || '').toUpperCase().trim()).filter((s: string) => /^\d{4,6}[A-Z]?$/.test(s)))].slice(0, 20)
      : []

    const errors: string[] = []
    let tw: Record<string, number> = {}
    let twChg: Record<string, number> = {}
    let twTime: Record<string, string> = {}
    let us: Record<string, number> = {}
    let usChg: Record<string, number> = {}
    const fund: Record<string, number> = {}

    if (usList.length) {
      const r = await fetchUsPrices(usList)
      us = r.prices
      usChg = r.changePct
      errors.push(...r.errors)
    }

    if (twList.length) {
      try {
        const r = await fetchTwRealtime(twList)
        tw = r.prices
        twChg = r.changePct
        twTime = r.time
      } catch (err) {
        errors.push(`台股即時價失敗：${err instanceof Error ? err.message : err}`)
      }
    }

    if (fundList.length) {
      const results = await Promise.allSettled(fundList.map((c) => fetchFundNav(c)))
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') fund[fundList[i]] = r.value
        else errors.push(`基金 ${fundList[i]} 失敗：${r.reason?.message ?? r.reason}`)
      })
    }

    return new Response(JSON.stringify({ us, usChg, fund, tw, twChg, twTime, errors }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ us: {}, usChg: {}, fund: {}, tw: {}, twChg: {}, twTime: {}, errors: [String(e instanceof Error ? e.message : e)] }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
