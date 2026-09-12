import { db } from './db'
import { holdingIsCashLike } from './calc'

// 唯一的資料存取層。畫面一律透過 store.* 讀寫，不直接碰資料庫實作。
// 未來要跨裝置同步時，複製一份 store 換成 Supabase 版本即可，介面不變。

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2))

// 股票／加密貨幣／基金：一檔只留一筆記錄（不再逐筆存交易），成本由使用者自己編輯，
// 不是自動算的。以下兩個是共用的合併邏輯，只能在已經開啟的 db.transaction 裡呼叫。

// 找同分類＋同代號、還沒刪除的既有持股（代號比對不分大小寫）
async function findSymbolHolding(category, symbol) {
  const sym = String(symbol || '').toUpperCase()
  if (!sym) return null
  const all = await db.holdings.where('category').equals(category).toArray()
  return all.find((h) => !h.deleted && String(h.symbol || '').toUpperCase() === sym) || null
}

// 併入既有持股：數量相加、成本相加（兩邊都沒填成本就維持不填，不會憑空冒出 0），留一筆變動紀錄；
// 找不到既有持股就新增一筆，並在 history 記下起始數量
async function upsertSymbolHolding(rec, now, note) {
  const existing = holdingIsCashLike(rec) ? null : await findSymbolHolding(rec.category, rec.symbol)
  if (existing) {
    const beforeQty = Number(existing.quantity || 0)
    const addedQty = Number(rec.quantity || 0)
    const afterQty = beforeQty + addedQty
    const beforeCost = Number(existing.totalCost || 0)
    const addedCost = Number(rec.totalCost || 0)
    const entry = { id: uid(), type: 'delta', before: beforeQty, after: afterQty, delta: addedQty, note: note || '加碼', at: now }
    await db.holdings.update(existing.id, {
      quantity: afterQty,
      totalCost: (beforeCost || addedCost) ? beforeCost + addedCost : undefined,
      price: rec.price || existing.price,
      icon: existing.icon || rec.icon,
      history: [...(existing.history || []), entry],
      updatedAt: now,
    })
    return existing.id
  }
  const initQty = Number(rec.quantity || 0)
  const id = uid()
  await db.holdings.add({
    ...rec, id, deleted: false, updatedAt: now,
    history: initQty ? [{ id: uid(), type: 'set', before: 0, after: initQty, delta: initQty, note: note || '新增', at: now }] : [],
  })
  return id
}

export const store = {
  // ---- 持倉 / 負債 ----
  async listHoldings() {
    return db.holdings.orderBy('updatedAt').reverse().toArray()
  },
  async addHolding(h) {
    const rec = { ...h, id: uid(), deleted: false, updatedAt: Date.now() }
    await db.holdings.add(rec)
    return rec
  },
  // 新增持股用這個而不是 addHolding：股票／加密貨幣／基金如果已經有同代號的持股，
  // 併入既有那筆（數量、成本相加）而不是另外開一筆——這樣同一檔永遠只有一筆記錄。
  // 現金／銀行／負債沒有代號，此方法對它們等同直接新增。
  async addOrMergeSymbolHolding(rec) {
    const now = Date.now()
    let id
    await db.transaction('rw', db.holdings, async () => {
      id = await upsertSymbolHolding(rec, now)
    })
    return db.holdings.get(id)
  },
  async updateHolding(id, patch) {
    await db.holdings.update(id, { ...patch, updatedAt: Date.now() })
  },
  async deleteHolding(id) {
    // 軟刪除：標記 deleted 並更新時間，讓刪除也能同步到其他裝置
    await db.holdings.update(id, { deleted: true, updatedAt: Date.now() })
  },
  async deleteHoldings(ids) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      for (const id of ids) await db.holdings.update(id, { deleted: true, updatedAt: now })
    })
  },

  // ---- 已刪除（垃圾桶）----
  async listDeleted() {
    return db.holdings.filter((h) => !!h.deleted && !h.purged).toArray()
  },
  async restoreHolding(id) {
    await db.holdings.update(id, { deleted: false, updatedAt: Date.now() })
  },
  async restoreHoldings(ids) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      for (const id of ids) await db.holdings.update(id, { deleted: false, updatedAt: now })
    })
  },
  // 永久刪除：改成標記 purged 墓碑（deleted+purged），並更新時間一起同步。
  // 不能直接硬刪本機/雲端——否則另一台裝置上那筆還在，會被誤認為「它獨有的新資料」而重新上傳，導致復活。
  // purged 的資料在垃圾桶和正常列表都不會顯示，等於徹底消失，但墓碑會通知所有裝置一起清掉。
  async purgeHoldings(ids) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      for (const id of ids) await db.holdings.update(id, { deleted: true, purged: true, updatedAt: now })
    })
  },

  // ---- 交易：一次動到兩邊（買入 / 賣出 / 轉帳）----
  // 全部包在同一個交易裡，避免只成功一半導致帳目對不起來。

  // 買入：從帳戶扣款，併入（或新增）持股
  async applyBuy({ sourceId, deduct, holding }) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      const src = await db.holdings.get(sourceId)
      if (!src) throw new Error('找不到扣款帳戶')
      await db.holdings.update(sourceId, {
        quantity: Number(src.quantity || 0) - Number(deduct || 0),
        updatedAt: now,
      })
      await upsertSymbolHolding(holding, now, '買入')
    })
  },

  // 賣出：依買入日期先進先出扣減股數（成本同比例扣減，讓剩下部位的成本均價維持正確），
  // 賣完的那一筆軟刪除；款項加進指定帳戶。
  async applySell({ lots, sellQty, destId, credit }) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      let remain = Number(sellQty || 0)
      const ordered = [...lots].sort((a, b) => String(a.buyDate || '').localeCompare(String(b.buyDate || '')))
      for (const lot of ordered) {
        if (remain <= 0) break
        const have = Number(lot.quantity || 0)
        if (have <= 0) continue
        const take = Math.min(have, remain)
        remain -= take
        const left = have - take
        const ratio = have ? left / have : 0
        if (left <= 0.00000001) {
          await db.holdings.update(lot.id, { quantity: 0, deleted: true, updatedAt: now })
        } else {
          await db.holdings.update(lot.id, {
            quantity: left,
            // 成本同比例縮減，剩下部位的成本均價才不會失真
            ...(lot.totalCost ? { totalCost: Number(lot.totalCost) * ratio } : {}),
            updatedAt: now,
          })
        }
      }
      const dest = await db.holdings.get(destId)
      if (!dest) throw new Error('找不到入帳帳戶')
      await db.holdings.update(destId, {
        quantity: Number(dest.quantity || 0) + Number(credit || 0),
        updatedAt: now,
      })
    })
  },

  // 轉帳：A 帳戶扣、B 帳戶加（跨幣別時兩邊金額各自填）
  async applyTransfer({ fromId, fromAmount, toId, toAmount }) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      const from = await db.holdings.get(fromId)
      const to = await db.holdings.get(toId)
      if (!from || !to) throw new Error('找不到帳戶')
      await db.holdings.update(fromId, {
        quantity: Number(from.quantity || 0) - Number(fromAmount || 0),
        updatedAt: now,
      })
      await db.holdings.update(toId, {
        quantity: Number(to.quantity || 0) + Number(toAmount || 0),
        updatedAt: now,
      })
    })
  },

  // 調整現金類項目的餘額，並在 history 留一筆紀錄（帳本的「變動紀錄」用）。
  // mode 'delta'：value 是增減的量（可正可負）；mode 'set'：value 是改完後的餘額本身。
  async adjustHolding(id, value, { mode = 'delta', note } = {}) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      const h = await db.holdings.get(id)
      if (!h) throw new Error('找不到這筆資料')
      const before = Number(h.quantity || 0)
      const after = mode === 'set' ? Number(value || 0) : before + Number(value || 0)
      const entry = { id: uid(), type: mode, before, after, delta: after - before, note: note || '', at: now }
      const history = [...(h.history || []), entry]
      await db.holdings.update(id, { quantity: after, history, updatedAt: now })
    })
  },

  // 一次性遷移：把「同一檔分好幾筆買入」的舊資料合併成一筆，逐筆買入轉成 history 紀錄
  // （數量、成本原封不動地保留下來，只是換個放法）。之後新增/加碼都會自動合併，
  // 不會再變成好幾筆，這個只是把舊資料收乾淨，可以放心重複執行（沒有多筆的分類不會被動到）。
  async mergeAllSymbolLots() {
    const now = Date.now()
    const merged = []
    await db.transaction('rw', db.holdings, async () => {
      const all = await db.holdings.filter((h) => !h.deleted).toArray()
      const groups = new Map()
      for (const h of all) {
        if (holdingIsCashLike(h) || !h.symbol) continue
        const key = h.category + ':' + String(h.symbol).toUpperCase()
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(h)
      }
      for (const [key, lots] of groups) {
        if (lots.length < 2) continue
        const ordered = [...lots].sort((a, b) => String(a.buyDate || '').localeCompare(String(b.buyDate || '')))
        let qty = 0
        let cost = 0
        let anyCost = false
        const history = []
        for (const lot of ordered) {
          const before = qty
          qty += Number(lot.quantity || 0)
          if (lot.totalCost) { cost += Number(lot.totalCost); anyCost = true }
          history.push({
            id: uid(), type: 'delta', before, after: qty, delta: Number(lot.quantity || 0),
            note: lot.buyDate ? `原始買入 ${lot.buyDate}` : '原始買入',
            at: lot.buyDate ? new Date(lot.buyDate).getTime() : now,
          })
        }
        const keep = ordered[0]
        await db.holdings.update(keep.id, {
          quantity: qty,
          totalCost: anyCost ? cost : undefined,
          history: [...(keep.history || []), ...history],
          updatedAt: now,
        })
        for (const lot of ordered.slice(1)) {
          await db.holdings.update(lot.id, { deleted: true, updatedAt: now })
        }
        merged.push({ key, lots: lots.length, qty, cost: anyCost ? cost : null })
      }
    })
    return merged
  },

  // ---- 設定（例如 USD/TWD 匯率）----
  async getSetting(key, fallback) {
    const r = await db.settings.get(key)
    return r ? r.value : fallback
  },
  async setSetting(key, value) {
    await db.settings.put({ key, value })
  },

  // ---- 每日淨值快照（第 3 階段會用到）----
  async listSnapshots() {
    return db.snapshots.orderBy('date').toArray()
  },
  async putSnapshot(s) {
    const rec = { ...s, id: s.id || uid() }
    await db.snapshots.put(rec)
    return rec
  },

  // ---- 備份 / 還原 ----
  async exportAll() {
    const [holdings, snapshots, settings] = await Promise.all([
      db.holdings.filter((h) => !h.deleted).toArray(),
      db.snapshots.toArray(),
      db.settings.toArray(),
    ])
    return { version: 1, exportedAt: new Date().toISOString(), holdings, snapshots, settings }
  },
  async importAll(data) {
    await db.transaction('rw', db.holdings, db.snapshots, db.settings, async () => {
      await Promise.all([db.holdings.clear(), db.snapshots.clear(), db.settings.clear()])
      if (data.holdings?.length) await db.holdings.bulkPut(data.holdings)
      if (data.snapshots?.length) await db.snapshots.bulkPut(data.snapshots)
      if (data.settings?.length) await db.settings.bulkPut(data.settings)
    })
  },

  // 清空所有持倉與走勢紀錄（本機），設定（匯率偏好等）保留。雲端同步的清空由呼叫端另外處理。
  async clearAll() {
    await db.transaction('rw', db.holdings, db.snapshots, async () => {
      await Promise.all([db.holdings.clear(), db.snapshots.clear()])
    })
  },
}
