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

// ---- 美股：Stooq 的 CSV 報價，支援一次查多檔（逗號分隔）----
async function fetchUsPrices(symbols: string[]) {
  const out: Record<string, number> = {}
  if (!symbols.length) return out
  const q = symbols.map((s) => `${s.toLowerCase()}.us`).join(',')
  const res = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(q)}&f=sd2t2ohlcv&h&e=csv`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`)
  const text = await res.text()
  for (const line of text.trim().split('\n').slice(1)) {
    const cols = line.split(',')
    const sym = String(cols[0] || '').replace(/\.US$/i, '').toUpperCase()
    const close = Number(cols[6])
    if (sym && Number.isFinite(close) && close > 0) out[sym] = close
  }
  return out
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
    const fund: Record<string, number> = {}

    if (usList.length) {
      try {
        us = await fetchUsPrices(usList)
        for (const s of usList) if (us[s] == null) errors.push(`美股 ${s} 沒有報價`)
      } catch (e) {
        errors.push(`美股報價失敗：${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (fundList.length) {
      const results = await Promise.allSettled(fundList.map((c) => fetchFundNav(c)))
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') fund[fundList[i]] = r.value
        else errors.push(`基金 ${fundList[i]} 失敗：${r.reason?.message ?? r.reason}`)
      })
    }

    return new Response(JSON.stringify({ us, fund, errors }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ us: {}, fund: {}, errors: [String(e instanceof Error ? e.message : e)] }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
