import { supabase } from './supabase'
import { db } from './db'

// 本機優先同步：資料一律即時存在 IndexedDB，這裡在背景跟 Supabase 對帳。
// 規則：同一筆以 updatedAt 較晚的為準（last-write-wins）。
// 刪除不是真的刪掉，而是標記 deleted=true 一起同步，其他裝置拉到後才移除，
// 這樣刪除才能正確傳到別台。

let running = false

export async function syncNow(userId) {
  if (!supabase || !userId || running) return
  running = true
  try {
    await syncTable('holdings', db.holdings, userId, true)
    await syncTable('snapshots', db.snapshots, userId, false)
  } catch (e) {
    console.warn('同步失敗：', e.message)
  } finally {
    running = false
  }
}

async function syncTable(name, table, userId, hasDelete) {
  const { data: remote, error } = await supabase.from(name).select('*').eq('user_id', userId)
  if (error) throw error

  const remoteMap = new Map((remote || []).map((r) => [r.id, r]))
  const local = await table.toArray()
  const localMap = new Map(local.map((x) => [x.id, x]))

  // 拉：雲端較新的覆蓋本機
  const pull = []
  for (const r of remote || []) {
    const l = localMap.get(r.id)
    const ru = new Date(r.updated_at).getTime()
    if (!l || ru > (l.updatedAt || 0)) {
      pull.push({ ...r.data, id: r.id, updatedAt: ru })
    }
  }
  if (pull.length) await table.bulkPut(pull)

  // 推：本機較新的送上雲端
  const upserts = []
  for (const x of local) {
    const r = remoteMap.get(x.id)
    const ru = r ? new Date(r.updated_at).getTime() : -1
    if (!r || (x.updatedAt || 0) > ru) {
      upserts.push({
        id: String(x.id),
        user_id: userId,
        data: x,
        ...(hasDelete ? { deleted: !!x.deleted } : {}),
        updated_at: new Date(x.updatedAt || Date.now()).toISOString(),
      })
    }
  }
  if (upserts.length) {
    const { error: upErr } = await supabase.from(name).upsert(upserts, { onConflict: 'user_id,id' })
    if (upErr) throw upErr
  }
}
