import { db } from './db'

// 唯一的資料存取層。畫面一律透過 store.* 讀寫，不直接碰資料庫實作。
// 未來要跨裝置同步時，複製一份 store 換成 Supabase 版本即可，介面不變。

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2))

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

  // 買入：從帳戶扣款，並新增一筆持倉
  async applyBuy({ sourceId, deduct, holding }) {
    const now = Date.now()
    await db.transaction('rw', db.holdings, async () => {
      const src = await db.holdings.get(sourceId)
      if (!src) throw new Error('找不到扣款帳戶')
      await db.holdings.update(sourceId, {
        quantity: Number(src.quantity || 0) - Number(deduct || 0),
        updatedAt: now,
      })
      await db.holdings.add({ ...holding, id: uid(), deleted: false, updatedAt: now })
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
