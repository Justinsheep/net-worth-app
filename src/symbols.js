// 載入 public/symbols.json 並提供搜尋。清單抓不到時回傳空陣列，
// 代號欄就自動退回純手打，不會壞掉。

let cache = null
let loading = null

export function loadSymbols() {
  if (cache) return Promise.resolve(cache)
  if (loading) return loading
  loading = fetch(import.meta.env.BASE_URL + 'symbols.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      cache = d || { tw_stock: [], crypto: [] }
      return cache
    })
    .catch(() => {
      cache = { tw_stock: [], crypto: [] }
      return cache
    })
  return loading
}

// 代號開頭符合的排前面，其次是代號/名稱包含關鍵字的
export function searchSymbols(list, query, limit = 30) {
  const q = String(query || '').trim().toUpperCase()
  if (!q || !list) return []
  const starts = []
  const contains = []
  for (const it of list) {
    const code = it.code.toUpperCase()
    const name = it.name.toUpperCase()
    if (code.startsWith(q)) starts.push(it)
    else if (code.includes(q) || name.includes(q)) contains.push(it)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}
