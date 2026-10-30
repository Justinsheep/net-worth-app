// 單一台股/ETF 的歷史收盤價工具：抓證交所「各日成交資訊」(STOCK_DAY，一次一個月)，
// 算出歷史高點、高點之後的最低收盤。給「投資規則」功能用，結果由 gen-data.mjs 寫進 prices.json。
//
// 證交所給的是「未還原」的原始收盤價，遇到股票分割（例如 1 拆 22）價格會斷層。
// 每一列另外有「漲跌價差」＝今天收盤 − 昨天「參考價」（分割日的參考價是已經換算過的），
// 所以 參考價 = 收盤 − 漲跌價差，跟前一天實際收盤一比就能精確算出分割倍數，不用猜。
//
// 用法：node scripts/hist.mjs --build   重抓整段歷史寫進 scripts/hist-seed.json（約 10 分鐘，會限速）

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HIST_CODES = ['00631L']
const SEED_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hist-seed.json')

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 回傳 [[ 'YYYY-MM-DD', 收盤, 漲跌價差 ], ...]
export async function fetchMonth(code, year, month) {
  const date = `${year}${String(month).padStart(2, '0')}01`
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${code}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const j = await res.json()
      if (j.stat !== 'OK') return [] // 這個月沒資料（還沒上市等）
      const rows = []
      for (const r of j.data || []) {
        const [y, m, d] = String(r[0]).split('/')
        const close = num(r[6])
        if (close == null) continue
        const diff = num(String(r[7]).replace('+', '').replace(/<[^>]*>/g, '').replace('X', ''))
        rows.push([`${Number(y) + 1911}-${m}-${d}`, close, diff])
      }
      return rows
    } catch (e) {
      if (attempt === 2) throw e
      await sleep(5000)
    }
  }
}

export async function loadSeed() {
  try {
    return JSON.parse(await fs.readFile(SEED_PATH, 'utf8'))
  } catch {
    return {}
  }
}

// 從 (seed 最後一筆所在的月份) 抓到本月，合併成完整原始序列（依日期去重）
export async function loadRows(code, seed, { coldMonths = null } = {}) {
  const have = seed[code]?.rows || []
  const byDate = new Map(have.map((r) => [r[0], r]))
  const now = new Date()
  let y, m
  if (have.length) {
    const [yy, mm] = have[have.length - 1][0].split('-').map(Number)
    y = yy; m = mm
  } else if (coldMonths) {
    // 沒有 seed 時只往回抓一段（排程環境不適合花十分鐘抓全部歷史）
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - coldMonths, 1))
    y = d.getUTCFullYear(); m = d.getUTCMonth() + 1
  } else {
    y = 2014; m = 10
  }
  while (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1)) {
    const rows = await fetchMonth(code, y, m)
    for (const r of rows) byDate.set(r[0], r)
    await sleep(3500) // 證交所會擋太密的請求
    m++
    if (m > 12) { m = 1; y++ }
  }
  return [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]))
}

// 把原始收盤價依分割還原成「以今天的股數計價」的序列，回傳 { adj, splits }
export function adjustForSplits(rows) {
  const splits = []
  const factors = new Array(rows.length).fill(1)
  let cum = 1
  for (let i = rows.length - 1; i >= 1; i--) {
    const [, close, diff] = rows[i]
    const prevClose = rows[i - 1][1]
    if (diff != null) {
      const prevRef = close - diff
      if (prevRef > 0 && prevClose / prevRef > 1.3) {
        const f = prevClose / prevRef
        splits.push({ date: rows[i][0], factor: Math.round(f * 100) / 100 })
        cum *= f
      }
    }
    factors[i - 1] = cum
  }
  const adj = rows.map((r, i) => [r[0], r[1] / factors[i]])
  return { adj, splits }
}

// 還原後序列 → 規則要用的幾個數字
export function summarize(adj) {
  if (!adj.length) return null
  let ath = -Infinity, athDate = null
  for (const [d, c] of adj) if (c >= ath) { ath = c; athDate = d }
  let low = Infinity, lowDate = null
  for (const [d, c] of adj) if (d >= athDate && c <= low) { low = c; lowDate = d }
  const [lastDate, last] = adj[adj.length - 1]
  const r = (x) => Math.round(x * 10000) / 10000
  return { ath: r(ath), athDate, low: r(low), lowDate, last: r(last), lastDate }
}

async function build() {
  const out = {}
  for (const code of HIST_CODES) {
    console.log('抓', code, '歷史…')
    const rows = await loadRows(code, {})
    out[code] = { rows }
    console.log(code, '共', rows.length, '個交易日', rows[0]?.[0], '~', rows[rows.length - 1]?.[0])
  }
  await fs.writeFile(SEED_PATH, JSON.stringify(out))
  console.log('已寫入', SEED_PATH)
}

if (process.argv[1] && process.argv[1].endsWith('hist.mjs') && process.argv.includes('--build')) {
  build().catch((e) => { console.error(e); process.exit(1) })
}
