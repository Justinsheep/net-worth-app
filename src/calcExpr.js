// 安全的算式計算：只認數字和 + - * / ( )，用遞迴下降解析，不使用 eval。
// 解析失敗回傳 null。
export function evalExpr(input) {
  const s = String(input ?? '')
  if (!/^[0-9+\-*/(). ]*$/.test(s)) return null
  let i = 0
  const skip = () => { while (s[i] === ' ') i++ }
  function expr() {
    let v = term(); if (v == null) return null; skip()
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++]; const t = term(); if (t == null) return null
      v = op === '+' ? v + t : v - t; skip()
    }
    return v
  }
  function term() {
    let v = factor(); if (v == null) return null; skip()
    while (s[i] === '*' || s[i] === '/') {
      const op = s[i++]; const f = factor(); if (f == null) return null
      v = op === '*' ? v * f : v / f; skip()
    }
    return v
  }
  function factor() {
    skip()
    if (s[i] === '(') { i++; const v = expr(); skip(); if (s[i] !== ')') return null; i++; return v }
    if (s[i] === '-') { i++; const f = factor(); return f == null ? null : -f }
    if (s[i] === '+') { i++; return factor() }
    const start = i
    while (/[0-9.]/.test(s[i] || '')) i++
    if (i === start) return null
    const n = Number(s.slice(start, i))
    return Number.isFinite(n) ? n : null
  }
  const r = expr(); skip()
  if (i !== s.length) return null
  return r == null || !Number.isFinite(r) ? null : r
}
