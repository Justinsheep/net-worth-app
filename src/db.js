import Dexie from 'dexie'

// 本機資料庫。之後要換 Supabase 同步時，只要改 store.js，這裡與畫面都不用動。
export const db = new Dexie('netWorthDB')

db.version(1).stores({
  // id 為主鍵；後面欄位是額外索引
  holdings: 'id, category, updatedAt',
  snapshots: 'id, date',
  settings: 'key',
})
