// 金額隱藏開關：單一旗標，供 calc.js 的格式化函式讀取，
// 畫面上任何地方呼叫 fmtTwd/fmtSignedTwd 都會自動套用，不用逐一修改元件。
const KEY = 'nwapp:hideAmounts'
const listeners = new Set()

let hidden = false
try {
  hidden = localStorage.getItem(KEY) === '1'
} catch {}

export function getHideAmounts() {
  return hidden
}

export function setHideAmounts(v) {
  hidden = !!v
  try {
    localStorage.setItem(KEY, hidden ? '1' : '0')
  } catch {}
  listeners.forEach((fn) => fn())
}

export function toggleHideAmounts() {
  setHideAmounts(!hidden)
}

export function subscribeHideAmounts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
