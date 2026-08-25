import { DEBT_TYPES } from './debtTypes'

export const DEBT_LABEL = Object.fromEntries(DEBT_TYPES.map(([k, l]) => [k, l]))
export const DEBT_ORDER = DEBT_TYPES.map(([k]) => k)

// 依代號分組（股票/加密貨幣現貨），同代號內依買入日期排序
export function groupBySymbol(items) {
  const map = new Map()
  for (const h of items) {
    const key = h.symbol ? h.symbol.toUpperCase() : '__' + h.id
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.buyDate || '').localeCompare(String(b.buyDate || '')))
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

// 依負債子分類分組（沒選過子分類的舊資料歸到「其他」）
export function groupDebtBySubtype(items) {
  const map = new Map()
  for (const h of items) {
    const key = DEBT_LABEL[h.subtype] ? h.subtype : 'other'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  return [...map.entries()].sort((a, b) => DEBT_ORDER.indexOf(a[0]) - DEBT_ORDER.indexOf(b[0]))
}

// 依銀行名稱分組
export function groupByBank(items) {
  const map = new Map()
  for (const h of items) {
    const key = h.bankName || '未指定銀行'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(h)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
}
