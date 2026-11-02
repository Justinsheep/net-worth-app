// 投資規則運算核心的測試：node --test scripts/test-plan.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { newPlan, evaluate, initCycle, markUsed, toggleUsed } from '../src/plan.js'

const hist = (over = {}) => ({ ath: 100, athDate: '2026-01-02', low: 100, lowDate: '2026-01-02', last: 100, lastDate: '2026-10-01', ...over })
const mk = (over = {}) => {
  const p = initCycle({ ...newPlan(), enabled: true, poolId: 'x', ...over }, hist(), 100)
  return p
}

test('跌幅沒到 10%：不動用，新資金 7:3', () => {
  const r = evaluate(mk(), { stockValue: 700, poolValue: 300, price: 95, hist: hist({ low: 95 }) })
  assert.equal(r.headline, 'split')
  assert.equal(r.tranches[0].status, 'waiting')
  assert.equal(r.nextTrigger.level, 10)
  assert.equal(r.nextTrigger.triggerPrice, 90)
})

test('跌破 10%：動用第 1 倉 = 現金池 ÷ 5', () => {
  const r = evaluate(mk(), { stockValue: 630, poolValue: 300, price: 90, hist: hist({ low: 90 }) })
  assert.equal(r.headline, 'deploy')
  const d = r.actions.find((a) => a.type === 'deploy')
  assert.deepEqual(d.indexes, [0])
  assert.equal(d.amount, 60) // 300 / 5
})

test('一次跌破兩個門檻：動兩倉 = 現金池 × 2/5', () => {
  const r = evaluate(mk(), { stockValue: 546, poolValue: 300, price: 78, hist: hist({ low: 78 }) })
  const d = r.actions.find((a) => a.type === 'deploy')
  assert.deepEqual(d.indexes, [0, 1])
  assert.equal(d.amount, 120)
})

test('第 1 倉用過後，第 2 倉 = 剩餘現金池 ÷ 剩餘倉數', () => {
  let plan = mk()
  plan = markUsed(plan, [0], { price: 90, amount: 60, date: '2026-10-02' })
  const r = evaluate(plan, { stockValue: 600, poolValue: 240, price: 80, hist: hist({ low: 80 }) })
  const d = r.actions.find((a) => a.type === 'deploy')
  assert.deepEqual(d.indexes, [1])
  assert.equal(d.amount, 60) // 240 / 4
})

test('跌過又漲回來：觸發過的倉仍待執行（每倉只觸發一次、不漏掉）', () => {
  const r = evaluate(mk(), { stockValue: 700, poolValue: 300, price: 96, hist: hist({ low: 85 }) })
  const d = r.actions.find((a) => a.type === 'deploy')
  assert.deepEqual(d.indexes, [0])
})

test('創新高：新一輪，所有倉重新開放', () => {
  let plan = mk()
  plan = markUsed(plan, [0, 1], { price: 80, amount: 120, date: '2026-10-02' })
  const r = evaluate(plan, { stockValue: 800, poolValue: 300, price: 110, hist: hist({ ath: 110, athDate: '2026-10-20', low: 110, last: 110 }) })
  assert.equal(r.changed, true)
  assert.ok(r.plan.used.every((u) => u === null))
  assert.equal(r.plan.cycle.ath, 110)
})

test('占比超過 80%：全進現金池並暫停；回到 70% 以下才解除', () => {
  let r = evaluate(mk(), { stockValue: 850, poolValue: 150, price: 100, hist: hist() })
  assert.equal(r.monthly.mode, 'pool')
  assert.equal(r.paused, true)
  assert.equal(r.monthly.needAmount, Math.round(850 / 0.7 - 850 - 150)) // 214
  // 暫停中、占比 75%（介於 70~80）：仍然全進現金池
  r = evaluate(r.plan, { stockValue: 750, poolValue: 250, price: 100, hist: hist() })
  assert.equal(r.monthly.mode, 'pool')
  // 降到 70% 以下：解除，恢復 7:3
  r = evaluate(r.plan, { stockValue: 690, poolValue: 310, price: 100, hist: hist() })
  assert.equal(r.paused, false)
  assert.equal(r.monthly.mode, 'split')
})

test('占比低於 65%：新資金全買正二', () => {
  const r = evaluate(mk(), { stockValue: 600, poolValue: 400, price: 100, hist: hist() })
  assert.equal(r.monthly.mode, 'stock')
})

test('占比超過 90%：賣到 80%，賣出所得放回現金池', () => {
  const r = evaluate(mk(), { stockValue: 920, poolValue: 80, price: 100, hist: hist() })
  assert.equal(r.headline, 'sell')
  const s = r.actions.find((a) => a.type === 'sell')
  assert.equal(s.amount, 120) // 920 - 0.8 * 1000
  assert.equal(s.shares, 1.2)
})

test('每月金額：7:3 與全進現金池的金額', () => {
  const r = evaluate(mk({ params: { ...newPlan().params, monthly: 10000 } }), { stockValue: 700, poolValue: 300, price: 100, hist: hist() })
  assert.equal(r.monthly.stockAmount, 7000)
  assert.equal(r.monthly.poolAmount, 3000)
})

test('啟用時依歷史已觸發的倉預設標成已動用', () => {
  const p = initCycle({ ...newPlan(), enabled: true }, hist({ low: 75 }), 85)
  assert.ok(p.used[0] && p.used[1])
  assert.equal(p.used[2], null)
})

test('手動切換某一倉的狀態', () => {
  let p = mk()
  p = toggleUsed(p, 2, '2026-10-02')
  assert.ok(p.used[2])
  p = toggleUsed(p, 2, '2026-10-02')
  assert.equal(p.used[2], null)
})

test('沒有高點資料：回報尚未就緒', () => {
  const r = evaluate(mk(), { stockValue: 1, poolValue: 1, price: 100, hist: null })
  assert.equal(r.ready, false)
})

// ---- 歷史收盤的分割還原（scripts/hist.mjs）----
import { adjustForSplits, summarize } from './hist.mjs'

test('分割 1 拆 22：用漲跌價差反推參考價，還原分割前的收盤與高點', () => {
  // 分割前最後一天收盤 440；分割後第一天參考價 = 440/22 = 20，收盤 21（漲 +1）
  const rows = [
    ['2026-03-23', 400, 5],
    ['2026-03-24', 440, 40], // 分割前的歷史高點（原始價）
    ['2026-03-31', 21, 1], // 分割日：漲跌價差是相對「參考價 20」
    ['2026-04-01', 22, 1],
    ['2026-04-02', 19, -3],
  ]
  const { adj, splits } = adjustForSplits(rows)
  assert.equal(splits.length, 1)
  assert.equal(splits[0].date, '2026-03-31')
  assert.equal(splits[0].factor, 22)
  assert.ok(Math.abs(adj[1][1] - 20) < 1e-9) // 440 還原成 20
  const s = summarize(adj)
  assert.equal(s.ath, 22) // 還原後的高點是 04/01 的 22，不是 3/24 的 440
  assert.equal(s.athDate, '2026-04-01')
  assert.equal(s.low, 19)
})

test('沒有分割：原始價不變', () => {
  const rows = [['2026-01-02', 10, 0.5], ['2026-01-03', 11, 1], ['2026-01-04', 9.9, -1.1]]
  const { adj, splits } = adjustForSplits(rows)
  assert.equal(splits.length, 0)
  assert.deepEqual(adj, [['2026-01-02', 10], ['2026-01-03', 11], ['2026-01-04', 9.9]])
})

test('盤中即時價衝過高點但收盤高點沒變：不算創新高、不重置這一輪', () => {
  let plan = mk()
  plan = markUsed(plan, [0], { price: 90, amount: 60, date: '2026-10-02' })
  const r = evaluate(plan, { stockValue: 700, poolValue: 300, price: 103, hist: hist() }) // 高點收盤 100，盤中 103
  assert.equal(r.changed, false)
  assert.ok(r.plan.used[0])
  assert.equal(r.drawdown, 0)
})
