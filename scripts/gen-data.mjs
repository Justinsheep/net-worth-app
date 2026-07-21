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
// 常見美股的中英對照（涵蓋率不可能到全部上萬檔，只做大家常聽到的），
// 有對照的用這個蓋掉官方原始英文名，其餘維持原始名稱
const US_STOCK_NAMES = {
  AAPL: 'Apple 蘋果', MSFT: 'Microsoft 微軟', GOOGL: 'Alphabet Class A 谷歌', GOOG: 'Alphabet Class C 谷歌',
  AMZN: 'Amazon 亞馬遜', TSLA: 'Tesla 特斯拉', META: 'Meta 臉書', NVDA: 'NVIDIA 輝達',
  NFLX: 'Netflix 網飛', AMD: 'AMD 超微', INTC: 'Intel 英特爾', QCOM: 'Qualcomm 高通',
  AVGO: 'Broadcom 博通', ORCL: 'Oracle 甲骨文', CRM: 'Salesforce',
  ADBE: 'Adobe', IBM: 'IBM', CSCO: 'Cisco 思科', PYPL: 'PayPal',
  UBER: 'Uber', LYFT: 'Lyft', ABNB: 'Airbnb 愛彼迎', COIN: 'Coinbase',
  SHOP: 'Shopify', SQ: 'Block（原 Square）', SNAP: 'Snap',
  DIS: 'Disney 迪士尼', NKE: 'Nike 耐吉', SBUX: 'Starbucks 星巴克', MCD: "McDonald's 麥當勞",
  KO: 'Coca-Cola 可口可樂', PEP: 'PepsiCo 百事', WMT: 'Walmart 沃爾瑪', COST: 'Costco 好市多',
  TGT: 'Target 塔吉特', HD: 'Home Depot', JPM: 'JPMorgan 摩根大通', BAC: 'Bank of America 美國銀行',
  GS: 'Goldman Sachs 高盛', MS: 'Morgan Stanley 摩根士丹利', V: 'Visa', MA: 'Mastercard 萬事達',
  JNJ: 'Johnson & Johnson 嬌生', PFE: 'Pfizer 輝瑞', UNH: 'UnitedHealth',
  XOM: 'ExxonMobil 埃克森美孚', CVX: 'Chevron 雪佛龍',
  BA: 'Boeing 波音', GE: 'GE', F: 'Ford 福特', GM: 'General Motors 通用汽車',
  T: 'AT&T', VZ: 'Verizon', TSM: 'TSMC 台積電 ADR', BABA: 'Alibaba 阿里巴巴', PDD: 'PDD／拼多多',
  JD: 'JD.com 京東', NIO: 'NIO 蔚來', RIVN: 'Rivian', LCID: 'Lucid',
  PLTR: 'Palantir', SOFI: 'SoFi', RBLX: 'Roblox', U: 'Unity',
  // 常見美股 ETF
  SPY: 'SPDR S&P 500 ETF', VOO: 'Vanguard S&P 500 ETF', QQQ: 'Invesco QQQ（那斯達克100）',
  VTI: 'Vanguard 全美股市 ETF', IVV: 'iShares S&P 500 ETF', VEA: 'Vanguard 已開發市場 ETF',
  VWO: 'Vanguard 新興市場 ETF', ARKK: 'ARK 創新 ETF', SCHD: 'Schwab 高股息 ETF',
  JEPI: 'JPMorgan 收益 ETF', TLT: 'iShares 20年期公債 ETF', GLD: 'SPDR 黃金 ETF',
}

async function usStockSymbols() {
  const out = []
  const seen = new Set()

  async function getText(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
    return res.text()
  }
  // old.nasdaqtrader.com 從名字看就像是舊網域，連線可能不穩，改用 ftp.nasdaqtrader.com 當主要來源，
  // 失敗就自動改試下一個候選網域，任一個連得上就有資料
  async function getTextWithFallback(hosts, filePath) {
    for (const host of hosts) {
      const url = `https://${host}${filePath}`
      try {
        const text = await getText(url)
        console.log(`  ${filePath}：${host} 成功`)
        return text
      } catch (e) {
        console.warn(`  ${filePath}：${host} 失敗（${e.message}），改試下一個`)
      }
    }
    throw new Error(`${filePath} 所有候選網域都失敗`)
  }
  const NASDAQ_HOSTS = ['ftp.nasdaqtrader.com', 'old.nasdaqtrader.com', 'nasdaqtrader.com']

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
      getTextWithFallback(NASDAQ_HOSTS, '/dynamic/SymDir/nasdaqlisted.txt'),
      getTextWithFallback(NASDAQ_HOSTS, '/dynamic/SymDir/otherlisted.txt'),
    ])
    const nasdaqList = parsePipeFile(nasdaq, { symbolCol: 'Symbol', nameCol: 'Security Name', etfCol: 'ETF' })
    const otherList = parsePipeFile(other, { symbolCol: 'ACT Symbol', nameCol: 'Security Name', etfCol: 'ETF' })
    for (const it of nasdaqList) {
      if (!seen.has(it.code)) { seen.add(it.code); out.push(it) }
    }
    for (const it of otherList) {
      if (!seen.has(it.code)) { seen.add(it.code); out.push(it) }
    }
    // 常見的幾十檔換成中英對照名稱，方便打中文也搜得到
    let namedCount = 0
    for (const it of out) {
      if (US_STOCK_NAMES[it.code]) { it.name = US_STOCK_NAMES[it.code]; namedCount++ }
    }
    console.log('美股中英對照套用：', namedCount, '檔')
    const etfCount = out.filter((x) => x.etf).length
    console.log('美股：', out.length, '檔（含 NASDAQ + NYSE 等），其中 ETF：', etfCount, '檔')
    if (out.length > 0 && etfCount === 0) {
      console.warn('警告：ETF 欄位判斷失敗（欄位名稱可能跟預期不同），改用名稱關鍵字退回判斷')
      for (const it of out) {
        if (/\b(ETF|TRUST|FUND)\b/i.test(it.name)) it.etf = true
      }
      console.log('退回判斷後 ETF：', out.filter((x) => x.etf).length, '檔')
    }
  } catch (e) {
    console.warn('美股清單失敗：', e.message)
  }
  out.sort((a, b) => a.code.localeCompare(b.code))
  return out
}

// 基金清單與淨值：MoneyDJ 的「發行公司 → 旗下基金淨值」頁一次就有代號、中文名稱、幣別、淨值。
// 路徑：公司列表 YP303001（境外，BFC 代號）→ 逐家打開 yp303004.djhtm?a=公司代號&b=1
// 這是實際探測驗證過的結構，抓不到就跳過那一家，不影響其他。
async function fetchBig5(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) html = new TextDecoder('big5').decode(buf)
  return html
}

async function fundSymbols() {
  const MDJ = 'https://www.moneydj.com'
  const funds = []
  const navs = {}
  const seen = new Set()

  // 從一頁裡把「代號 + 中文名稱（+ 幣別 + 淨值，如果那頁有的話）」抓出來
  // 非基金名稱的連結文字（導覽列、功能連結），比對到就跳過
  const NOT_FUND_NAME = /^(基本資料|淨值|績效|持股|配息|報酬|走勢|比較|加入|更多|詳細|下載|回上頁|首頁|查詢|排行|新聞|評等|收藏|\d+|[A-Za-z0-9\s.-]+)$/
  function harvest(html) {
    let added = 0
    // (a) 有淨值的表格列（發行公司旗下基金淨值頁）
    const full = [...html.matchAll(
      /yp01000[01]\.djhtm\?a=([A-Za-z0-9]+)"[^>]*class="product_name_fund"[^>]*>([^<]+)<\/A>[\s\S]{0,400}?<TD[^>]*>([\d/]{8,10})<\/TD>[\s\S]{0,80}?<TD[^>]*>([^<]*)<\/TD>[\s\S]{0,80}?<TD[^>]*>([\d.,]+)<\/TD>/gi
    )]
    for (const r of full) {
      const code = r[1].toUpperCase()
      if (seen.has(code)) continue
      seen.add(code)
      funds.push({ code, name: r[2].replace(/\s+/g, ' ').trim(), currency: r[4].replace(/\s+/g, '').trim() })
      const nav = Number(String(r[5]).replace(/,/g, ''))
      if (Number.isFinite(nav) && nav > 0) navs[code] = nav
      added++
    }
    // (b) 一般的基金連結（分類頁、排行頁；這些頁面的連結沒有 product_name_fund 標記）
    const links = [...html.matchAll(/yp01000\d\.djhtm\?a=([A-Za-z0-9]+)["']?[^>]*>([^<]{2,60})</gi)]
    for (const r of links) {
      const code = r[1].toUpperCase()
      const name = r[2].replace(/\s+/g, ' ').trim()
      if (!name || seen.has(code) || NOT_FUND_NAME.test(name)) continue
      seen.add(code)
      funds.push({ code, name, currency: '' })
      added++
    }
    return added
  }

  // ---- 1. 境外基金：發行公司列表 → 逐家抓旗下基金淨值 ----
  try {
    const html = await fetchBig5(`${MDJ}/funddj/yb/YP303001.djhtm`)
    const companies = [...new Set([...html.matchAll(/yp303003\.djhtm\?a=(BFC\w+)/gi)].map((m) => m[1].toUpperCase()))]
    console.log('基金發行公司：', companies.length, '家')
    for (const co of companies) {
      try {
        harvest(await fetchBig5(`${MDJ}/funddj/yp/yp303004.djhtm?a=${co}&b=1`))
      } catch (e) {
        console.warn(`  基金公司 ${co} 失敗：${e.message}`)
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    console.log('  境外基金小計：', funds.length, '檔')
  } catch (e) {
    console.warn('基金公司列表失敗：', e.message)
  }

  // ---- 2. 國內基金：國內基金搜尋頁的分類 → 逐類抓 ----
  const before = funds.length
  try {
    const html = await fetchBig5(`${MDJ}/funddj/yb/YP301000.djhtm`)
    const cats = [...new Set([...html.matchAll(/YP302000\.djhtm\?a=(ET\d+)/gi)].map((m) => m[1].toUpperCase()))]
    console.log('國內基金分類：', cats.length, '類')
    for (const cat of cats) {
      try {
        harvest(await fetchBig5(`${MDJ}/funddj/yb/YP302000.djhtm?a=${cat}`))
      } catch (e) {
        console.warn(`  分類 ${cat} 失敗：${e.message}`)
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  } catch (e) {
    console.warn('國內基金分類失敗：', e.message)
  }

  // ---- 3. 補漏：幾個已知會列出國內基金的排行頁 ----
  for (const p of [
    '/funddj/yp/YP081008.djhtm',
    '/funddj/yp/YP081008.djhtm?A=1&B=Y',
    '/funddj/yb/YP081010.djhtm',
    '/funddj/yb/YP081010.djhtm?A=1',
    '/funddj/ya/yp081001.djhtm',
    '/funddj/ya/yp306.djhtm',
  ]) {
    try {
      harvest(await fetchBig5(MDJ + p))
    } catch { /* 這是補漏用的，失敗就算了 */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  console.log('  國內基金小計：', funds.length - before, '檔')

  funds.sort((a, b) => a.code.localeCompare(b.code))
  console.log('基金合計：', funds.length, '檔（含淨值', Object.keys(navs).length, '檔）')
  return { funds, navs }
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

// ---- 美股報價：備援快取用（主要即時報價走 Supabase Edge Function）----
// 原本用 Stooq 批次查，但實測伺服器端會被回 404，改用 Yahoo；Yahoo 是逐檔查詢，
// 不適合掃全市場幾千檔，所以這裡只抓 us-codes.json 裡指定的代號當備援快取。
async function usStockPrices() {
  const prices = {}
  let codes = []
  try {
    codes = JSON.parse(await fs.readFile(path.join(root, 'us-codes.json'), 'utf8'))
    if (!Array.isArray(codes)) codes = []
  } catch {
    console.log('美股報價：沒有 us-codes.json，略過備援快取（即時報價仍由 Edge Function 提供）')
    return prices
  }
  for (const raw of codes) {
    const code = String(raw || '').trim().toUpperCase()
    if (!code) continue
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      const price = Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice)
      if (Number.isFinite(price) && price > 0) prices[code] = price
      else throw new Error('報價數值異常')
    } catch (e) {
      console.warn(`  美股 ${code} 失敗：${e.message}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.log('美股報價（備援快取）：', Object.keys(prices).length, '檔')
  return prices
}

// ---- 基金淨值：伺服器端抓 MoneyDJ（一樣是 CORS 擋不住的地方）----
// 基金沒有公開的完整清單可以列舉，所以改成讀 repo 根目錄的 fund-codes.json，
// 你要追蹤哪幾檔基金就把代號加進那個檔案（例如 ["ACFT01"]）。
async function fundPrices() {
  const prices = {}
  let codes = []
  try {
    codes = JSON.parse(await fs.readFile(path.join(root, 'fund-codes.json'), 'utf8'))
    if (!Array.isArray(codes)) codes = []
  } catch {
    console.log('基金：沒有 fund-codes.json，略過（要自動抓淨值就把基金代號加進這個檔案）')
    return prices
  }
  for (const raw of codes) {
    const code = String(raw || '').trim()
    if (!code) continue
    try {
      const res = await fetch(`https://www.moneydj.com/funddj/ya/yp010000.djhtm?a=${encodeURIComponent(code)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const m = html.match(/<td class="t3n0[^"]*">\d{2}\/\d{2}<\/td>\s*<td class="t3n1[^"]*">([\d.]+)<\/td>/)
      if (!m) throw new Error('頁面格式不符，找不到淨值')
      const nav = Number(m[1])
      if (Number.isFinite(nav) && nav > 0) prices[code.toUpperCase()] = nav
      else throw new Error('淨值數值異常')
    } catch (e) {
      console.warn(`  基金 ${code} 失敗：${e.message}`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  console.log('基金淨值：', Object.keys(prices).length, '檔')
  return prices
}

async function main() {
  const [tw, crypto, usStock, fundData] = await Promise.all([twData(), cryptoSymbols(), usStockSymbols(), fundSymbols()])
  const now = new Date().toISOString()
  const fund = fundData.funds

  await fs.mkdir(path.join(root, 'public'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'public', 'symbols.json'),
    JSON.stringify({ updatedAt: now, tw_stock: tw.symbols, us_stock: usStock, crypto, fund })
  )

  const [usPrices, fundNavExtra] = await Promise.all([
    usStockPrices(),
    fundPrices(),
  ])
  // 爬清單時順手抓到的淨值當底，fund-codes.json 指定的再覆蓋上去（那些通常更即時）
  const fundNav = { ...fundData.navs, ...fundNavExtra }

  await fs.writeFile(
    path.join(root, 'public', 'prices.json'),
    JSON.stringify({
      updatedAt: now,
      tw_stock: tw.prices,
      tw_stock_chg: tw.chg,
      us_stock: usPrices,
      fund: fundNav,
    }, null, 2)
  )

  console.log(`已寫入 symbols.json（台股 ${tw.symbols.length} 檔、美股 ${usStock.length} 檔、加密貨幣 ${crypto.length} 種、基金 ${fund.length} 檔）`)
  console.log(`已寫入 prices.json（台股 ${Object.keys(tw.prices).length} 檔、台股漲跌 ${Object.keys(tw.chg).length} 檔、美股 ${Object.keys(usPrices).length} 檔、基金 ${Object.keys(fundNav).length} 檔）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
