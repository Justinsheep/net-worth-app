// 正二（00631L）投資規則 v1 的運算核心。純函式：不碰資料庫、不碰畫面，
// 輸入「目前持倉市值、現金池、價格、歷史高點」＋「規則狀態」，輸出今天該做什麼。
//
// 規則摘要（細節見使用者貼的規則 v1）：
//  1. 資金：股票 ≈ 70% 買 00631L、現金 ≈ 30% 當加碼池，現金池平均分 5 倉。
//  2. 下跌加碼：以 00631L「歷史高點收盤價」為基準，跌 10/20/30/40/50% 各動用一倉，每倉每輪只觸發一次。
//     一次跌破多個門檻就一次動用多倉。
//  3. 每月新增資金：占比 = 正二市值 ÷（正二市值 + 現金池）。預設 7:3；
//     占比 > 80% 全進現金池並暫停買正二，直到回到 70%；占比 < 65% 全買正二。
//  4. 再平衡：只有占比 > 90% 才賣，賣到 80%，賣出所得放回現金池。
//  5. 動用過的倉，要等 00631L 創新高（新一輪）才會重新開放。

export const DEFAULT_PARAMS = {
  levels: [10, 20, 30, 40, 50], // 跌幅（%），每個門檻一倉
  monthly: 0, // 每月新增資金（元），0 表示只顯示比例不算金額
  targetPct: 70, // 預設股票占比，也是「暫停買正二」解除的位置
  pauseAbovePct: 80, // 占比超過 → 全進現金池、暫停買正二
  allStockBelowPct: 65, // 占比低於 → 新資金全買正二
  sellAbovePct: 90, // 占比超過 → 賣出
  sellToPct: 80, // 賣到回到這個占比
}

export const PLAN_ID = 'plan:00631L'
const EPS = 1e-9
const round = (x) => Math.round(x)

export function newPlan() {
  return {
    id: PLAN_ID,
    enabled: false,
    symbol: '00631L',
    poolId: null, // 綁定哪個帳戶當現金池
    params: { ...DEFAULT_PARAMS, levels: [...DEFAULT_PARAMS.levels] },
    cycle: null, // { ath, athDate }：這一輪是以哪個高點起算
    used: DEFAULT_PARAMS.levels.map(() => null), // 每倉 null＝可用；有值＝這一輪已動用 { date, price, amount }
    paused: false, // 已暫停買正二（占比超過 80% 之後，要降到 70% 才解除）
    manualAth: null, // 手動指定高點（自動抓不到或分割還原有誤時的備援）
    updatedAt: Date.now(),
  }
}

// 補齊欄位（舊資料／同步回來缺欄位時用）
export function normalizePlan(p) {
  const base = newPlan()
  const params = { ...base.params, ...(p?.params || {}) }
  const used = Array.from({ length: params.levels.length }, (_, i) => p?.used?.[i] ?? null)
  return { ...base, ...p, params, used }
}

// 決定這一輪的高點：手動指定優先；否則用歷史資料，並確保不會低於目前價格
export function resolveAth(plan, hist, price) {
  if (plan.manualAth > 0) {
    const ath = Math.max(plan.manualAth, price || 0)
    return { ath, athDate: ath === plan.manualAth ? '手動' : hist?.lastDate || null, low: hist?.low ?? null, manual: true }
  }
  if (!hist?.ath) return null
  if (price > hist.ath) return { ath: price, athDate: hist.lastDate, low: price, manual: false }
  return { ath: hist.ath, athDate: hist.athDate, low: hist.low ?? null, manual: false }
}

// 剛啟用時：以目前的高點起算，「依歷史已經觸發過」的倉預設標成已動用，
// 免得一開起來就跳出一堆事後諸葛的加碼指示（使用者可在設定裡再調整）
export function initCycle(plan, hist, price) {
  const a = resolveAth(plan, hist, price)
  if (!a) return plan
  const levels = plan.params.levels
  const maxDd = maxDrawdownOf(a, price)
  const used = levels.map((lv) => (maxDd * 100 + EPS >= lv ? { date: '啟用前', price: null, amount: null, initial: true } : null))
  return { ...plan, cycle: { ath: a.ath, athDate: a.athDate }, used, updatedAt: Date.now() }
}

function maxDrawdownOf(a, price) {
  const dd = a.ath > 0 ? Math.max(0, (a.ath - price) / a.ath) : 0
  const lowDd = a.low != null && a.ath > 0 ? Math.max(0, (a.ath - a.low) / a.ath) : 0
  return Math.max(dd, lowDd)
}

export function evaluate(planIn, { stockValue, poolValue, price, hist }) {
  const plan = normalizePlan(planIn)
  const p = plan.params
  const a = resolveAth(plan, hist, price)
  if (!a || !(price > 0)) return { ready: false, reason: a ? '抓不到 00631L 現價' : '還沒有 00631L 的歷史高點資料（可在設定手動輸入高點）' }

  // ---- 新一輪：創新高就全部重新開放 ----
  let next = plan
  let changed = false
  if (!plan.cycle) {
    next = initCycle(plan, hist, price)
    changed = true
  } else if (a.ath > plan.cycle.ath + EPS) {
    next = { ...plan, cycle: { ath: a.ath, athDate: a.athDate }, used: p.levels.map(() => null) }
    changed = true
  } else if (a.ath < plan.cycle.ath - EPS) {
    next = { ...plan, cycle: { ath: a.ath, athDate: a.athDate } } // 高點被手動調低：不重置倉位
    changed = true
  }

  const V = Math.max(0, stockValue || 0)
  const C = Math.max(0, poolValue || 0)
  const total = V + C
  const ratio = total > 0 ? V / total : null
  const ratioPct = ratio == null ? null : ratio * 100

  // ---- 暫停買正二（有記憶：超過 80% 開啟，回到 70% 以下才解除）----
  let paused = next.paused
  if (ratioPct != null) {
    if (ratioPct > p.pauseAbovePct + EPS) paused = true
    else if (ratioPct <= p.targetPct + EPS) paused = false
  }
  if (paused !== next.paused) { next = { ...next, paused }; changed = true }

  // ---- 下跌加碼 ----
  const drawdown = Math.max(0, (a.ath - price) / a.ath)
  const maxDd = maxDrawdownOf(a, price)
  const tranches = p.levels.map((level, i) => {
    const triggerPrice = a.ath * (1 - level / 100)
    const usedInfo = next.used[i]
    let status
    if (usedInfo) status = 'used'
    else if (maxDd * 100 + EPS >= level) status = 'pending'
    else status = 'waiting'
    return { index: i, level, status, usedInfo, triggerPrice }
  })
  const pending = tranches.filter((t) => t.status === 'pending')
  const unused = tranches.filter((t) => t.status !== 'used').length
  const nextWaiting = tranches.find((t) => t.status === 'waiting') || null

  const actions = []

  // 再平衡：占比 > 90% 才賣，賣到 80%
  if (ratioPct != null && ratioPct > p.sellAbovePct + EPS) {
    const sellAmount = V - (p.sellToPct / 100) * total
    if (sellAmount > 0) actions.push({ type: 'sell', amount: round(sellAmount), shares: sellAmount / price, toPct: p.sellToPct })
  }

  // 下跌加碼：動用現金池的 k/剩餘倉數
  if (pending.length > 0 && unused > 0) {
    const amount = Math.min(C, (C * pending.length) / unused)
    actions.push({ type: 'deploy', indexes: pending.map((t) => t.index), levels: pending.map((t) => t.level), amount: round(amount), poolEmpty: C <= 0 })
  }

  // ---- 每月新增資金的去向 ----
  let monthly
  if (ratioPct == null) {
    monthly = { mode: 'split', stockPct: p.targetPct, poolPct: 100 - p.targetPct, reason: '還沒有持倉／現金池，先照預設比例' }
  } else if (paused) {
    const t = p.targetPct / 100
    monthly = { mode: 'pool', stockPct: 0, poolPct: 100, reason: `占比 ${ratioPct.toFixed(1)}% 偏高，暫停買正二，直到回到 ${p.targetPct}% 左右`, needAmount: Math.max(0, round(V / t - V - C)) }
  } else if (ratioPct < p.allStockBelowPct - EPS) {
    const t = p.targetPct / 100
    monthly = { mode: 'stock', stockPct: 100, poolPct: 0, reason: `占比 ${ratioPct.toFixed(1)}% 偏低，新資金全買正二`, needAmount: Math.max(0, round((t * C) / (1 - t) - V)) }
  } else {
    monthly = { mode: 'split', stockPct: p.targetPct, poolPct: 100 - p.targetPct, reason: `占比 ${ratioPct.toFixed(1)}%，照 ${p.targetPct}:${100 - p.targetPct} 分配` }
  }
  if (p.monthly > 0) {
    monthly.stockAmount = round((p.monthly * monthly.stockPct) / 100)
    monthly.poolAmount = p.monthly - monthly.stockAmount
  }

  const headline = actions.find((x) => x.type === 'sell') ? 'sell' : actions.find((x) => x.type === 'deploy') ? 'deploy' : monthly.mode

  return {
    ready: true,
    plan: next,
    changed,
    ath: a.ath,
    athDate: a.athDate,
    manualAth: a.manual,
    price,
    drawdown,
    maxDrawdown: maxDd,
    stockValue: V,
    poolValue: C,
    ratio,
    paused,
    tranches,
    nextTrigger: nextWaiting,
    actions,
    monthly,
    headline,
  }
}

// 使用者按「我已執行」：把這幾倉標成這一輪已動用
export function markUsed(planIn, indexes, { price, amount, date }) {
  const plan = normalizePlan(planIn)
  const used = plan.used.map((u, i) => (indexes.includes(i) ? { date, price, amount: amount != null ? Math.round(amount / indexes.length) : null } : u))
  return { ...plan, used, updatedAt: Date.now() }
}

// 設定頁手動修正某一倉：已動用 ↔ 可用
export function toggleUsed(planIn, index, date) {
  const plan = normalizePlan(planIn)
  const used = plan.used.map((u, i) => (i === index ? (u ? null : { date, price: null, amount: null, manual: true }) : u))
  return { ...plan, used, updatedAt: Date.now() }
}
