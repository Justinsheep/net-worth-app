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
